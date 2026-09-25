// =============================================================================
// 64-dnv-buckling.js — DNV RU-SHIP Pt 3 Ch 8 Sec 3 (prescriptive) + DNV-CG-0128 Sec 3 (closed form method) — M9
//   Plaka: [3.2] limit durumu (γ_c1..γ_c4), Table 1 (B, e0), Table 3 (K, C; durum 1, 2, 15), Table 4 (eğri panel, R/t_p ≤ 2500),
//          [3.2.4] F_long, [3.2.5] F_tran, σ_E = π²E/(12(1−ν²))·(t_p/b)²
//   Gerilme kombinasyonları (Ch 8 Sec 3 [2.2]): boyuna takviye: (σ_hg, 0, 0.7τ_hg) ve (0.7σ_hg, 0, τ_hg); enine: σ_y yerine.
//   η_all (Sec 1 Table 3): AC-I 0.8, AC-II 1.0, AC-III 1.0. S = 1.0 (L_LL < 150 m dökme yük dışı; [1] Semboller).
// SAF (node + tarayıcı). Doğrulama: _dev/dnv-ref/verify-dnv-buckling.js (Nauticus buckling_epp satırları)
// =============================================================================
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DNVBuckling = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const E = 206000, NU = 0.3;
  const KE = Math.PI * Math.PI * E / (12 * (1 - NU * NU));            // 186 262
  const ETA_ALL = { 'AC-I': 0.8, 'AC-II': 1.0, 'AC-III': 1.0 };

  // ------------------------------------------------------------ yardımcılar
  // Table 3 Case 1/2 ortak: c, λ_c
  const cOf = psi => Math.min(1.25, 1.25 - 0.12 * psi);
  const lamC = c => c / 2 * (1 + Math.sqrt(1 - 0.88 / c));
  // Case 1 (σ_x, uzun kenar boyunca): K_x
  function Kx1(psi, Flong) {
    if (psi >= 0) return Flong * 8.4 / (psi + 1.1);
    if (psi > -1) return Flong * (7.63 - psi * (6.26 - 10 * psi));
    return Flong * 5.975 * Math.pow(1 - psi, 2);
  }
  // Case 1: C_x (σ_x > 0)
  function Cx1(lam, psi) {
    const c = cOf(psi), lc = lamC(c);
    return lam <= lc ? 1 : c * (1 / lam - 0.22 / (lam * lam));
  }
  // Case 2 (σ_y, kısa kenar boyunca): K_y  — 1 ≥ ψ ≥ 0 ve 0 > ψ ≥ 1 − 4α/3 ve ψ < 1 − 4α/3
  function Ky2(psi, alpha, Ftran) {
    if (psi >= 0) {
      const f1 = alpha <= 6 ? (1 - psi) * (alpha - 1) : Math.min(0.6 * (1 - 6 * psi / alpha) * (alpha + 14 / alpha), 14.5 - 0.35 / (alpha * alpha));
      return Ftran * 2 * Math.pow(1 + 1 / (alpha * alpha), 2) / (1 + psi + (1 - psi) / 100 * (2.4 / (alpha * alpha) + 6.9 * f1));
    }
    const beta = (1 - psi) / alpha, omega = Math.min(3, alpha);
    if (psi >= 1 - 4 * alpha / 3) {
      let f1, f2 = 0, f3 = 0;
      if (alpha > 6 * (1 - psi)) f1 = Math.min(0.6 * (1 / beta + 14 * beta), 14.5 - 0.35 * beta * beta);
      else if (alpha >= 3 * (1 - psi)) f1 = 1 / beta - 1;
      else if (alpha >= 1.5 * (1 - psi)) f1 = 1 / beta - Math.pow(2 - omega * beta, 4) - 9 * (omega * beta - 1) * (2 / 3 - beta);
      else if (alpha >= 1 - psi) {
        const f4 = Math.pow(1.5 - Math.min(1.5, alpha), 2);
        if (alpha > 1.5) { f1 = 2 * (1 / beta - 16 * Math.pow(1 - omega / 3, 4)) * (1 / beta - 1); f2 = 3 * beta - 2; }
        else { f1 = 2 * (1.5 / (1 - psi) - 1) * (1 / beta - 1); f2 = psi * (1 - 16 * f4 * f4) / (1 - alpha); }
      } else {
        const f4 = Math.pow(1.5 - Math.min(1.5, alpha), 2);
        f1 = 0; f2 = 1 + 2.31 * (beta - 1) - 48 * (4 / 3 - beta) * f4 * f4; f3 = 3 * f4 * (beta - 1) * (f4 / 1.81 - (alpha - 1) / 1.31);
      }
      return 200 * Ftran * Math.pow(1 + beta * beta, 2) / ((1 - f3) * (100 + 2.4 * beta * beta + 6.9 * f1 + 23 * f2));
    }
    const f5 = 9 / 16 * Math.pow(1 + Math.max(-1, psi), 2), f3 = f5 * (f5 / 1.81 + (1 + 3 * psi) / 5.24);
    return 5.972 * Ftran * beta * beta / (1 - f3);
  }
  // Case 2: C_y (σ_y > 0) — c1: SP-A (1 − 1/α) ≥ 0 ; AC-III kaza 0 ; SP-B 1
  function Cy2(lam, psi, K, c1) {
    const c = cOf(psi), lc = lamC(c);
    const R = lam < lc ? lam * (1 - lam / c) : 0.22;
    let lp2 = lam * lam - 0.5; lp2 = Math.max(1, Math.min(3, lp2));
    const F = Math.max(0, (1 - (K / 0.91 - 1) / lp2) * c1);
    const T = lam + 14 / (15 * lam) + 1 / 3;
    const H = Math.max(R, lam - 2 * lam / (c * (T + Math.sqrt(T * T - 4))));
    return c * (1 / lam - (R + F * F * (H - R)) / (lam * lam));
  }
  // Case 15: K_τ, C_τ
  const Ktau15 = alpha => Math.sqrt(3) * (5.34 + 4 / (alpha * alpha));
  const Ctau15 = lam => lam <= 0.84 ? 1 : 0.84 / lam;
  // Table 4 (eğri panel): d = silindir eksenine paralel kenar (mm), R0 yarıçap
  function curvedK(d, R0, tp) {
    const r = d / R0, s = Math.sqrt(R0 / tp);
    const Kax = r <= 0.5 * s ? 1 + 2 / 3 * d * d / (R0 * tp) : Math.max(0.267 * d * d / (R0 * tp) * (3 - r * Math.sqrt(tp / R0)), 0.4 * d * d / (R0 * tp));
    const Ktg = r <= 1.63 * s ? d / Math.sqrt(R0 * tp) + 3 * Math.pow(R0 * tp, 0.175) / Math.pow(d, 0.35) : 0.3 * d * d / (R0 * R0) + 2.25 * Math.pow(R0 * R0 / (d * tp), 2);
    const Kt = r <= 8.7 * s ? Math.sqrt(3) * Math.sqrt(28.3 + 0.67 * Math.pow(d, 3) / (Math.pow(R0, 1.5) * Math.pow(tp, 1.5))) : Math.sqrt(3) * 0.28 * d * d / (R0 * Math.sqrt(R0 * tp));
    return { Kax, Ktg, Kt };
  }
  // Table 4 C: 'general' | 'bilge' (düz panellerle sınırlı tek eğri alan, örn. bilge strake)
  function curvedC(lam, kind, single) {
    if (kind === 'ax') { if (single) return Math.min(1, 0.65 / (lam * lam)); return lam <= 0.25 ? 1 : lam <= 1 ? 1.233 - 0.933 * lam : lam <= 1.5 ? 0.3 / Math.pow(lam, 3) : 0.2 / (lam * lam); }
    if (kind === 'tg') { if (single) return Math.min(1, 0.8 / (lam * lam)); return lam <= 0.4 ? 1 : lam <= 1.2 ? 1.274 - 0.686 * lam : 0.65 / (lam * lam); }
    return lam <= 0.4 ? 1 : lam <= 1.2 ? 1.274 - 0.686 * lam : 0.65 / (lam * lam);          // τ
  }
  // [3.2.4] Table 2: F_long — kenar takviyesi tipi ve t_w/t_p (net); iki kenar farklıysa ortalama
  function FlongEdge(type, tw, tp) {
    if (!type || type === 'none' || type === 'unstiffened') return 1.0;
    if (type === 'rigid' || type === 'girder') return 1.4;
    const c = { FB: 0.10, flat: 0.10, HP: 0.30, bulb: 0.30, L: 0.40, angle: 0.40, T: 0.30 }[type];
    if (c == null) return 1.0;
    const r = tw / tp;
    return r > 1 ? c + 1 : c * Math.pow(r, 3) + 1;
  }
  const Flong = (edgeA, edgeB) => (edgeA + edgeB) / 2;

  // ------------------------------------------------------------ γ çözücü (monoton artan f(γ) = 1)
  function solveGamma(f, hi) {
    let lo = 0, h = hi || 1;
    while (f(h) < 1 && h < 1e6) h *= 2;
    for (let i = 0; i < 80; i++) { const m = (lo + h) / 2; if (f(m) < 1) lo = m; else h = m; }
    return (lo + h) / 2;
  }

  // ------------------------------------------------------------ plaka limit durumu
  //   inp: {sx, sy, tau, tp, b, a, ReH, psi_x, psi_y, Flong, Ftran, S, c1Mode:'SP-A'|'AC-III'|'SP-B', curved:{R0, d, single}}
  //   dönüş: {gammaC, eta, sigE, Kx, Ky, Ktau, Cx, Cy, Ctau, lamX, lamY, lamT, betaP, B, e0, cases}
  function plateLimit(inp) {
    const sx = inp.sx || 0, sy = inp.sy || 0, tau = Math.abs(inp.tau || 0), tp = inp.tp, ReH = inp.ReH, S = inp.S || 1;
    const alpha = inp.a / inp.b, psx = inp.psi_x != null ? inp.psi_x : 1, psy = inp.psi_y != null ? inp.psi_y : 1;
    const sigE = KE * Math.pow(tp / inp.b, 2);
    const out = { sigE, alpha, S };
    const betaP = Math.max(1, inp.b / tp * Math.sqrt(ReH / E)); out.betaP = betaP;
    const tension = sx < 0 || sy < 0;                             // [3.2.3]: σ < 0 → C = 1 ; Table 1: B = 1, e0 = 2
    // Eğri panel yalnız yay olarak tanımlı plakada (bilge); Nauticus referans kesitin hafif kırıklı düz plakalarını (radius 4.5–5.2 m) düz sayıyor
    if (inp.curved && inp.curved.R0 && inp.curved.R0 / tp <= 2500) {
      // [3.2.6] eğri panel: σ_ax = σ_x (çekmede 0), σ_tg = σ_y, τ ; K/C Table 4 ; γ_c ≥ düz panel γ_c
      const cv = inp.curved, K = curvedK(cv.d, cv.R0, tp), single = cv.single !== false;
      const lamAx = Math.sqrt(ReH / (K.Kax * sigE)), lamTg = Math.sqrt(ReH / (K.Ktg * sigE)), lamT = Math.sqrt(ReH / (K.Kt * sigE));
      const Cax = curvedC(lamAx, 'ax', single), Ctg = curvedC(lamTg, 'tg', single), Ct = curvedC(lamT, 'tau', single);
      const sax = Math.max(0, sx), stg = Math.max(0, sy);
      const f = g => Math.pow(g * sax * S / (Cax * ReH), 1.25) - 0.5 * (g * sax * S / (Cax * ReH)) * (g * stg * S / (Ctg * ReH)) + Math.pow(g * stg * S / (Ctg * ReH), 1.25) + Math.pow(g * tau * Math.sqrt(3) * S / (Ct * ReH), 2);
      let gC = (sax > 0 || stg > 0 || tau > 0) ? solveGamma(f, 1) : Infinity;
      // her terim ≤ 1 (kural): tek tek sınırlar
      const gLim = Math.min(sax > 0 ? Cax * ReH / (sax * S) : Infinity, stg > 0 ? Ctg * ReH / (stg * S) : Infinity, tau > 0 ? Ct * ReH / (tau * Math.sqrt(3) * S) : Infinity);
      gC = Math.min(gC, gLim);
      const flat = plateLimit(Object.assign({}, inp, { curved: null }));
      const gam = Math.max(gC, flat.gammaC);
      return Object.assign(out, { curved: true, Kx: K.Kax, Ky: K.Ktg, Ktau: K.Kt, Cx: Cax, Cy: Ctg, Ctau: Ct, lamX: lamAx, lamY: lamTg, lamT, gammaCurved: gC, gammaFlat: flat.gammaC, gammaC: gam, eta: 1 / gam });
    }
    const Fl = inp.Flong != null ? inp.Flong : 1.0, Ft = inp.Ftran != null ? inp.Ftran : 1.0;
    const Kx = Kx1(psx, Fl), Ky = Ky2(psy, alpha, Ft), Kt = Ktau15(alpha);
    const lamX = Math.sqrt(ReH / (Kx * sigE)), lamY = Math.sqrt(ReH / (Ky * sigE)), lamT = Math.sqrt(ReH / (Kt * sigE));
    const c1 = inp.c1Mode === 'AC-III' ? 0 : inp.c1Mode === 'SP-B' ? 1 : Math.max(0, 1 - 1 / alpha);
    let Cx = sx > 0 ? Cx1(lamX, psx) : 1, Cy = sy > 0 ? Cy2(lamY, psy, Ky, c1) : 1, Ct = Ctau15(lamT);
    Object.assign(out, { Kx, Ky, Ktau: Kt, lamX, lamY, lamT, Cx, Cy, Ctau: Ct, c1 });
    // limit durumları
    const sxc = Cx * ReH, syc = Cy * ReH, tc = Ct * ReH / Math.sqrt(3);
    const B = tension ? 1.0 : 0.7 - 0.3 * betaP / (alpha * alpha), e0 = tension ? 2.0 : 2 / Math.pow(betaP, 0.25);
    out.B = B; out.e0 = e0;
    const CxT = tension ? 1 : Cx, CyT = tension ? 1 : Cy, CtT = tension ? 1 : Ct;   // [3.2.3]: σ<0 iken 1. denklemde C = 1
    const sxcT = CxT * ReH, sycT = CyT * ReH, tcT = CtT * ReH / Math.sqrt(3);
    // σ<0 (çekme) varsa e0 = 2, B = 1: X² − X·Y + Y² + T² (işaretli çarpım) ; aksi halde X, Y ≥ 0
    const f1 = g => { const X = g * sx * S / sxcT, Y = g * sy * S / sycT, T = g * tau * S / tcT;
      if (tension) return X * X - B * X * Y + Y * Y + T * T;
      return Math.pow(X, e0) - B * Math.pow(X, e0 / 2) * Math.pow(Y, e0 / 2) + Math.pow(Y, e0) + Math.pow(T, e0); };
    const e2 = 2 / Math.pow(betaP, 0.25);
    const g1 = (sx !== 0 || sy !== 0 || tau !== 0) ? solveGamma(f1, 1) : Infinity;
    const g2 = sx > 0 ? solveGamma(g => Math.pow(g * sx * S / sxc, e2) + Math.pow(g * tau * S / tc, e2), 1) : Infinity;
    const g3 = sy > 0 ? solveGamma(g => Math.pow(g * sy * S / syc, e2) + Math.pow(g * tau * S / tc, e2), 1) : Infinity;
    const g4 = tau > 0 ? tc / (tau * S) : Infinity;
    const gam = Math.min(g1, g2, g3, g4);
    return Object.assign(out, { gammas: [g1, g2, g3, g4], gammaC: gam, eta: 1 / gam });
  }
  // η = η_all olacak net kalınlık (0.01 mm) — σ, ψ, F sabit; yalnız t_p → σ_E, β_p değişir
  //   opts.tauScales: τ_hg = Q·q_v/t → kalınlıkla ters orantılı (Nauticus t_buc böyle: τ(t) = τ·t_p/t)
  function tBuckling(inp, etaAll, opts) {
    let lo = 0.5, hi = 60;
    const scale = opts && opts.tauScales, tp0 = inp.tp;
    const etaAt = t => plateLimit(Object.assign({}, inp, { tp: t, tau: scale ? inp.tau * tp0 / t : inp.tau })).eta;
    if (etaAt(hi) > etaAll) return hi;
    for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (etaAt(m) > etaAll) lo = m; else hi = m; }
    return hi;
  }
  // Ch 8 Sec 3 [2.2]: gerilme kombinasyonları (boyuna / enine takviye)
  function stressCombos(sHg, tHg, transverse) {
    return transverse
      ? [{ comb: 1, sx: 0, sy: sHg, tau: 0.7 * tHg }, { comb: 2, sx: 0, sy: 0.7 * sHg, tau: tHg }]
      : [{ comb: 1, sx: sHg, sy: 0, tau: 0.7 * tHg }, { comb: 2, sx: 0.7 * sHg, sy: 0, tau: tHg }];
  }
  // ============================================================ [3.3] profil burkulması (SI / PI) + [3.1] genel panel γ_GEB
  //   inp: {sx, sy, tau (N/mm²; basınç +), s, l (mm), tp (net, iki komşu panel ortalaması), hw, tw (net), bf, tf, type FB|L|T|HP,
  //         b1, b2 (mm), Cx1, Cx2 (Table 3 durum 1, komşu EPP), ReHS, ReHP, S, P (kN/m²; + plaka tarafı, − profil tarafı), sniped, fixity fixed|fixedSimple|simple}
  const chiS = (leff, s) => { const r = leff / s; return r >= 1 ? Math.min(1.12 / (1 + 1.75 / Math.pow(r, 1.6)), 1) : 0.407 * r; };
  function stiffenerCapacity(inp) {
    const E_ = E, nu = NU, sx = inp.sx || 0, sy = inp.sy || 0, tau = Math.abs(inp.tau || 0), s = inp.s, l = inp.l, tp = inp.tp, hw = inp.hw, S = inp.S || 1;
    const type = inp.type || 'FB', tf = inp.tf || 0, bf = inp.bf || 0, ReHS = inp.ReHS, ReHP = inp.ReHP != null ? inp.ReHP : ReHS;
    // etkin genişlik [3.3.5]
    const beff1 = sx > 0 ? (inp.Cx1 * inp.b1 + inp.Cx2 * inp.b2) / 2 : (inp.b1 + inp.b2) / 2;
    const leff = inp.fixity === 'simple' ? l : inp.fixity === 'fixedSimple' ? 0.75 * l : l / Math.sqrt(3);
    const beff = Math.min(beff1, chiS(leff, s) * s);
    // FB web azaltması [3.3.2]
    const twRed = type === 'FB' ? inp.tw * (1 - 2 * Math.PI * Math.PI / 3 * Math.pow(hw / s, 2) * (1 - beff1 / s)) : inp.tw;
    const Aw = hw * twRed, Af = type === 'FB' ? 0 : bf * tf, As = Aw + Af;
    const ef = type === 'FB' ? hw : type === 'HP' ? hw - 0.5 * tf : hw + 0.5 * tf;             // plakadan flanş merkezine
    const zw = tp / 2 + hw / 2, zf = tp / 2 + ef;                                               // plaka orta düzleminden
    const Apl = beff * tp;
    const zna = (Aw * zw + Af * zf) / (Apl + As);
    const I = twRed * Math.pow(hw, 3) / 12 + Aw * Math.pow(zw - zna, 2) + (Af ? bf * Math.pow(tf, 3) / 12 + Af * Math.pow(zf - zna, 2) : 0) + beff * Math.pow(tp, 3) / 12 + Apl * zna * zna;   // mm⁴
    const zTop = tp / 2 + hw + (type === 'FB' || type === 'HP' ? 0 : tf);
    const Zsi = I / (zTop - zna) / 1000, Zpi = I / (zna + tp / 2) / 1000;                       // cm³
    const Icm4 = I / 1e4;
    const Imin = s * Math.pow(tp, 3) / 12 / 1e4;                                                // I ≥ s t_p³/(12·10⁴)
    const sa = sx * (s * tp + As) / (beff1 * tp + As);                                          // σ_a
    // [3.1] γ_GEB
    const Ap = s * tp;
    const sxav = (sx > 0 && sy > 0) ? Math.max(0, sx - nu * sy * As / (Ap + As)) : sx;          // c = 0.5(1+ψ) = 1 (ψ = 1)
    const Nx = sxav * (Ap + As) / s, Ny = sy * tp;
    const D11 = E_ * Icm4 * 1e4 / s, D22 = E_ * Math.pow(tp, 3) / (12 * (1 - nu * nu)), D12 = D22 * nu, D33 = E_ * Math.pow(tp, 3) / (12 * (1 + nu));
    const LB1 = l, LB2 = 6 * s;
    let gBi = Infinity;
    if (Nx > 0 || Ny > 0) for (let n = 1; n <= 10; n++) {
      const num = D11 * Math.pow(LB2, 4) + 2 * (D12 + D33) * n * n * LB1 * LB1 * LB2 * LB2 + Math.pow(n, 4) * D22 * Math.pow(LB1, 4);
      const den = LB2 * LB2 * Nx + n * n * LB1 * LB1 * Ny; if (den <= 0) continue;
      const g = Math.PI * Math.PI / (LB1 * LB1 * LB2 * LB2) * num / den; if (g > 0 && g < gBi) gBi = g;
    }
    let gTau = Infinity;
    if (tau > 0) {
      const Nxy = tau * tp, r = Math.pow(D12 + D33, 2) / (D11 * D22);
      gTau = (D11 * D22 >= Math.pow(D12 + D33, 2))
        ? Math.pow(Math.pow(D11, 3) * D22, 0.25) / (Math.pow(LB1 / 2, 2) * Nxy) * (8.125 + 5.64 * Math.sqrt(r) - 0.6 * r)
        : Math.sqrt(2 * D11 * (D12 + D33)) / (Math.pow(LB1 / 2, 2) * Nxy) * (8.3 + 1.525 / r - 0.493 / (r * r));
    }
    let gGEB;
    if (tau > 0 && (sx > 0 || sy > 0)) gGEB = 0.5 * gTau * gTau * (-1 / gBi + Math.sqrt(1 / (gBi * gBi) + 4 / (gTau * gTau)));
    else if (sx > 0 || sy > 0) gGEB = gBi; else gGEB = gTau;
    // C_sl, F_E ; M0(γ) = F_E C_sl (γ/(γ_GEB − γ)) w0 ; σ_w(γ) ; (γ σ_a + σ_b(γ) + σ_w(γ)) S = R_eH → γ_c iteratif (Nauticus böyle; γ = 1 yalnız ön kontrol)
    const sEq = Math.sqrt(sxav * sxav + sy * sy - sxav * sy + 3 * tau * tau) || 1e-9;
    const gReH = Math.min(ReHP, ReHS) / sEq, lamG = Math.sqrt(gReH / gGEB);
    const Csl = lamG <= 1.56 ? 1 - Math.pow(lamG, 4) / 12 : 3 / Math.pow(lamG, 4);
    const FE = Math.pow(Math.PI / l, 2) * E_ * Icm4 * 1e4, w0 = l / 1000;
    const M0of = g => (gGEB > g) ? FE * Csl * (g / (gGEB - g)) * w0 : Infinity;
    const plateSide = (inp.P || 0) >= 0, Pabs = Math.abs(inp.P || 0);
    const m1base = Pabs * s * l * l / ((inp.sniped ? 8 : 24) * 1e3);
    const M1 = { SI: (plateSide ? -1 : 1) * m1base, PI: (plateSide ? 1 : -1) * m1base };
    // burulma referans gerilmesi (SI)
    let sET = Infinity, mtor = 1, yw = 0, phi0 = 0;
    if (sa > 0) {
      const tw = inp.tw, Ip = type === 'FB' ? Math.pow(hw, 3) * tw / 3e4 : ((Aw * Math.pow(ef - 0.5 * tf, 2) / 3 + Af * ef * ef) * 1e-4);
      const IT = type === 'FB' ? hw * Math.pow(tw, 3) / 3e4 * (1 - 0.63 * tw / hw) : ((ef - 0.5 * tf) * Math.pow(tw, 3) / 3e4 * (1 - 0.63 * tw / (ef - 0.5 * tf)) + bf * Math.pow(tf, 3) / 3e4 * (1 - 0.63 * tf / bf));
      const Iw = type === 'FB' ? Math.pow(hw, 3) * Math.pow(tw, 3) / 36e6 : type === 'T' ? Math.pow(bf, 3) * tf * ef * ef / 12e6 : ((Math.pow(Af, 3) + Math.pow(Aw, 3)) / 36e6 + ef * ef / 1e6 * ((Af * bf * bf + Aw * tw * tw) / 3 - Math.pow(Af * bf + Aw * tw, 2) / (4 * (Af + Aw))));
      const eps = type === 'FB' ? Math.pow(tp, 3) / (3 * s) : 1 / (3 * s / Math.pow(tp, 3) + 2 * hw / Math.pow(tw, 3));
      const ltor = inp.ltor || l;
      for (let m = 1; m <= 20; m++) { const v = E_ / Ip * (Math.pow(m * Math.PI / ltor, 2) * Iw * 100 + IT / (2 * (1 + nu)) + Math.pow(ltor / (m * Math.PI), 2) * eps * 1e-4); if (v < sET) { sET = v; mtor = m; } }
      yw = type === 'FB' ? tw / 2 : type === 'T' ? bf / 2 : bf - (hw * tw * tw + tf * bf * bf) / (2 * As);
      phi0 = (inp.ltor || l) / (mtor * hw) * 1e-4;
    }
    const swOf = g => (sa > 0 && sET > g * sa) ? E_ * yw * ef * phi0 * Math.pow(mtor * Math.PI / (inp.ltor || l), 2) * (1 / (1 - g * sa / sET) - 1) : (sa > 0 ? Infinity : 0);
    const cap = mode => {
      const Z = mode === 'SI' ? Zsi : Zpi, ReH = mode === 'SI' ? ReHS : ReHP;
      const f = g => (g * sa + (M0of(g) + M1[mode]) / (1000 * Z) + (mode === 'SI' ? swOf(g) : 0)) * S / ReH;   // = 1 → γ_c
      const pre = f(1);                                                   // γ = 1 ön kontrol: σ_a + σ_b + σ_w > 0 ?
      if (!(pre > 0)) return { eta: 0, sa, sb: (M0of(1) + M1[mode]) / (1000 * Z), sw: 0, Z, ReH, M0: M0of(1) };
      // σ_a ≤ 0 (eksenel basınç yok): M0 = 0, η = (σ_b + σ_w) S/R_eH (Nauticus: yalnız yanal yük + burulma)
      if (!(sa > 0)) { const sb = M1[mode] / (1000 * Z); return { eta: Math.max(0, sb) * S / ReH, sa, sb, sw: 0, Z, ReH, M0: 0, gammaC: null }; }
      let lo = 0, hi = Math.min(gGEB, sa > 0 ? sET / sa : Infinity, 1e6);
      if (!isFinite(hi)) hi = 1e6;
      for (let i = 0; i < 100; i++) { const m = (lo + hi) / 2; if (f(m) < 1) lo = m; else hi = m; }
      const gc = (lo + hi) / 2;
      return { eta: 1 / gc, sa, sb: (M0of(gc) + M1[mode]) / (1000 * Z), sw: mode === 'SI' ? swOf(gc) : 0, Z, ReH, M0: M0of(gc), gammaC: gc }; };
    const SI = cap('SI'), PI = cap('PI');
    [SI, PI].forEach(c => { if (!isFinite(c.eta) || c.eta > 99) c.eta = 99; });            // sonsuz kapasite aşımı → 99 (γ_GEB ≤ 1, σ_ET ≤ σ_a)
    const mode = SI.eta >= PI.eta ? 'SI' : 'PI';
    const M0 = (mode === 'SI' ? SI : PI).M0;
    return { eta: Math.max(SI.eta, PI.eta), mode, SI, PI, beff, beff1, twRed, As, I: Icm4, Imin, Zsi, Zpi, M0, M1, gammaGEB: gGEB, gammaBi: gBi, gammaTau: gTau, Csl, lamG, sigmaET: sET, mtor, sa, FE };
  }
  return { E, NU, KE, ETA_ALL, Kx1, Cx1, Ky2, Cy2, Ktau15, Ctau15, curvedK, curvedC, FlongEdge, Flong, solveGamma, plateLimit, tBuckling, stressCombos, chiS, stiffenerCapacity };
});
