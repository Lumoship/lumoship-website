// =============================================================================
// 62-dnv-loads.js — DNV RU-SHIP Pt 3 Ch 4: yükler (M3)
//   Sec 2  dinamik yük durumları + yük kombinasyon katsayıları (Table 4/5/6)
//   Sec 3  f_ps, f_T, roll (T_θ, θ), k_r/GM varsayılanları
//   Sec 4  M_wv/Q_wv yük durumu değerleri ([3.5]) — temel M_wv/Q_wv 61-dnv-core'da
//   Sec 5  dış deniz basıncı P_S + P_W (HSM/HSA/FSM/BSR/BSP/OST/OSA), yük noktasında
//   Sec 6  statik tank basınçları P_ls-1/-3/-4/-ST
//   Ch 6 Sec 2 Table 1 yük setleri (SEA-1/2, WB-1..4) → P ve kabul ölçütü (AC)
//   Ch 5 Sec 3 [2.1.1] yük durumu başına σ_hg (net50 kesit)
// SAF (DOM yok). Doğrulama: _dev/dnv-ref/verify-dnv.js. Her formülün yanında madde no.
// Not: Nauticus (Temmuz 2022) ile birebir; metin Temmuz 2026 — fark bulunursa fikstür esas.
// =============================================================================
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(typeof require === 'function' ? require('./61-dnv-core.js') : root.DNV);
  else root.DNVLoads = factory(root.DNV);
})(typeof self !== 'undefined' ? self : this, function (DNV) {
  'use strict';
  const RHO_G = 1.025 * 9.81;                       // deniz suyu, kN/m³
  const G = 9.81;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (x, pts) => { if (x <= pts[0][0]) return pts[0][1]; for (let i = 1; i < pts.length; i++) if (x <= pts[i][0]) { const [x0, y0] = pts[i - 1], [x1, y1] = pts[i]; return y0 + (y1 - y0) * (x - x0) / (x1 - x0); } return pts[pts.length - 1][1]; };

  // ------------------------------------------------------------ Sec 3: temel oranlar
  // f_T = T_LC/T_SC, 0.5 ≤ f_T ≤ 1.0 ; f_xL = x/L (0…1) ; L0 = max(L, 110) (Ch 1 Sec 4)
  const fT = (TLC, TSC) => clamp(TLC / TSC, 0.5, 1.0);
  const fxL = (x, L) => clamp(x / L, 0, 1);
  const L0 = L => Math.max(L, 110);
  // f_ps: 1.0 extreme sea (R0); f_r servis kısıtı; 0.8 balast suyu değişimi
  const fps = (scenario, fr) => (scenario === 'BWE' ? 0.8 : 1.0) * (fr == null ? 1 : fr);
  // [2.1.1] roll: k_r = 0.39 B, GM = 0.07 B (genel varsayılanlar), f_BK 1.0 bilge keel varsa
  // Varsayılanlar: Ch 4 Sec 3 [2.1.1] genel k_r 0.39 B / GM 0.07 B ; tanker balast 0.35 B / 0.12 B ;
  //   Pt 5 Ch 1 Sec 2 Table 4 (bulk carrier / dry cargo — Nauticus "Bulk carriers and dry cargo ships"): tam yük 0.35 B / 0.12 B
  //   Pt 5 Ch 1 Sec 2 Table 4 (dökme yük / kuru yük): tam yük homojen 0,35/0,12 ; homojen ağır yük kısmi dolu 0,42/0,25 ;
  //   alternatif ağır yük 0,40/0,20 ; ağır balast (T_BAL-H) 0,40/0,25 ; normal balast (T_BAL) 0,45/0,33  (fikstür: LD / HD / Ballast)
  const ROLL_DEFAULT = { general: [0.39, 0.07], bulkFull: [0.35, 0.12], bulkHeavyPartial: [0.42, 0.25], bulkAltHeavy: [0.40, 0.20],
                         bulkHeavyBallast: [0.40, 0.25], bulkBallast: [0.45, 0.33], tankerBallast: [0.35, 0.12] };
  function roll(B, opts) {
    const d = ROLL_DEFAULT[(opts && opts.shipType) || 'general'] || ROLL_DEFAULT.general;
    const kr = (opts && opts.kr) || d[0] * B, GM = Math.max((opts && opts.GM) || d[1] * B, 0.05 * B);
    const Ttheta = 2.3 * Math.PI * kr / Math.sqrt(G * GM);
    const fBK = (opts && opts.bilgeKeel === false) ? 1.2 : 1.0, fp = (opts && opts.fps) || 1.0;
    const theta = 9000 * (1.4 - 0.035 * Ttheta) * fp * fBK / ((1.15 * B + 55) * Math.PI);
    return { kr, GM, Ttheta, theta, fBK };
  }

  // ------------------------------------------------------------ Sec 2: yük kombinasyon katsayıları (mukavemet)
  // C_WV (düşey dalga momenti), C_QW (kesme, f_lp hariç), C_WH (yatay moment)  — Table 4/5/6
  //   Sıra: [C_WV, C_QW(f_lp hariç), C_WH, C_XS, C_XP, C_XG, C_YS, C_YR, C_YG, C_ZH, C_ZR, C_ZP]  (Table 4/5/6, mukavemet)
  //   C_XP HSM: ∓(0.15 + L1/300), L1 = min(L, 250) (Ch 1 Sec 4)
  function LCF(lc, ft, L) {
    const L1 = Math.min(L == null ? 120 : L, 250), cxp = 0.15 + L1 / 300;
    const T = {
      'HSM-1': [-1, -1, 0, 0.6 - 0.2 * ft, -cxp, 0.6, 0, 0, 0, 0.5 * ft - 0.15, 0, -0.7],
      'HSM-2': [1, 1, 0, 0.2 * ft - 0.6, cxp, -0.6, 0, 0, 0, 0.15 - 0.5 * ft, 0, 0.7],
      'HSA-1': [-0.7, -0.6, 0, 0.2, -1.0, 0.4 * ft + 0.1, 0, 0, 0, 0.4, 0, -1.0],
      'HSA-2': [0.7, 0.6, 0, -0.2, 1.0, -0.4 * ft - 0.1, 0, 0, 0, -0.4, 0, 1.0],
      'FSM-1': [-0.4 * ft - 0.6, -1, 0, 0.2 - 0.4 * ft, 0.15, -0.2, 0, 0, 0, 0, 0, 0.15],
      'FSM-2': [0.4 * ft + 0.6, 1, 0, 0.4 * ft - 0.2, -0.15, 0.2, 0, 0, 0, 0, 0, -0.15],
      'BSR-1P': [0.1 - 0.2 * ft, 0.1 - 0.2 * ft, 1.2 - 1.1 * ft, 0, 0, 0, 0.2 - 0.2 * ft, 1, -1, 0.7 - 0.4 * ft, 1, 0],
      'BSR-2P': [0.2 * ft - 0.1, 0.2 * ft - 0.1, 1.1 * ft - 1.2, 0, 0, 0, 0.2 * ft - 0.2, -1, 1, 0.4 * ft - 0.7, -1, 0],
      'BSR-1S': [0.1 - 0.2 * ft, 0.1 - 0.2 * ft, 1.1 * ft - 1.2, 0, 0, 0, 0.2 * ft - 0.2, -1, 1, 0.7 - 0.4 * ft, -1, 0],
      'BSR-2S': [0.2 * ft - 0.1, 0.2 * ft - 0.1, 1.2 - 1.1 * ft, 0, 0, 0, 0.2 - 0.2 * ft, 1, -1, 0.4 * ft - 0.7, 1, 0],
      'BSP-1P': [0.3 - 0.8 * ft, 0.3 - 0.8 * ft, 0.7 - 0.7 * ft, 0, 0.1 - 0.3 * ft, 0.3 * ft - 0.1, -0.9, 0.3, -0.2, 1, 0.3, 0.1 - 0.3 * ft],
      'BSP-2P': [0.8 * ft - 0.3, 0.8 * ft - 0.3, 0.7 * ft - 0.7, 0, 0.3 * ft - 0.1, 0.1 - 0.3 * ft, 0.9, -0.3, 0.2, -1, -0.3, 0.3 * ft - 0.1],
      'BSP-1S': [0.3 - 0.8 * ft, 0.3 - 0.8 * ft, 0.7 * ft - 0.7, 0, 0.1 - 0.3 * ft, 0.3 * ft - 0.1, 0.9, -0.3, 0.2, 1, -0.3, 0.1 - 0.3 * ft],
      'BSP-2S': [0.8 * ft - 0.3, 0.8 * ft - 0.3, 0.7 - 0.7 * ft, 0, 0.3 * ft - 0.1, 0.1 - 0.3 * ft, -0.9, 0.3, -0.2, -1, 0.3, 0.3 * ft - 0.1],
      'OST-1P': [-0.3 - 0.2 * ft, -0.35 - 0.2 * ft, -1, 0.1 * ft - 0.15, 0.7 - 0.3 * ft, 0.2 * ft - 0.45, 0, 0.4 * ft - 0.25, 0.1 - 0.2 * ft, 0.2 * ft - 0.05, 0.4 * ft - 0.25, 0.7 - 0.3 * ft],
      'OST-2P': [0.3 + 0.2 * ft, 0.35 + 0.2 * ft, 1, 0.15 - 0.1 * ft, 0.3 * ft - 0.7, 0.45 - 0.2 * ft, 0, 0.25 - 0.4 * ft, 0.2 * ft - 0.1, 0.05 - 0.2 * ft, 0.25 - 0.4 * ft, 0.3 * ft - 0.7],
      'OST-1S': [-0.3 - 0.2 * ft, -0.35 - 0.2 * ft, 1, 0.1 * ft - 0.15, 0.7 - 0.3 * ft, 0.2 * ft - 0.45, 0, 0.25 - 0.4 * ft, 0.2 * ft - 0.1, 0.2 * ft - 0.05, 0.25 - 0.4 * ft, 0.7 - 0.3 * ft],
      'OST-2S': [0.3 + 0.2 * ft, 0.35 + 0.2 * ft, -1, 0.15 - 0.1 * ft, 0.3 * ft - 0.7, 0.45 - 0.2 * ft, 0, 0.4 * ft - 0.25, 0.1 - 0.2 * ft, 0.05 - 0.2 * ft, 0.4 * ft - 0.25, 0.3 * ft - 0.7],
      'OSA-1P': [0.75 - 0.5 * ft, 0.6 - 0.4 * ft, 0.55 + 0.2 * ft, -0.45, 0.5, -0.8, -0.2 - 0.1 * ft, 0.3 - 0.2 * ft, 0.1 * ft - 0.2, -0.2 * ft, 0.3 - 0.2 * ft, 1.0],
      'OSA-2P': [-0.75 + 0.5 * ft, -0.6 + 0.4 * ft, -0.55 - 0.2 * ft, 0.45, -0.5, 0.8, 0.2 + 0.1 * ft, 0.2 * ft - 0.3, 0.2 - 0.1 * ft, 0.2 * ft, 0.2 * ft - 0.3, -1.0],
      'OSA-1S': [0.75 - 0.5 * ft, 0.6 - 0.4 * ft, -0.55 - 0.2 * ft, -0.45, 0.5, -0.8, 0.2 + 0.1 * ft, 0.2 * ft - 0.3, 0.2 - 0.1 * ft, -0.2 * ft, 0.2 * ft - 0.3, 1.0],
      'OSA-2S': [-0.75 + 0.5 * ft, -0.6 + 0.4 * ft, 0.55 + 0.2 * ft, 0.45, -0.5, 0.8, -0.2 - 0.1 * ft, 0.3 - 0.2 * ft, 0.1 * ft - 0.2, 0.2 * ft, 0.3 - 0.2 * ft, -1.0],
    }[lc];
    if (!T) throw new Error('LCF: bilinmeyen yük durumu ' + lc);
    return { CWV: T[0], CQW: T[1], CWH: T[2], CXS: T[3], CXP: T[4], CXG: T[5], CYS: T[6], CYR: T[7], CYG: T[8], CZH: T[9], CZR: T[10], CZP: T[11] };
  }
  const LOAD_CASES = ['HSM-1', 'HSM-2', 'HSA-1', 'HSA-2', 'FSM-1', 'FSM-2', 'BSR-1P', 'BSR-2P', 'BSR-1S', 'BSR-2S', 'BSP-1P', 'BSP-2P', 'BSP-1S', 'BSP-2S', 'OST-1P', 'OST-2P', 'OST-1S', 'OST-2S', 'OSA-1P', 'OSA-2P', 'OSA-1S', 'OSA-2S'];
  // Sec 4 semboller: f_β = 0.8 BSR/BSP (extreme sea), 1.0 diğer
  const fBeta = lc => /^BS[RP]/.test(lc) ? 0.8 : 1.0;
  // Sec 4 [3.5.2]: M_wv-LC = f_β·C_WV·M_wv-h (C_WV ≥ 0) ; f_β·C_WV·|M_wv-s| (C_WV < 0)
  function MwvLC(lc, ft, mwv) { const c = LCF(lc, ft).CWV; return fBeta(lc) * c * (c >= 0 ? mwv.hog : Math.abs(mwv.sag)); }

  // ------------------------------------------------------------ Sec 5 [1.2]: hidrostatik
  const Ps = (z, TLC) => z <= TLC ? RHO_G * (TLC - z) : 0;

  // ------------------------------------------------------------ Sec 5 [1.3]: dalga basıncı, yük noktası (x, y, z), kesit genişliği B_x
  // ship: {L, B, CB, TSC}; T: T_LC; y ≥ 0 iskele (P), y<0 sancak — formüller y'nin işaretine duyarlı (P/S)
  function Pw(lc, ship, T, x, y, z, Bx, scen) {
    const { L, B, CB } = ship, ft = fT(T, ship.TSC), fx = fxL(x, L), Cw = DNV.Cw(L), l0 = L0(L), fp = fps(scen);
    const fyB = Bx > 0 ? Math.min(1, Math.abs(2 * y) / Bx) : 1, fyB1 = Math.min(1, Math.abs(2 * y) / B);
    const Cx = 1.5 - Math.abs(x - 0.5 * L) / L;
    const fam = lc.slice(0, 3), sub = lc.slice(4);            // 'HSM','HSA','FSM','BSR','BSP','OST','OSA' ; '1','2','1P','2P','1S','2S'
    let Pdyn;                                                  // |P| büyüklüğü (işaret tablo satırından)
    const BWE = scen === 'BWE';
    if (fam === 'HSM' || fam === 'HSA') {
      const CfT = ft + 0.5 - (0.7 * ft - 0.2) * CB;
      const fnl = lerp(fx, BWE ? [[0, 0.85], [0.3, 0.95], [0.7, 0.95], [1, 0.8]] : [[0, 0.7], [0.3, 0.9], [0.7, 0.9], [1, 0.6]]);
      const fyz = Cx * z / T + (2 - Cx) * fyB + 1;
      const fh = (fam === 'HSM' ? 3.0 : 2.4) * (1.21 - 0.66 * ft);
      const ka = fx < 0.15 ? (0.5 + ft) * ((3 - 2 * Math.sqrt(fyB)) - 20 / 9 * fx * (7 - 6 * Math.sqrt(fyB))) + 2 / 3 * (1 - ft)
               : fx < 0.7 ? 1.0
               : 1 + (fx - 0.7) * ((40 / 3 * ft - 5) + 2 * (1 - fyB) * (18 / CB * ft * (fx - 0.7) - 0.25 * (2 - ft)));
      const lam = 0.6 * (1 + ft) * L;
      const kp = fam === 'HSM'
        ? lerp(fx, [[0, -0.25 * ft * (1 + fyB)], [0.3 - 0.1 * ft, -1], [0.35 - 0.1 * ft, 1], [0.8 - 0.2 * ft, 1], [0.9 - 0.2 * ft, -1], [1, -1]])
        : lerp(fx, [[0, 1.5 - ft - 0.5 * fyB], [0.3 - 0.1 * ft, -1], [0.5 - 0.2 * ft, 1], [0.8 - 0.2 * ft, 1], [0.9 - 0.2 * ft, -1], [1, -1]]);
      Pdyn = CfT * fp * fnl * fh * ka * kp * fyz * Cw * Math.sqrt((l0 + lam - 125) / L);
    } else if (fam === 'FSM') {
      const CfT = (1 + (1.5 - ft) * (CB - 1)) * (0.6 - 0.55 * (L - 400) / 300);
      const fnl = BWE ? 0.95 : 0.9;
      const fyz = (Cx - 0.2) * z / T + (2 - Cx) * fyB + 1.2;
      const ka = fx < 0.2 ? 1 + (3.75 - 2 * ft) * (1 - 5 * fx) * (1 - fyB) : fx < 0.9 ? 1.0 : 1 + 20 * (1 - fyB) * (fx - 0.9);
      const lam = 0.6 * (1 + 2 / 3 * ft) * L;
      const kp = lerp(fx, [[0, -0.75 - 0.25 * fyB], [0.35 - 0.1 * ft, -1], [0.5 - 0.2 * ft, 1], [0.75, 1], [0.8, -1], [1, -0.75 - 0.25 * fyB]]);
      Pdyn = CfT * fp * fnl * 2.6 * ka * kp * fyz * Cw * Math.sqrt((l0 + lam - 125) / L);
    } else if (fam === 'BSR') {
      const r = roll(B, { fps: fp, bilgeKeel: ship.bilgeKeel !== false, kr: ship.kr, GM: ship.GM, shipType: ship.rollType });
      const lam = G / (2 * Math.PI) * r.Ttheta * r.Ttheta;
      const th1 = 9000 * (1.4 - 0.035 * r.Ttheta) / ((1.15 * B + 55) * Math.PI) * Math.PI / 180;   // derece → rad
      const sgn = /P$/.test(sub) ? 1 : -1;                     // 1P/2P: +10 y sinθ1 ; 1S/2S: −10 y sinθ1
      Pdyn = fBeta(lc) * 1.0 * (sgn * 10 * y * Math.sin(th1) + 0.88 * fp * Cw * Math.sqrt((l0 + lam - 125) / l0) * (fyB1 + 1));
    } else if (fam === 'BSP') {
      const lam = 0.2 * (1 + 2 * ft) * l0;
      const portSide = /P$/.test(sub);
      const fyz = ((y >= 0) === portSide) ? 2 * z / T + 2.5 * fyB1 + 0.5 : 2 / 3 * z / T + 0.5 * fyB1 + 0.5;
      const fnl = lerp(fx, [[0, 0.6], [0.3, 0.8], [0.7, 0.8], [1, 0.6]]);
      const fcorr1 = (0.9 + (2 * T / ship.TSC - 1.05) * (CB / 0.85 - 0.85)) * (1.03 - 0.16 * ft);
      const fcorr2 = L < 110 ? 1 + 0.25 * 110 / L : L < 150 ? 1.25 - 0.25 * (L - 110) / 40 : 1;
      Pdyn = 4.5 * fcorr1 * fcorr2 * 1.0 * fBeta(lc) * fp * fnl * fyz * Cw * Math.sqrt((l0 + lam - 125) / l0);
    } else if (fam === 'OST') {
      const portSide = /P$/.test(sub), same = (y >= 0) === portSide;
      const fyz = same ? 5 * z / T + 3.5 * fyB + 1.5 : 1.5 * z / T + 1.5;
      const fnl = BWE ? 0.9 : 0.8;
      const fcorr = L <= 150 ? (1.15 - 0.3 * ft) * (1 + (ft + 0.55) * (150 - l0) / 80) : 1.15 - 0.3 * ft;
      const ka = fx <= 0.2 ? (same ? 1 + 3.5 * (1 - fyB) * (1 - 5 * fx) : 1 + (3.5 - (4 * ft - 0.5) * fyB) * (1 - 5 * fx))
               : fx <= 0.8 ? 1.0 : (same ? 1.0 : 1 + 4 * (1 - ft) * (5 * fx - 4) * fyB);
      const kpP = [[0, 1], [0.2, 1], [0.4, -1], [0.5, -1], [0.7, -0.1 + (1.6 * ft - 1.5) * fyB], [0.9, 0.8 + 0.2 * fyB], [1, -1 + fyB]];
      const kpS = [[0, 1], [0.2, 1 + (0.75 - 1.5 * ft) * fyB], [0.4, -1 + (1.75 - 0.5 * ft) * fyB], [0.5, -1 + (1.75 - 0.5 * ft) * fyB], [0.7, -0.1 + (0.25 - 0.3 * ft) * fyB], [0.9, 0.8 - (0.9 * ft + 0.85) * fyB], [1, -1 + (0.5 - 0.5 * ft) * fyB]];
      const kp = lerp(fx, same ? kpP : kpS);
      const lam = (ship.lamOST != null ? ship.lamOST : 0.45) * L;   // OST λ: 2026 metninde boş (Sec 5 [1.3.7]) → fikstürle kalibre (verify-dnv.js)
      Pdyn = 1.38 * fcorr * fp * fnl * ka * kp * fyz * Cw * Math.sqrt((l0 + lam - 125) / L);
    } else if (fam === 'OSA') {
      // [1.3.8]: α = 25 T_LC/L (rad→deg) ; f_corr L ≥ 100: (1.08 − 0.18 f_T)(1.25 + ln C_B) sin α
      const alphaRad = 25 * T / L, sinA = Math.sin(alphaRad);
      const base = (1.08 - 0.18 * ft) * (1.25 + Math.log(CB));
      const fcorr = L >= 100 ? base * sinA : L >= 80 ? base * (1 - (L / 20 - 4) * (1 - sinA)) : base;
      const fnl = lerp(fx, BWE ? [[0, 0.75], [0.3, 0.9], [0.7, 0.9], [1, 0.8]] : [[0, 0.5], [0.3, 0.8], [0.7, 0.8], [1, 0.6]]);
      const lam = 0.7 * L;
      const portSide = /P$/.test(sub), same = (y >= 0) === portSide;
      const fyz = same ? 5.5 * z / T + 5.3 * fyB + 2.2 : 0.9 * z / T + 0.4 * fyB + 2.2;          // Table 16
      const D2R = Math.PI / 180;
      const ka1 = 1 + 0.2 * (2 - ft) * fyB * (Math.sin(180 * (0.5 + (fx - 0.275) / 0.425) * D2R) + 0.09);
      const ka2 = 1 - 2 * (ft - 0.75) * fyB * (3.75 - 5 * fx) * Math.sin(60 * (10 * fx - 5) * D2R);
      const ka3 = ka1 + (0.3 * ft - 1.15) * fyB * Math.cos(180 * (fx - 0.05) / 0.45 * D2R);
      let ka;                                                                                     // Table 17
      if (same) ka = fx < 0.275 ? Math.min(ka3, 1.05) : fx <= 0.7 ? Math.min(ka1, 1.05) : ka1 + (1.9 * ft - 2.05) * fyB * Math.cos(180 * (fx - 0.4) / 0.6 * D2R);
      else ka = fx < 0.35 ? 1 + 4 * (ft - 0.75) * fyB + 1.2 * fyB * Math.cos(90 * (5 * fx - 0.75) * D2R) : fx <= 0.65 ? ka2 : ka2 + 36 * (fx - 0.65) ** 2 * fyB;
      const kpSame = [[0, 0.75 - 0.5 * fyB], [0.1, ft - 0.25 + (1.25 - ft) * fyB], [0.35, 1.0], [0.4, 1.25 - 0.5 * ft + (0.5 * ft - 0.25) * fyB], [0.55, 1.5 - ft + (ft - 1.07) * fyB], [0.85, 0.5 * ft - 1.25 + (0.25 - 0.5 * ft) * fyB], [1, 0.5 * ft - 1.25 + (0.25 - 0.5 * ft) * fyB]];
      const kpOpp  = [[0, 0.75], [0.1, ft - 0.25 + (0.35 * ft - 0.47) * fyB], [0.35, 1 + (2.7 * ft - 3.2) * fyB], [0.4, 1.25 - 0.5 * ft + (2.7 * ft - 3.2) * fyB], [0.55, 1.5 - ft + (2.7 * ft - 3.2) * fyB], [0.85, 0.5 * ft - 1.25 + (0.2 - 0.1 * ft) * fyB], [1, 0.5 * ft - 1.25 + (0.2 - 0.1 * ft) * fyB]];
      const kp = clamp(lerp(fx, same ? kpSame : kpOpp), -1, 1);                                   // Table 18, not 1)
      Pdyn = 0.81 * fcorr * fp * fnl * ka * kp * fyz * Cw * Math.sqrt((l0 + lam - 125) / L) * (1 + 0.5 * ft);
    } else throw new Error('Pw: bilinmeyen yük durumu ' + lc);
    // Tablo satırı: '-1' tipi (HSM-1, HSA-1, FSM-1, xx-2P/2S) negatif basınç → max(−P, ρg(z−T)); '2'/'1P'/'1S' pozitif → max(P, ρg(z−T))
    const negative = (sub === '1' || /^2[PS]$/.test(sub));
    const hydro = RHO_G * (z - T);                             // z ≤ T'de negatif
    let PW;
    if (z <= T) PW = negative ? Math.max(-Pdyn, hydro) : Math.max(Pdyn, hydro);
    else {
      // su hattı üstü: P_W,WL − ρg(z − T) (h_W bandı içinde), 0 üstünde. P_W,WL: aynı LC'de z = T, y = ±B_x/2
      const PWL = Pw(lc, ship, T, x, y >= 0 ? Bx / 2 : -Bx / 2, T, Bx, scen).PW;
      const hW = PWL / RHO_G;
      PW = z <= T + hW ? PWL - RHO_G * (z - T) : 0;
    }
    return { PW, Pdyn, lc };
  }
  // Tüm yük durumları → en büyük P_ex = P_S + P_W (0'dan küçük olamaz)
  function Pex(ship, T, x, y, z, Bx, scen, cases) {
    const ps = Ps(z, T); let best = null;
    for (const lc of (cases || LOAD_CASES)) {
      const w = Pw(lc, ship, T, x, y, z, Bx, scen), tot = Math.max(0, ps + w.PW);
      if (!best || tot > best.P) best = { P: tot, PS: ps, PW: w.PW, lc };
    }
    return best;
  }

  // ------------------------------------------------------------ Sec 6 [1.2]: statik tank basınçları (kN/m²)
  // tank: {ztop [m], zair [m] (hava borusu tepesi), rho (t/m³, balast 1.025), PPV, P0 (harbour overpressure; balast ambarı 0), Pdrop2 (25 balast), zbd, hair}
  function Pls(tank, z, L) {
    const rg = (tank.rho || 1.025) * G, ztop = tank.ztop, zair = tank.zair != null ? tank.zair : ztop + (tank.hair || 0);
    const P0 = tank.P0 != null ? tank.P0 : (L <= 50 ? 10 : L < 100 ? 0.3 * L - 5 : 25);
    const p1 = rg * (ztop - z) + (tank.PPV || 0);                                  // [1.2.1] normal, deniz
    const p3 = rg * (ztop - z) + (tank.PPV != null ? tank.PPV : P0);               // [1.2.3] liman
    const p4 = rg * (zair - z) + (tank.Pdrop2 != null ? tank.Pdrop2 : 25);         // [1.2.4] taşırma
    const zST = Math.max(zair, ztop + (tank.hair != null ? tank.hair : (zair - ztop)), ztop + 2.4, tank.zbd || 0);
    const pST = 10 * (zST - z);                                                    // [1.2.5] test
    return { p1, p3, p4, pST, zST };
  }

  // ------------------------------------------------------------ Ch 6 Sec 2 Table 1: yük setleri (plaka/stiffener, kaplama)
  // Kaplama için P_S+P_W / P_S düşülür (not 1). Dönüş: [{set, P, AC, T, lc}]
  function loadSetsShell(ship, x, y, z, Bx, tank, TBAL) {
    const out = [];
    const sea1 = Pex(ship, ship.TSC, x, y, z, Bx, 'ES'); out.push({ set: 'SEA-1', P: sea1.P, AC: 'AC-II', T: ship.TSC, lc: sea1.lc, PS: sea1.PS, PW: sea1.PW });
    out.push({ set: 'SEA-2', P: Ps(z, ship.TSC), AC: 'AC-I', T: ship.TSC, lc: 'Static' });
    if (tank) {                                                      // kaplamanın arkası tank: fark basınçları
      const T3 = Math.min(TBAL, 0.25 * ship.TSC), pl = Pls(tank, z, ship.L);
      out.push({ set: 'WB-3', P: Math.max(pl.p4, pl.pST) - Ps(z, T3), AC: 'AC-III', T: T3, lc: 'Static' });
      out.push({ set: 'WB-4', P: pl.p3 - Ps(z, TBAL), AC: 'AC-I', T: TBAL, lc: 'Static' });
      // WB-1 / WB-2: P_ls-1 + P_ld − (P_S + P_W)  → P_ld (Sec 6 [1.3], ivmeler) sonraki adım
    }
    return out;
  }

  // ------------------------------------------------------------ Ch 5 Sec 3 [2.1.1]: yük durumu başına σ_hg (N/mm²), net50 kesit
  // sec: {I_n50 [m⁴], zn_n50 [m]} ; msw: {hog, sag} (kNm) ; mwv: {hog, sag} ; z [m]
  // Ch 5 Sec 3 [2.1.1]: σ_hg = σ_sw + σ_wv-LC ; σ_sw hogging VEYA sagging izin verilen momentten — her ikisi de değerlendirilir
  //   (Nauticus: her LC × {M_sw-h, M_sw-s}). hogSW verilmezse |σ| büyük olanı döner.
  //   İşaret: çekme (+). Hogging (M>0) güvertede çekme, dipte basınç → σ_v = M·(z − z_n)/I_y.
  //   Yatay: σ_wh = −M_wh-LC·y/I_z (Nauticus fikstürü ile doğrulandı: OST/OSA/BSR P-S çiftleri; y sancak +).
  //   sec: {I_n50, zn_n50, Iz_n50}; mwh: M_wh (kNm, Sec 4 [3.3]); M_wh-LC = f_β·C_WH·M_wh [3.5.4].
  function sigmaHg(lc, ft, sec, msw, mwv, z, hogSW, y, mwh) {
    const k = LCF(lc, ft), wave = fBeta(lc) * k.CWV * (k.CWV >= 0 ? mwv.hog : Math.abs(mwv.sag));   // Sec 4 [3.5.2]
    const sh = (mwh && sec.Iz_n50 && y != null) ? -(fBeta(lc) * k.CWH * mwh) * y / sec.Iz_n50 * 1e-3 : 0;   // [3.5.4] M_wh-LC = f_β·C_WH·M_wh
    const f = M => M * (z - sec.zn_n50) / sec.I_n50 * 1e-3 + sh;                                  // kNm·m/m⁴ → N/mm²
    if (hogSW === true) return f(msw.hog + wave);
    if (hogSW === false) return f(msw.sag + wave);
    const a = f(msw.hog + wave), b = f(msw.sag + wave); return Math.abs(a) >= Math.abs(b) ? a : b;
  }
  const sigmaHgStatic = (sec, msw, z, hog) => (hog ? msw.hog : msw.sag) * (z - sec.zn_n50) / sec.I_n50 * 1e-3;
  // Sec 4 [3.3]: M_wh = f_p (0.31 + L/2800) f_m C_w L² T_LC C_B  (kNm)
  const Mwh = (x, L, B, CB, TLC, fps_) => (fps_ == null ? 1 : fps_) * (0.31 + L / 2800) * DNV.fm(x, L) * DNV.Cw(L) * L * L * TLC * CB;

  // ------------------------------------------------------------ Sec 3 [2]: gemi hareketleri ve ağırlık merkezi ivmeleri (mukavemet, f_p = f_ps)
  //   ship: {L, B, D, CB, TSC, rollType|kr|GM, bilgeKeel, v?}. T: T_LC. v [kn]: L<100 → 0, L≥150 → 5, arada doğrusal (Pt 5'te aksi yoksa).
  function motions(ship, T, opts) {
    const L = ship.L, B = ship.B, fp = (opts && opts.fps) || 1.0, ft = fT(T, ship.TSC);
    const a0 = (1.58 - 0.47 * ship.CB) * (2.4 / Math.sqrt(L) + 34 / L - 600 / (L * L));
    const r = roll(B, { fps: fp, bilgeKeel: ship.bilgeKeel !== false, kr: ship.kr, GM: ship.GM, shipType: ship.rollType });
    const lamPhi = 0.6 * (1 + ft) * L, Tphi = Math.sqrt(2 * Math.PI * lamPhi / G);
    const phi = Math.min(20, 920 * fp * Math.pow(L, -0.84) * (1.0 + Math.pow(2.57 / Math.sqrt(G * L), 1.2)));
    const sgl = Math.sqrt(G * L), v = ship.v != null ? ship.v : (L < 100 ? 0 : L >= 150 ? 5 : 5 * (L - 100) / 50);
    const aSurge = 0.2 * (1.6 + 1.5 / sgl) * fp * a0 * G;
    const aSway = 0.3 * (2.25 - 20 / sgl) * fp * a0 * G;
    const kH = L < 100 ? 0.8 * (1 + 0.03 * v) * (0.72 + 2 * L / 700) : L < 150 ? (0.4 + L / 250) * (1 + 0.03 * v * (3 - L / 50)) : 1;
    const aHeave = kH * (1.15 - 6.5 / sgl) * fp * a0 * G;
    const thetaRad = r.theta / fp * Math.PI / 180;                                   // θ, f_p = 1 ile
    const aRoll = fp * thetaRad * Math.pow(2 * Math.PI / r.Ttheta, 2);                // rad/s²
    const kP = L < 100 ? 0.8 * (1 + 0.05 * v) * (0.72 + 2 * L / 700) : L < 150 ? (0.4 + L / 250) * (1 + 0.05 * v * (3 - L / 50)) : 1;
    const aPitch = kP * fp * (1.75 - 22 / sgl) * (phi / fp * Math.PI / 180) * Math.pow(2 * Math.PI / Tphi, 2);   // rad/s² (φ, f_p = 1 ile)
    const R = Math.min(ship.D / 4 + T / 2, ship.D / 2);
    return { a0, Ttheta: r.Ttheta, theta: r.theta, Tphi, phi, aSurge, aSway, aHeave, aRoll, aPitch, R, v };
  }
  // Sec 3 [3.2]: yük durumu için (x, y, z) noktasındaki ivmeler, m/s². x AE'den; y işareti P/S tablolarıyla tutarlı (fikstürle doğrulanır)
  function accel(lc, ship, T, x, y, z, opts) {
    const m = (opts && opts.motions) || motions(ship, T, opts), k = LCF(lc, fT(T, ship.TSC), ship.L), fb = fBeta(lc);
    const sinPhi = Math.sin(m.phi * Math.PI / 180), sinTh = Math.sin(m.theta * Math.PI / 180);
    const aX = fb * (-k.CXG * G * sinPhi + k.CXS * m.aSurge + k.CXP * m.aPitch * (z - m.R));
    const aY = fb * (k.CYG * G * sinTh + k.CYS * m.aSway - k.CYR * m.aRoll * (z - m.R));
    const aZ = fb * (k.CZH * m.aHeave + k.CZR * m.aRoll * y - k.CZP * m.aPitch * (x - 0.45 * ship.L));
    return { aX, aY, aZ, m };
  }
  // ------------------------------------------------------------ Sec 6 [1.3]: dinamik tank basıncı P_ld
  //   tank: {x0, x1, y0, y1, ztop, rho, xG?, yG?, zG?, top?[[x,y]...]}; referans noktası: üst sınır köşelerinden V_j en büyük olan.
  //   f_cd 1.0 (yük tankı FE dışı); f_ull-ℓ 0.62 / f_ull-t 0.67 sıvı yük tankları, 1.0 diğer (opts.fullL/fullT)
  //   İvmeler tankın ağırlık merkezinde (x_G, y_G, z_G) (Sec 6 semboller); opts.accelAt = 'point' → yük noktasında (karşılaştırma için)
  function Pld(lc, ship, T, tank, x, y, z, opts) {
    const xG = tank.xG != null ? tank.xG : (tank.x0 + tank.x1) / 2, yG = tank.yG != null ? tank.yG : (tank.y0 + tank.y1) / 2, zG = tank.zG != null ? tank.zG : tank.ztop;
    const atPoint = opts && opts.accelAt === 'point';
    const a = atPoint ? accel(lc, ship, T, x, y, z, opts) : accel(lc, ship, T, xG, yG, zG, opts), g = G;
    const fcd = (opts && opts.fcd) || 1.0, fl = (opts && opts.fullL) || 1.0, ft_ = (opts && opts.fullT) || 1.0;
    const cands = (tank.top && tank.top.length) ? tank.top : [[tank.x0, tank.y0], [tank.x0, tank.y1], [tank.x1, tank.y0], [tank.x1, tank.y1]];
    let best = null, bestV = -Infinity;
    for (const [xj, yj] of cands) { const V = a.aX * (xj - xG) + a.aY * (yj - yG) + (a.aZ + g) * (tank.ztop - zG); if (V > bestV) { bestV = V; best = [xj, yj]; } }
    const [x0, y0] = best, z0 = tank.ztop;
    const P = fcd * (tank.rho || 1.025) * (a.aZ * (z0 - z) + fl * a.aX * (x0 - x) + ft_ * a.aY * (y0 - y));
    return { P, x0, y0, z0, aX: a.aX, aY: a.aY, aZ: a.aZ, m: a.m };
  }

  // ------------------------------------------------------------ Pt 5 Ch 1 Sec 2 [3.4]: dökme yük basıncı (BC-1…BC-8)
  //   hold: {rhoC, zC (yük üst yüzeyi, baseline'dan), xG, yG, zG (dolu ambar hacim merkezi), psi (°; 30 genel)}
  //   alphaDeg: panelin yatayla açısı (iç dip 0, iç borda 90, hopper eğimi). K_C = cos²α + (1 − sin ψ) sin²α ; topside/güverte K_C = 0 (opts.kc0)
  //   P_bs = ρ_C g K_C (z_C − z) ≥ 0 ; P_bd = ρ_C [0.25 a_X (x_G − x) + 0.25 a_Y (y_G − y) + f_dc K_C a_Z (z_C − z)] (z ≤ z_C), ivmeler ambar hacim merkezinde
  function Pbulk(lc, ship, T, hold, x, y, z, alphaDeg, opts) {
    const psi = (hold.psi != null ? hold.psi : 30) * Math.PI / 180, al = (alphaDeg || 0) * Math.PI / 180;
    const KC = (opts && opts.kc0) ? 0 : Math.pow(Math.cos(al), 2) + (1 - Math.sin(psi)) * Math.pow(Math.sin(al), 2);
    const fdc = (opts && opts.fdc) || 1.0;
    const Pbs = Math.max(0, hold.rhoC * G * KC * (hold.zC - z));
    let Pbd = 0, a = null;
    if (lc && lc !== 'Static') {
      a = accel(lc, ship, T, hold.xG, hold.yG, hold.zG, opts);
      Pbd = z <= hold.zC ? hold.rhoC * (0.25 * a.aX * (hold.xG - x) + 0.25 * a.aY * (hold.yG - y) + fdc * KC * a.aZ * (hold.zC - z)) : 0;
    }
    return { Pbs, Pbd, P: Pbs + Pbd, KC, a };
  }
  // ------------------------------------------------------------ Sec 5 [2.2]: açık güverte yeşil deniz basıncı P_D
  //   deck: {zdk (güvertenin en alçak noktası), zfdk (fribord güvertesi; χ için), LLL, xLL, freeboardType 'A'|'B'|'B60'}
  //   HSM/HSA/FSM: P_D = max(χ P_D-min, P_W,D − ρg(z − z_dk)) ≥ 0 ; P_W,D = borda P_W (y = ±B_x/2, z = z_dk)
  //   BSR/BSP/OST/OSA: P_D = P_W,D-int − ρg(z − z_dk) ≥ 0, iskele/sancak güverte kenarı arasında y'ye göre doğrusal
  function PDmin(LLL, xLL, fbType) {
    const r = xLL / LLL, a = (fbType === 'B') ? 0.0726 : 0.356;
    if (LLL >= 100) return r <= 0.75 ? 34.3 : 34.3 + (14.8 + a * (LLL - 100)) * (4 * r - 3);
    return r <= 0.75 ? 14.9 + 0.195 * LLL : 12.2 + LLL / 9 * (5 * r - 2) + 3.6 * r;
  }
  function PD(lc, ship, T, x, y, z, Bx, deck, scen) {
    if (!lc || lc === 'Static') return { PD: 0, PWD: 0, PDmin: 0 };
    const zdk = deck.zdk != null ? deck.zdk : z, half = Bx / 2, fam = lc.slice(0, 3);
    let PWD;
    if (fam === 'HSM' || fam === 'HSA' || fam === 'FSM') PWD = Pw(lc, ship, T, x, half, zdk, Bx, scen).PW;
    else {
      const pP = Pw(lc, ship, T, x, half, zdk, Bx, scen).PW, pS = Pw(lc, ship, T, x, -half, zdk, Bx, scen).PW;   // y>0 iskele, y<0 sancak
      PWD = pS + (pP - pS) * (y + half) / (2 * half);
    }
    let pmin = 0;
    if (fam === 'HSM' || fam === 'HSA' || fam === 'FSM') {
      const zf = deck.zfdk != null ? deck.zfdk : zdk, C = (zdk - zf) / 2.3;
      const pdm = PDmin(deck.LLL || ship.L, deck.xLL != null ? deck.xLL : x, deck.freeboardType);
      const chi = deck.zfdk == null || C <= 0 ? 1.0 : (C < 3 ? 0.75 * C : 2.5 / pdm);
      pmin = chi * pdm;
    }
    const P = Math.max(0, Math.max(pmin, PWD - RHO_G * (z - zdk)));
    return { PD: P, PWD, PDmin: pmin };
  }
  // ------------------------------------------------------------ Sec 5 [2.3.1] / Sec 6 [2.2]: yayılı yük P_dl = P_dl-s + P_dl-s·a_Z/g (yük durumu ivmesi, yük noktasında)
  function Pdl(lc, ship, T, x, y, z, Pdls, opts) {
    const ps = Math.max(Pdls == null ? 2.5 : Pdls, (opts && opts.min) != null ? opts.min : 2.5);
    if (!lc || lc === 'Static') return { Ps: ps, Pd: 0, P: ps };
    const a = accel(lc, ship, T, x, y, z, opts);
    return { Ps: ps, Pd: ps * a.aZ / G, P: ps * (1 + a.aZ / G), aZ: a.aZ };
  }
  // Su basması (Pt 5 Ch 1 / Ch 4 Sec 7 flooded, FD-1): P_fs = ρ g (z_fd − z) ; Sec 6 [3.1]: tank içi iç yapılar P_int = 12
  const Pflood = (z, zfd, rho) => Math.max(0, (rho || 1.025) * G * (zfd - z));
  const P_INT = 12;

  return { RHO_G, G, fT, fxL, L0, fps, roll, ROLL_DEFAULT, LCF, LOAD_CASES, fBeta, MwvLC, Mwh, Ps, Pw, Pex, Pls, motions, accel, Pld, Pbulk, PDmin, PD, Pdl, Pflood, P_INT, loadSetsShell, sigmaHg, sigmaHgStatic };
});
