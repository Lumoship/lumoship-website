/* ==========================================================================
   21-buckling.js  —  LR Pt 3 Ch 4 Sec 7 hull buckling (window.Buckling)
   Extracted verbatim from Index.html (lines 14662–15032 of the
   original single-file build). Load order is significant: see index.html.
   ========================================================================== */
// ==========================================================================
// LR Pt 3 Ch 4 Sec 7 — HULL BUCKLING STRENGTH
// ==========================================================================
// JS port of Python lr_buckling.py (LR July 2025).
// Implements:
//   Table 4.7.1  Standard corrosion deduction dt
//   Table 4.7.2  Plate elastic critical buckling (comp + shear)
//   Table 4.7.3  Longitudinal elastic critical (column, torsional, web)
//   Section 7.4  Design stress
//   Section 7.5  Scantling criteria (beta=1.0 plating, 1.1 longs)
// ==========================================================================
window.Buckling = (function() {
  const E = 206000;    // N/mm² steel modulus (Rule uses this)

  // ── MATERIALS ────────────────────────────────────────────────────────
  const MATERIALS = {
    MS:   { name:'Mild Steel', sigma_o: 235, kL: 1.00 },
    AH32: { name:'AH32',       sigma_o: 315, kL: 0.78 },
    AH36: { name:'AH36',       sigma_o: 355, kL: 0.72 },
    AH40: { name:'AH40',       sigma_o: 390, kL: 0.68 },
  };
  function mat(name) {
    const m = MATERIALS[name] || MATERIALS.AH36;
    return { ...m, tau_o: m.sigma_o / Math.sqrt(3) };
  }

  // ── CORROSION Table 4.7.1 ────────────────────────────────────────────
  // LR Pt 3 Ch 4 Table 4.7.1 — Standard Deduction for Corrosion d_t.
  // Five categories grouped into THREE distinct numerical sets:
  //
  //   (a) Dry bulk cargo compartments              → 0.05·t / 0.5–1.0  ┐ same
  //   (b) One-side WB exposure, vertical surface   → 0.05·t / 0.5–1.0  ┘ values
  //
  //   (c) One-side WB exposure, horizontal surface → 0.10·t / 2.0–3.0  ┐ same
  //   (d) Two-side WB exposure, vertical surface   → 0.10·t / 2.0–3.0  ┘ values
  //
  //   (e) Two-side WB exposure, horizontal surface → 0.15·t / 2.0–4.0
  //
  // d_t = frac·t clamped to [dt_min, dt_max].
  const CORROSION = {
    // (a) — dry bulk cargo. Plate exposed to dry cargo only.
    DRY_BULK:        { frac: 0.05, dt_min: 0.5, dt_max: 1.0,
                       label: '(a) Dry bulk cargo compartment' },
    // (b) — one side water ballast / liquid cargo, vertical (>25° to horizontal).
    //       Same numerics as (a).
    ONE_WB_VERT:     { frac: 0.05, dt_min: 0.5, dt_max: 1.0,
                       label: '(b) One-side WB exposure, vertical surface' },
    // (c) — one side water ballast / liquid cargo, horizontal (<25° to horizontal).
    ONE_WB_HORIZ:    { frac: 0.10, dt_min: 2.0, dt_max: 3.0,
                       label: '(c) One-side WB exposure, horizontal surface' },
    // (d) — two-side WB / liquid, vertical surface. Same numerics as (c).
    TWO_WB_VERT:     { frac: 0.10, dt_min: 2.0, dt_max: 3.0,
                       label: '(d) Two-side WB exposure, vertical surface' },
    // (e) — two-side WB / liquid, horizontal surface. Worst case.
    TWO_WB_HORIZ:    { frac: 0.15, dt_min: 2.0, dt_max: 4.0,
                       label: '(e) Two-side WB exposure, horizontal surface' },
    // No deduction (special case)
    CUSTOM:          { frac: 0.00, dt_min: 0.0, dt_max: 0.0,
                       label: 'Custom / no deduction' },
  };
  function computeDt(t, catKey) {
    const c = CORROSION[catKey] || CORROSION.DRY_BULK;
    if (catKey === 'CUSTOM') return 0;
    const dt_raw = c.frac * t;
    return Math.min(Math.max(dt_raw, c.dt_min), c.dt_max);
  }

  // ── YIELD CORRECTION (Table 4.7.2 / 4.7.3 Notes) ─────────────────────
  // If sigma_E <= sigma_o/2: sigma_CRB = sigma_E (elastic regime)
  // Else: sigma_CRB = sigma_o · (1 − sigma_o/(4 sigma_E))  (Johnson)
  function correctYield(sigma_E, sigma_o) {
    if (sigma_E <= 0) return 0;
    if (sigma_E <= sigma_o / 2) return sigma_E;
    return sigma_o * (1 - sigma_o / (4 * sigma_E));
  }

  // ── TRANSVERSE STIFFENING COEFFICIENT c (Table 4.7.2 b) ──────────────
  const C_COEFF = {
    FLOOR:       1.30,  // floors, deep girders
    BUILTUP:     1.21,  // built-up sections, angles
    BULB:        1.10,  // bulb plates
    FLAT_BAR:    1.05,  // flat bars
  };

  // ── PLATE PANEL — Table 4.7.2 ────────────────────────────────────────
  // Input: { s_mm, t_mm, S_m, sigma_A, tau_A, stiffening, c_type?, corrosion, material }
  // Returns: {...all quantities + UC + pass flags}
  function checkPlate(p) {
    const m = typeof p.material === 'string' ? mat(p.material) : mat('AH36');
    const dt = computeDt(p.t_mm, p.corrosion);
    const tp = p.t_mm - dt;
    const s = p.s_mm, S = p.S_m;
    const sigma_A = Math.abs(p.sigma_A || 0);
    const tau_A = Math.abs(p.tau_A || 0);

    // Compression sigma_E (Table 4.7.2 a or b)
    let sigma_E_comp;
    if (p.stiffening === 'LONGITUDINAL') {
      // Case (a)
      sigma_E_comp = 3.6 * E * Math.pow(tp / s, 2);
    } else {
      // Case (b) — transverse stiffened
      const c = C_COEFF[p.c_type || 'BUILTUP'] || 1.21;
      sigma_E_comp = 0.9 * c * Math.pow(1 + Math.pow(s / (1000 * S), 2), 2)
                     * E * Math.pow(tp / s, 2);
    }
    // Shear tau_E (Table 4.7.2 c)
    const tau_E = 3.6 * (1.335 + Math.pow(s / (1000 * S), 2)) * E * Math.pow(tp / s, 2);

    // Yield correction
    const sigma_CRB = correctYield(sigma_E_comp, m.sigma_o);
    const tau_CRB = correctYield(tau_E, m.tau_o);

    // Scantling criteria Section 7.5 — beta=1.0 for plating
    const beta = 1.0;
    const UC_comp = sigma_CRB > 0 ? (beta * sigma_A) / sigma_CRB : Infinity;
    const UC_shear = tau_CRB > 0 ? tau_A / tau_CRB : Infinity;
    const pass_comp = sigma_CRB >= beta * sigma_A;
    const pass_shear = tau_CRB >= tau_A;

    return {
      dt_mm: dt, tp_mm: tp,
      sigma_E_comp, sigma_CRB, sigma_A,
      tau_E, tau_CRB, tau_A,
      UC_comp, UC_shear,
      pass_comp, pass_shear,
      pass_all: pass_comp && pass_shear,
      material: m.name,
    };
  }

  // ── LONGITUDINAL — Table 4.7.3 ───────────────────────────────────────
  // Input: { d_w, t_w, b_f, t_f, s_mm, t_p_mm, S_m, prof, sigma_A,
  //          corrosion, corrosion_plate, material }
  // prof: 'FLAT_BAR' | 'TEE' | 'L' | 'ROLLED_ANGLE' | 'BULB'
  function checkLong(p) {
    const m = typeof p.material === 'string' ? mat(p.material) : mat('AH36');

    // Corrosion-deducted net thicknesses
    const dt_w = computeDt(p.t_w, p.corrosion);
    const dt_f = p.t_f > 0 ? computeDt(p.t_f, p.corrosion) : 0;
    const dt_p = computeDt(p.t_p_mm, p.corrosion_plate || p.corrosion);
    const tw = p.t_w - dt_w;
    const tf = p.t_f > 0 ? p.t_f - dt_f : 0;
    const tp = p.t_p_mm - dt_p;
    const dw = p.d_w, bf = p.b_f, s = p.s_mm, S = p.S_m;
    const prof = p.prof || 'FLAT_BAR';
    const sigma_A = Math.abs(p.sigma_A || 0);

    // ── Section geometry ────────────────────────────────────────────
    // Areas in cm²
    const A_web_cm2 = (dw * tw) / 100;
    const A_flange_cm2 = (prof === 'FLAT_BAR' || tf === 0) ? 0 : (bf * tf) / 100;
    const A_plate_cm2 = (s * tp) / 100;
    const A_t_cm2 = A_web_cm2 + A_flange_cm2 + A_plate_cm2;

    // I_a (about NA parallel to plate, with attached plate) — in mm⁴
    const A_p_mm2 = s * tp;
    const A_w_mm2 = dw * tw;
    const A_f_mm2 = (prof === 'FLAT_BAR' || tf === 0) ? 0 : bf * tf;
    const y_p = 0;
    const y_w = tp / 2 + dw / 2;
    const y_f = (A_f_mm2 > 0) ? tp / 2 + dw + tf / 2 : 0;
    const A_tot = A_p_mm2 + A_w_mm2 + A_f_mm2;
    const y_bar = (A_p_mm2 * y_p + A_w_mm2 * y_w + A_f_mm2 * y_f) / A_tot;
    const I_p_own = s * Math.pow(tp, 3) / 12;
    const I_w_own = tw * Math.pow(dw, 3) / 12;
    const I_f_own = tf > 0 ? bf * Math.pow(tf, 3) / 12 : 0;
    const I_a_mm4 = I_p_own + A_p_mm2 * Math.pow(y_bar, 2)
                  + I_w_own + A_w_mm2 * Math.pow(y_w - y_bar, 2)
                  + I_f_own + A_f_mm2 * Math.pow(y_f - y_bar, 2);
    const I_a_cm4 = I_a_mm4 / 1e4;

    // I_t St. Venant torsion constant (cm⁴)
    let I_t_cm4;
    if (prof === 'FLAT_BAR') {
      I_t_cm4 = (dw * Math.pow(tw, 3) / 3) * 1e-4;
    } else {
      const term_w = dw * Math.pow(tw, 3);
      const term_f = (bf > 0 && tf > 0) ? bf * Math.pow(tf, 3) * (1 - 0.63 * tf / bf) : 0;
      I_t_cm4 = (1/3) * (term_w + term_f) * 1e-4;
    }

    // I_p polar about connection of stiffener to plating (cm⁴)
    let I_p_cm4;
    if (prof === 'FLAT_BAR') {
      I_p_cm4 = (Math.pow(dw, 3) * tw / 3) * 1e-4;
    } else {
      const term1 = Math.pow(dw, 3) * tw / 3;
      const term2 = tf > 0 ? Math.pow(dw, 2) * bf * tf : 0;
      I_p_cm4 = (term1 + term2) * 1e-4;
    }

    // I_w sectorial (warping) moment of inertia (cm⁶)
    let I_w_cm6;
    if (prof === 'FLAT_BAR') {
      I_w_cm6 = (Math.pow(dw, 3) * Math.pow(tw, 3) / 36) * 1e-6;
    } else if (prof === 'TEE') {
      I_w_cm6 = (tf === 0 || bf === 0) ? 0
                : (tf * Math.pow(bf, 3) * Math.pow(dw, 2) / 12) * 1e-6;
    } else {
      // L / angle / bulb
      if (bf === 0 || tf === 0) {
        I_w_cm6 = (Math.pow(dw, 3) * Math.pow(tw, 3) / 36) * 1e-6;
      } else {
        const numerator = (Math.pow(bf, 3) * Math.pow(dw, 2)) / (12 * Math.pow(bf + dw, 2));
        const bracket = tf * (Math.pow(bf, 2) + 2 * bf * dw + 4 * Math.pow(dw, 2))
                      + 3 * tw * bf * dw;
        I_w_cm6 = numerator * bracket * 1e-6;
      }
    }

    // ── Mode (a) Column buckling ────────────────────────────────────
    // sigma_E = 0.001 · E · I_a / (A_t · S²)
    const sigma_E_col = (A_t_cm2 > 0 && S > 0)
      ? 0.001 * E * I_a_cm4 / (A_t_cm2 * S * S)
      : 0;

    // ── Mode (b) Torsional buckling ─────────────────────────────────
    // Spring stiffness C from supporting plate (Table 4.7.3 note)
    // First compute plate sigma_E (Case a, longitudinal stiffening).
    let sigma_E_tor = 0;
    if (I_p_cm4 > 0 && I_w_cm6 > 0 && S > 0 && tw > 0 && s > 0) {
      const sigma_E_plate = 3.6 * E * Math.pow(tp / s, 2);
      const eta_p = sigma_E_plate > 0 ? sigma_A / sigma_E_plate : 0;
      let k_p = Math.max(0, 1 - eta_p);
      if (prof !== 'FLAT_BAR') k_p = Math.max(k_p, 0.1);

      const denom = 3 * s * (1 + 1.33 * k_p * dw * Math.pow(tp, 3) / (s * Math.pow(tw, 3)));
      const C = k_p * E * Math.pow(tp, 3) / denom;
      const K = 1.03 * C * Math.pow(S, 4) / (E * I_w_cm6) * 1e4;

      // Find m: smallest integer where (m-1)²·m² < K ≤ m²·(m+1)²
      let m_idx = 1;
      if (K > 0) {
        while (m_idx <= 50) {
          const lower = Math.pow(m_idx - 1, 2) * Math.pow(m_idx, 2);
          const upper = Math.pow(m_idx, 2) * Math.pow(m_idx + 1, 2);
          if (lower < K && K <= upper) break;
          m_idx++;
        }
      }
      const term1 = (0.001 * E * I_w_cm6 / (I_p_cm4 * S * S))
                    * (m_idx * m_idx + K / (m_idx * m_idx));
      const term2 = 0.385 * E * I_t_cm4 / I_p_cm4;
      sigma_E_tor = term1 + term2;
    }

    // ── Mode (c) Web buckling (excluded for flat bars) ──────────────
    const sigma_E_web = prof === 'FLAT_BAR' || dw <= 0
      ? 0
      : 3.8 * E * Math.pow(tw / dw, 2);

    // ── Yield correction ────────────────────────────────────────────
    const sigma_CRB_col = correctYield(sigma_E_col, m.sigma_o);
    const sigma_CRB_tor = correctYield(sigma_E_tor, m.sigma_o);
    const sigma_CRB_web = correctYield(sigma_E_web, m.sigma_o);

    // Scantling criterion Section 7.5.1: σ_CRB ≥ β·σ_A, where 7.5.1 gives
    //   β = 1,1 for longitudinals (column and torsional buckling), and
    //   β = 1,0 for "web plating of longitudinals (local buckling)".
    // The two β values differ by mode, so the governing mode is the one with
    // the highest utilisation β·σ_A/σ_CRB — not simply the lowest σ_CRB.
    // Ranking on raw σ_CRB under a single β = 1,1 (as this used to do) both
    // overstated UC by 10 % whenever web buckling governed and could name the
    // wrong governing mode.
    const modes = [{ name: 'column', sigma_CRB: sigma_CRB_col, beta: 1.1 }];
    if (sigma_E_tor > 0) modes.push({ name: 'torsional', sigma_CRB: sigma_CRB_tor, beta: 1.1 });
    if (sigma_E_web > 0) modes.push({ name: 'web',       sigma_CRB: sigma_CRB_web, beta: 1.0 });
    modes.forEach(mo => { mo.UC = mo.sigma_CRB > 0 ? (mo.beta * sigma_A) / mo.sigma_CRB : Infinity; });
    modes.sort((a, b) => b.UC - a.UC);
    const gov = modes[0];

    const beta = gov.beta;
    const UC = gov.UC;
    const pass_buckling = gov.sigma_CRB >= beta * sigma_A;

    // Flange proportion (Table 4.7.3 Note 3) — b_f/t_f ≤ 15 (angles), ≤ 30 (Tees)
    let flange_ratio = null, flange_limit = null, flange_ok = null;
    if (prof !== 'FLAT_BAR' && bf > 0 && p.t_f > 0) {
      flange_ratio = bf / p.t_f;
      flange_limit = (prof === 'TEE') ? 30 : 15;
      flange_ok = flange_ratio <= flange_limit;
    }

    return {
      tp_mm: tp, tw_mm: tw, tf_mm: tf,
      A_t_cm2, I_a_cm4, I_p_cm4, I_t_cm4, I_w_cm6,
      sigma_E_col, sigma_E_tor, sigma_E_web,
      sigma_CRB_col, sigma_CRB_tor, sigma_CRB_web,
      sigma_CRB_gov: gov.sigma_CRB,
      governing_mode: gov.name,
      sigma_A, beta, UC,
      pass_buckling,
      flange_ratio, flange_limit, flange_ok,
      pass_all: pass_buckling && (flange_ok === null || flange_ok === true),
      material: m.name,
    };
  }

  // ── DESIGN STRESS Section 7.4 ────────────────────────────────────────
  // sigma_A = sigma_face · (z_from_NA / z_face)
  // minimum 30/kL
  function sigmaADesign(sigma_face, z_from_NA, z_face, kL) {
    if (!z_face || z_face <= 0) return 30 / (kL || 0.72);
    const sig = Math.abs(sigma_face * (z_from_NA / z_face));
    return Math.max(sig, 30 / (kL || 0.72));
  }

  // ── Initial shear design stress Section 7.4.2 ────────────────────────
  function tauADesignInitial(kL) {
    return 110 / (kL || 0.72);
  }

  // ── Corrosion auto-assign based on the two compartments sharing a plate
  // Returns one of: 'DRY_BULK', 'ONE_WB_VERT', 'ONE_WB_HORIZ',
  //                 'TWO_WB_VERT', 'TWO_WB_HORIZ', 'CUSTOM'
  // comp_a, comp_b can be null (=sea or weather exposure).
  // ── Corrosion auto-assign based on the two compartments sharing a plate
  // Decision tree (LR Pt 3 Ch 4 Tablo 4.7.1):
  //
  //   Both sides liquid (tank, sea, weather)?
  //     → Two-side WB exposure
  //         vertical → TWO_WB_VERT  (0.10·t / 2-3)
  //         horizontal → TWO_WB_HORIZ (0.15·t / 2-4)
  //   One side liquid + one side dry (cargo, void)?
  //     → One-side WB exposure
  //         vertical → ONE_WB_VERT  (0.05·t / 0.5-1)
  //         horizontal → ONE_WB_HORIZ (0.10·t / 2-3)
  //   Both sides dry (cargo, void)?
  //     → DRY_BULK (0.05·t / 0.5-1) — cargo or void with no liquid contact
  //
  // 'plateOrientation' must be 'horizontal' or 'vertical'. Plates with
  // slope > 25° from horizontal are treated as vertical; < 25° as horizontal
  // (LR Tablo 4.7.1 Note convention).
  function corrosionFromComps(comp_a, comp_b, plateOrientation) {
    // Liquid-side check: tank (ballast/fuel/freshwater) OR exposed to sea/weather
    // (null = treated as sea/weather exposure on outer hull plates).
    const isLiquid = c => !c || c.type === 'sea' || c.type === 'weather'
                       || (c && (c.type === 'ballast' || c.type === 'fuel'
                                 || c.type === 'freshwater'));
    const isDry = c => c && (c.type === 'cargo' || c.type === 'void');
    const isHoriz = (plateOrientation === 'horizontal');

    const aLiquid = isLiquid(comp_a);
    const bLiquid = isLiquid(comp_b);
    const aDry = isDry(comp_a);
    const bDry = isDry(comp_b);

    // Both sides void → no corrosion exposure (special case)
    if (comp_a && comp_b && comp_a.type === 'void' && comp_b.type === 'void') {
      return 'CUSTOM';
    }
    // Two-side liquid exposure (e.g. tank-tank, tank-sea, sea-sea)
    if (aLiquid && bLiquid) {
      return isHoriz ? 'TWO_WB_HORIZ' : 'TWO_WB_VERT';
    }
    // One-side liquid + one-side dry (e.g. tank-cargo, sea-cargo)
    if ((aLiquid && bDry) || (aDry && bLiquid)) {
      return isHoriz ? 'ONE_WB_HORIZ' : 'ONE_WB_VERT';
    }
    // Both sides dry (cargo-cargo, cargo-void, void-cargo)
    if (aDry && bDry) {
      return 'DRY_BULK';
    }
    // Default fallback
    return 'DRY_BULK';
  }

  return {
    MATERIALS, CORROSION, C_COEFF,
    mat, computeDt, correctYield,
    checkPlate, checkLong,
    sigmaADesign, tauADesignInitial,
    corrosionFromComps,
  };
})();

