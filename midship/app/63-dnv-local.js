// =============================================================================
// 63-dnv-local.js — DNV RU-SHIP Pt 3 Ch 6 Sec 4 (plaka) ve Sec 5 (stiffener) — M6/M7
//   Plaka  [1.1.1]: t = 0.0158·α_p·b·√(|P|/(C_a·R_eH)), C_a = β_a − α_a·|σ_hg|/R_eH ≤ C_a-max (Table 1)
//   Profil [1.1.2]: Z = f_u·|P|·s·ℓ²/(f_bdg·C_s·R_eH) ; [1.1.1]: t_w = C_m·f_shr·|P|·s·ℓ_shr/(d_shr·C_t·τ_eH)
//   C_s (Table 3/4), f_bdg/f_m (Table 5), C_t (Table 2), f_shr (Table 1)
// SAF. Doğrulama: _dev/dnv-ref/verify-dnv.js
// =============================================================================
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DNVLocal = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ------------------------------------------------------------ plaka
  // Ch 3 Sec 7 [2.1.1]: a = uzun kenar, b = kısa kenar ; α_p = 1.2 − b/(2.1 a) ≤ 1.0
  const alphaP = (a, b) => Math.min(1.0, 1.2 - b / (2.1 * a));
  // Table 1: AC × eleman → [β_a, α_a, C_a-max]. kind: 'longStiffened' | 'transStiffened' | 'other' | ... (AC-III alt sınıfları)
  const CA_TABLE = {
    'AC-I':   { longStiffened: [0.90, 0.50, 0.80], transStiffened: [0.90, 1.00, 0.80], other: [0.80, 0.00, 0.80] },
    'AC-II':  { longStiffened: [1.05, 0.50, 0.95], transStiffened: [1.05, 1.00, 0.95], other: [0.95, 0.00, 0.95] },
    'AC-III': { longStiffened: [1.10, 0.50, 1.00], transStiffened: [1.10, 1.00, 1.00],           // "other longitudinal members"
                longBhdLongStiffened: [1.25, 0.5, 1.15], longBhdTransStiffened: [1.15, 1.0, 1.15],
                transBoundary: [1.15, 0.00, 1.15], other: [1.00, 0.00, 1.00],
                wtLongStiffened: [1.25, 0.50, 1.15], wtTransStiffened: [1.15, 1.00, 1.15], wtOther: [1.15, 0.00, 1.15] },
  };
  function Ca(AC, kind, sigmaHg, ReH) {
    const row = (CA_TABLE[AC] || {})[kind]; if (!row) throw new Error('C_a: ' + AC + '/' + kind);
    const [beta, alpha, cmax] = row;
    return Math.min(cmax, beta - alpha * Math.abs(sigmaHg) / ReH);
  }
  // EPP'nin takviye yönü: uzun kenar (a) boyuna ise "longitudinally stiffened" (stiffener'lar boyuna), değilse enine.
  //   Nauticus: a = max(l_epp, s), b = min ; boyuna aralık s, boyuna uzunluk l_epp: l_epp ≥ s → longStiffened
  const stiffKind = (lEpp_mm, s_mm) => lEpp_mm >= s_mm ? 'longStiffened' : 'transStiffened';
  // t_net (mm): P kN/m², b mm
  const tPlate = (P, a, b, Ca_, ReH) => 0.0158 * alphaP(a, b) * b * Math.sqrt(Math.abs(P) / (Ca_ * ReH));

  // ------------------------------------------------------------ stiffener
  // Table 4: AC × eleman → [β_s, α_s, C_s-max]
  const CS_TABLE = {
    'AC-I':   { longitudinal: [0.95, 1.00, 0.85], other: [0.85, 0.00, 0.85] },
    'AC-II':  { longitudinal: [1.10, 1.00, 0.95], other: [0.95, 0.00, 0.95] },
    'AC-III': { longitudinal: [1.20, 1.00, 1.00], longitudinalWT: [1.20, 1.00, 1.15], other: [1.00, 0.00, 1.00], otherWT: [1.15, 0.00, 1.15] },
  };
  // Table 5: f_bdg / f_m — fixity: 'fixed' | 'fixedSimple' (yatay/üst uç) | 'fixedSimpleLower' | 'simple'
  const FBDG = { fixed: 12, fixedSimple: 10, fixedSimpleLower: 8, simple: 8 };
  const FM = { 'AC-I': { fixed: 2.00, fixedSimple: 2.33, fixedSimpleLower: 1.77 }, 'AC-II': { fixed: 1.60, fixedSimple: 1.86, fixedSimpleLower: 1.42 }, 'AC-III': { fixed: 1.60, fixedSimple: 1.86, fixedSimpleLower: 1.42 } };
  // Table 3: C_s işaret/yük tarafı mantığı. sigmaHg > 0 çekme. pressureSide: 'plate' | 'stiffener'
  function Cs(AC, kind, sigmaHg, ReH, fixity, pressureSide) {
    const row = (CS_TABLE[AC] || {})[kind]; if (!row) throw new Error('C_s: ' + AC + '/' + kind);
    const [beta, alpha, cmax] = row, base = beta - alpha * Math.abs(sigmaHg) / ReH;
    const tension = sigmaHg > 0, onStiff = pressureSide === 'stiffener';
    if (fixity === 'simple') {
      // basit mesnet: çekme+plaka tarafı → β−α… ; basınç+stiffener → aynı ; çekme+stiffener / basınç+plaka → C_s-max
      return ((tension && !onStiff) || (!tension && onStiff)) ? Math.min(cmax, base) : cmax;
    }
    const fm = (FM[AC] || FM['AC-II'])[fixity] || 1.6;
    // bir/iki uç sabit: çekme+stiffener tarafı veya basınç+plaka tarafı → β−α… ; çekme+plaka veya basınç+stiffener → f_m·(β−α…)
    return ((tension && onStiff) || (!tension && !onStiff)) ? Math.min(cmax, base) : Math.min(cmax, fm * base);
  }
  const CT = { 'AC-I': 0.75, 'AC-II': 0.90, 'AC-III': 0.95 };                        // Table 2
  const FSHR = { fixed: 0.5, fixedUpper: 0.4, fixedLower: 0.7, simple: 0.5 };         // Table 1 (sürekli/sabit uç; düşey üst/alt)
  const FU = { flat: 1.0, T: 1.0, bulb: 1.03, angle: 1.15 };                          // [1.1.2] f_u
  // Z (cm³): P kN/m², s m, ℓ m
  const Zreq = (P, s, lbdg, fbdg, Cs_, ReH, fu) => (fu || 1) * Math.abs(P) * s * lbdg * lbdg / (fbdg * Cs_ * ReH) * 1000;
  // t_w (mm): d_shr mm, τ_eH = R_eH/√3
  const twReq = (P, s, lshr, dshr, Ct_, ReH, fshr, Cm) => (Cm || 1) * fshr * Math.abs(P) * s * lshr / (dshr * Ct_ * (ReH / Math.sqrt(3))) * 1000;
  // Ch 3 Sec 7 [1.1.4]: ℓ_shr ≤ ℓ − s/2000
  const lshrMax = (l, s_mm) => l - s_mm / 2000;
  // Ch 3 Sec 7 [1.4.3] d_shr (FB: h_w ; bulb/L/T: h_w + t_p?  → fikstürle doğrulanacak)  ; [1.4.4] Z_a net elastik
  return { alphaP, CA_TABLE, Ca, stiffKind, tPlate, CS_TABLE, FBDG, FM, Cs, CT, FSHR, FU, Zreq, twReq, lshrMax };
});
