// =============================================================================
// 65-dnv-ice.js — DNV RU-SHIP Pt 6 Ch 6 Sec 3 (Ice(1A*F)…Ice(1C), Kuzey Baltık ≡ FSICR 2021) — M10
//   [7.2] Table 6 h0/h ; [7.3] P = 5600·c_d·c_1·c_a ; c_d = (a1·k1 + b1)/1000, k1 = √(Δ_f·P_S)/1000 (Table 7) ; c_1 Table 8 ; c_a = √(ℓ0/ℓ_a) (0,35…1,0, ℓ0 = 0,6)
//   [8.2.1] plaka: enine t = 21,1 s1 √(f1 P_PL/R_eH) + t_c ; boyuna t = 21,1 s1 √(P/(f2 R_eH)) + t_c ; P_PL = 0,75 P ; f1 = 1,3 − 4,2/(h/s1 + 1,8)² ≤ 1 ; f2 = 0,6 + 0,4/(h/s1) (h/s1 ≤ 1) | 1,4 − 0,4 h/s1 (1…1,8)
//   [9.2] enine posta: Z = P s1 h ℓ/(m_t R_eH)·10³, A = 8,7 f3 P h s1/R_eH (f3 1,2; m_t = 7 m0/(7 − 5h/ℓ), m0 Table 12)
//   [9.3] boyuna posta: Z = f4 P h ℓ²/(m1 R_eH)·10³, A = 8,7 f4 f5 P h ℓ_shr/R_eH ; f4 = 1 − 0,2 h/s1 ; f5 2,16 ; m1 13,3 (sürekli) / 11,0 (braketsiz)
//   [9.4.2] t_w,min = max(9, (t − t_c)/2, h_w √R_eH/C), C 805 profil / 282 FB
//   [8.1] Table 10 / [9.1] Table 11 düşey uzanım (UIWL üstü / LIWL altı)
// SAF. Doğrulama: _dev/dnv-ref/verify-dnv-ice.js (Nauticus ice_plates / ice_stiffeners)
// =============================================================================
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DNVIce = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const P0 = 5600;
  // Table 6: ice class → {h0, h}
  const H_TABLE = { '1A*F': [1.0, 0.35], '1A*': [1.0, 0.35], '1A': [0.8, 0.30], '1B': [0.6, 0.25], '1C': [0.4, 0.22] };
  // Table 8: c_1 (region: bow | midbody | stern)
  const C1_TABLE = { '1A*F': [1.0, 1.0, 0.75], '1A*': [1.0, 1.0, 0.75], '1A': [1.0, 0.85, 0.65], '1B': [1.0, 0.70, 0.45], '1C': [1.0, 0.50, 0.25] };
  const REGION_I = { bow: 0, midbody: 1, stern: 2 };
  // Table 10 / 11: düşey uzanım [above UIWL, below LIWL] (m)
  const BELT_PLATE = { '1A*F': { bow: [0.6, 1.2], midbody: [0.6, 1.0], stern: [0.6, 1.0] }, '1A*': { bow: [0.6, 1.2], midbody: [0.6, 1.0], stern: [0.6, 1.0] },
                       '1A': { bow: [0.5, 0.9], midbody: [0.5, 0.75], stern: [0.5, 0.75] }, '1B': { bow: [0.4, 0.7], midbody: [0.4, 0.6], stern: [0.4, 0.6] }, '1C': { bow: [0.4, 0.7], midbody: [0.4, 0.6], stern: [0.4, 0.6] } };
  const BELT_FRAME = { '1A*F': { bow: [1.2, 'DB'], midbody: [2.0, 'DB'], stern: [1.6, 'DB'] }, '1A*': { bow: [1.2, 'DB'], midbody: [2.0, 'DB'], stern: [1.6, 'DB'] },
                       '1A': { bow: [1.0, 1.6], midbody: [1.0, 1.3], stern: [1.0, 1.0] }, '1B': { bow: [1.0, 1.6], midbody: [1.0, 1.3], stern: [1.0, 1.0] }, '1C': { bow: [1.0, 1.6], midbody: [1.0, 1.3], stern: [1.0, 1.0] } };
  const cls = c => String(c).replace(/^Ice\(?|\)$/g, '').toUpperCase();
  const hOf = c => H_TABLE[cls(c)] || H_TABLE['1C'];
  // [7.3] c_d: Δ_f (t) UIWL deplasmanı, P_S (kW) buzda kullanılabilir güç; region bow | midbody/stern
  function cd(deltaF, PS, region) {
    const k1 = Math.sqrt(deltaF * PS) / 1000, bow = region === 'bow';
    const [a1, b1] = bow ? (k1 <= 12 ? [30, 230] : [6, 518]) : (k1 <= 12 ? [8, 214] : [2, 286]);
    return { k1, cd: Math.min(1, (a1 * k1 + b1) / 1000) };
  }
  const c1 = (iceClass, region) => C1_TABLE[cls(iceClass)][REGION_I[region] == null ? 1 : REGION_I[region]];
  // Table 9: ℓ_a — shell: transverse → frame spacing; longitudinal → 1.7·frame spacing ; frames: transverse → frame spacing; longitudinal → span
  const ca = la => Math.max(0.35, Math.min(1.0, Math.sqrt(0.6 / la)));
  function pressure(ship, region, la) {
    const d = cd(ship.deltaF, ship.PS, region), c1v = c1(ship.iceClass, region), cav = ca(la);
    return { P: P0 * d.cd * c1v * cav, cd: d.cd, k1: d.k1, c1: c1v, ca: cav };
  }
  // [8.2.1] plaka (mm). s1 (m), P (kN/m²), longit: boyuna posta sistemi
  function plate(P, s1, h, ReH, tc, longit) {
    const r = h / s1;
    const f1 = Math.min(1.0, 1.3 - 4.2 / Math.pow(r + 1.8, 2));
    const f2 = r <= 1 ? 0.6 + 0.4 / r : 1.4 - 0.4 * r;
    const t = longit ? 21.1 * s1 * Math.sqrt(P / (f2 * ReH)) + tc : 21.1 * s1 * Math.sqrt(f1 * 0.75 * P / ReH) + tc;
    return { t, f1, f2, PPL: 0.75 * P };
  }
  // [9.3] boyuna posta: Z (cm³) brüt, A (cm²) brüt ; l (m) bending span, lshr (m)
  function longFrame(P, h, s1, l, lshr, ReH, opts) {
    const f4 = 1 - 0.2 * h / s1, f5 = 2.16, m1 = (opts && opts.m1) || ((opts && opts.noBracket) ? 11.0 : 13.3);
    return { Z: f4 * P * h * l * l / (m1 * ReH) * 1000, A: 8.7 * f4 * f5 * P * h * (lshr != null ? lshr : l) / ReH, f4, f5, m1 };
  }
  // [9.2] enine posta: m0 Table 12 (7 topside tank / 6 tank top–single deck / 5.7 continuous / 5 two decks)
  function transFrame(P, h, s1, l, ReH, m0) {
    const mt = 7 * (m0 || 7) / (7 - 5 * h / l), f3 = 1.2;
    return { Z: P * s1 * h * l / (mt * ReH) * 1000, A: 8.7 * f3 * P * h * s1 / ReH, mt, f3 };
  }
  // [9.4.2] web min: t plaka gereği (mm), t_c, h_w (mm), FB?
  const twMin = (tPlateReq, tc, hw, ReH, flatBar) => Math.max(9, 0.5 * (tPlateReq - tc), hw * Math.sqrt(ReH) / (flatBar ? 282 : 805));
  // düşey uzanım (m): {zTop, zBot} — UIWL/LIWL su hatları (m); plaka Table 10, posta Table 11 ('DB' → çift dip)
  function belt(iceClass, region, UIWL, LIWL, kind, zDB) {
    const t = (kind === 'frame' ? BELT_FRAME : BELT_PLATE)[cls(iceClass)][region];
    return { zTop: UIWL + t[0], zBot: t[1] === 'DB' ? (zDB != null ? zDB : 0) : LIWL - t[1] };
  }
  return { P0, H_TABLE, C1_TABLE, hOf, cd, c1, ca, pressure, plate, longFrame, transFrame, twMin, belt, cls };
});
