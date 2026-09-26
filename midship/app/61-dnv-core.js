// =============================================================================
// 61-dnv-core.js — DNV RU-SHIP Pt 3 çekirdeği, 1. bölüm: yüksüz kontroller
//   M1 malzeme (Ch 3 Sec 1 [2.2] Table 2)
//   M2 korozyon payı (Ch 3 Sec 3 [1.2], Table 1)
//   M5 minimum kalınlık (Ch 6 Sec 3 Table 1 plaka, Table 2 stiffener, Table 3 PSM)
//   M8 narinlik (Ch 8 Sec 2 [2] plaka, [3] stiffener, [4] PSM, [5] braket)
//   + net/brüt ve yuvarlama (Ch 3 Sec 2 [1.2], [1.3.1])
//
// SAF: DOM yok, SECTION yok. Tarayıcıda window.DNV, node'da module.exports.
// Doğrulama: _dev/dnv-ref/verify-dnv.js → Nauticus fikstürü (iki kesit).
// Kural metni: ClauseFinder dnv-ruship-2026 (Temmuz 2026); Nauticus Temmuz 2022.
// Her formülün yanında madde numarası var; metin _dev/dnv-ref/kural-metin-*.txt.
// =============================================================================
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DNV = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ------------------------------------------------------------ yardımcı
  const T_RES = 0.5;                                   // Ch 3 Sec 3 [1.2.3]: t_res = 0.5
  // Ch 1 Sec 4: L1 = L, 200 m'yi geçmez; L2 = L, 300 m'yi geçmez (DOĞRULA: Ch 1 Sec 4 [3.1])
  const L1 = L => Math.min(L, 200);
  const L2 = L => Math.min(L, 300);

  // Ch 3 Sec 2 [1.3.1]: "rounding … to the nearest half millimetre"
  //   10.75 ≤ t < 11.25 → 11.0 ; 11.25 ≤ t < 11.75 → 11.5
  function roundHalf(t) { return Math.round(t * 2) / 2; }

  // ------------------------------------------------------------ M1 malzeme
  // Ch 3 Sec 1 Table 2 — ara değerler doğrusal enterpolasyon ([2.2])
  const K_TABLE = [[235, 1.00], [315, 0.78], [355, 0.72], [390, 0.68], [460, 0.62]];
  function kFactor(ReH, opts) {
    if (ReH <= 235) return 1.0;
    if (ReH === 390 && opts && opts.fatigueAssessed) return 0.66;   // Table 2 not 1)
    for (let i = 1; i < K_TABLE.length; i++) {
      const [r0, k0] = K_TABLE[i - 1], [r1, k1] = K_TABLE[i];
      if (ReH <= r1) return k0 + (k1 - k0) * (ReH - r0) / (r1 - r0);
    }
    return 0.62;
  }
  // Nauticus malzeme adları (VL-NS/32/36/40/47) → R_eH
  const GRADES = { 'VL-NS': 235, 'NS': 235, 'A': 235, 'AH32': 315, 'VL-32': 315, 'AH36': 355, 'VL-36': 355, 'VL-40': 390, 'AH40': 390, 'VL-47': 460 };
  function ReHOf(name, fallback) { return GRADES[String(name).toUpperCase().replace(/\s+/g, '')] || fallback || 235; }

  // ------------------------------------------------------------ M2 korozyon
  // Ch 3 Sec 3 Table 1 — bir yüz için t_c1 / t_c2. Kompartıman tipi anahtarları:
  const COMP = {
    cargoOil:       { innerBottom: 0.5, other: 0.0 },              // 1)
    holdGrab:       { lower: 2.5, other: 0.5 },                    // 2) Grab(3-X): alt 3.0 m
    hold:           { lower: 1.0, other: 0.5 },                    // 3) diğer: alt 1.5 m
    external:       { all: 0.5 },                                  // "External surfaces"
    ballast:        { all: 1.0 },                                  // balast / deniz suyu tankı
    fuelOil:        { all: 0.0 },                                  // potable water, FO, LO
    bilgeBrine:     { all: 1.0 },                                  // brine, urea, bilge, drain, chain locker
    otherTank:      { all: 0.5 },                                  // 5) fresh water, RSW, live fish, mud
    accommodation:  { all: 0.0 },
    void:           { bottomPlate: 0.5, other: 0.0 },              // 4) 6) 7) void/dry; kompartımanın tabanı 0.5
    stainless:      { all: 0.0 },
  };
  // yüz: 'bottomPlate' (kompartımanın tabanı / güverte üst yüzü), 'lower' (ambar alt bölge), 'innerBottom', 'other'
  function tc1(compType, face) {
    const c = COMP[compType]; if (!c) throw new Error('DNV corrosion: unknown compartment type ' + compType);
    if ('all' in c) return c.all;
    return (face in c) ? c[face] : c.other;
  }
  // Plaka: iki yüz + rezerv  [1.2.1]; [1.2.5] tavan 0.2·t_gr_off; [1.2.7] birden çok değerde en büyüğü
  function plateCorrosion(sideA, sideB, t_gr_off) {
    const a = tc1(sideA.type, sideA.face || 'other'), b = tc1(sideB.type, sideB.face || 'other');
    let tc = a + b + T_RES;
    const cap = t_gr_off ? 0.2 * t_gr_off : Infinity;
    return { tc1: a, tc2: b, tres: T_RES, tc: Math.min(tc, cap), capped: tc > cap };
  }
  // İç eleman (aynı kompartımanın içinde iki yüzü de): [1.2.2] tc = 2·tc1 + tres
  function internalCorrosion(compType, face, t_gr_off) {
    const a = tc1(compType, face || 'other');
    let tc = 2 * a + T_RES;
    const cap = t_gr_off ? 0.2 * t_gr_off : Infinity;
    return { tc1: a, tc2: a, tres: T_RES, tc: Math.min(tc, cap), capped: tc > cap };
  }
  // Stiffener [1.2.6]: bağlandığı plakadaki konuma göre — plaka hangi kompartımana bakıyorsa
  // profil o kompartımanın iç elemanı. Tavan web/flanş için ayrı uygulanır.
  function stiffenerCorrosion(compType, face, tw_gr, tf_gr) {
    const w = internalCorrosion(compType, face, tw_gr), f = tf_gr ? internalCorrosion(compType, face, tf_gr) : null;
    return { tc_w: w.tc, tc_f: f ? f.tc : w.tc, tc1: w.tc1 };
  }

  // ------------------------------------------------------------ M5 minimum kalınlık
  // Ch 6 Sec 3 Table 1 — t_net = a + b·L2·√k  [1.1.1]
  //   loc anahtarı → {a, b}; deck/side bantları çağıranın seçtiği anahtarla
  const MIN_PLATE = {
    // keel: 2026 metninde bottom ile aynı satırda (4.5/0.035); Nauticus (Temmuz 2022) 10.124 = 5.0 + 0.05·L2·√k
    // veriyor → 2022 Table 1'de ayrı keel satırı. Fikstür esas (PLAN-DNV §4). DOĞRULA: 2022 metni.
    keel: [5.0, 0.05], bottom: [4.5, 0.035], bilge: [4.5, 0.035], seaChest: [4.5, 0.035],
    side_to_TSC46: [4.0, 0.035],   // bilge üstünden T_SC + 4.6 m'ye
    side_46_69:    [4.0, 0.025],   // T_SC + 4.6 … 6.9  6)
    side_69_92:    [4.0, 0.015],   // T_SC + 6.9 … 9.2  6)
    side_above:    [4.0, 0.01],    // üstü 6) 7)
    weatherDeck:   [4.5, 0.02],    // 1)…5) ; strength deck 2) 3)
    deckTankBoundary: [4.5, 0.015],// kargo tankı / balast / dökme yük ambarı sınırı güverte
    otherDeck:     [4.5, 0.01],    // 3) 4) 5)
    innerBottomCargo: [5.5, 0.025],// ambar ağzından yüklenen mahal (konteyner hariç)
    innerBottomOther: [4.5, 0.02],
    bhdTank:       [4.5, 0.015],   // kargo tankı, balast, dökme ambar perdesi 9); pik perdeleri
    bhdWT:         [4.5, 0.01],    // su geçirmez ve diğer tank perdeleri 8) 9)
    bhdNonTightInTank: [5.0, 0.005],
    bhdNonTightOther:  [5.0, 0.0],
    accommodationWall: [4.5, 0.0],
  };
  // Notlar (Table 1): 1) baş 0.2 L'de weather deck b ≥ 0.01; 2) 0.7 D üstünde 2 sürekli güverte → b − 0.01;
  // 3) >2 güverte → b = 0; 4) boyuna mukavemete katılmayan güverte b = 0; 5) ahşap/reçine kaplı a = 4.0;
  // 6) üstyapı bordası T_SC + 4.6 üstü, servis kısıtlı → b = 0.01; 7) ≥2 sürekli güverte 0.7 D → 1.7 C_w üstü b = 0
  // Nauticus bottom/side ayrımı (fikstürden): plakanın ÜST ucu z ≤ ~500 mm → bottom (4.5/0.035), üstü → side bandı.
  //   ref. kesit A Plate1 (z 0–222) bottom; ref. kesit A Plate2 (222–1432) ve ref. kesit B bilge yayı (0–1382) side. Eşik VARSAYIM; bilge iki
  //   plakaya bölünmüş bir kesit gelince kesinleşir.
  const BOTTOM_TOP_Z = 500;
  function shellLoc(startZ_mm, endZ_mm, TSC_m, isKeel) {
    if (isKeel) return 'keel';
    if (Math.max(startZ_mm, endZ_mm) <= BOTTOM_TOP_Z) return 'bottom';
    return sideBand((startZ_mm + endZ_mm) / 2, TSC_m, 0);
  }
  // Güverte notları (Table 1): 2) 0.7 D üstünde 2 sürekli güverte → b − 0.01 ; 3) >2 → b = 0 ; 4) mukavemete katılmıyor → b = 0
  function deckAdj(nDecksAbove07D, contributes) {
    if (contributes === false) return { b: 0 };
    if (nDecksAbove07D >= 3) return { b: 0 };
    if (nDecksAbove07D === 2) return { db: -0.01 };
    return null;
  }
  function sideBand(z_mm, TSC_m, bilgeTop_mm) {
    const z = z_mm / 1000, T = TSC_m;
    if (z <= (bilgeTop_mm || 0) / 1000) return 'bilge';
    if (z <= T + 4.6) return 'side_to_TSC46';
    if (z <= T + 6.9) return 'side_46_69';
    if (z <= T + 9.2) return 'side_69_92';
    return 'side_above';
  }
  function minPlateNet(loc, L, k, adj) {
    const row = MIN_PLATE[loc]; if (!row) throw new Error('DNV minimum thickness: unknown location ' + loc);
    let [a, b] = row;
    if (adj) { if (adj.a != null) a = adj.a; if (adj.b != null) b = adj.b; if (adj.db) b = Math.max(0, b + adj.db); }
    return a + b * L2(L) * Math.sqrt(k);
  }
  // Ch 6 Sec 3 [2.1] Table 2 — stiffener / tripping bracket net web+flanş
  //   ayrıca web ≥ 0.40 × bağlı plakanın gerekli net kalınlığı (Sec 4)
  const MIN_STIFF = { tankShellHold: L => 4.5 + 0.01 * L1(L), superstructure: () => 4.0, other: L => 4.5 + 0.005 * L1(L), tripping: L => 4.5 + 0.01 * L1(L) };
  function minStiffNet(loc, L, tPlateReqNet) {
    const f = MIN_STIFF[loc]; if (!f) throw new Error('DNV minimum stiffener: unknown location ' + loc);
    const t = f(L);
    return { t_min_net: Math.max(t, tPlateReqNet ? 0.4 * tPlateReqNet : 0), table: t, fortyPct: tPlateReqNet ? 0.4 * tPlateReqNet : null };
  }
  // Ch 6 Sec 3 [3.1] Table 3 — PSM web/flanş: t = a + b·L2·√k, bL2 tavanları
  const MIN_PSM = {
    centreGirderCargoBhd: [5.0, 0.03, 5.0], bottomGirder: [5.0, 0.017, 5.0], floorAftPeak: [5.0, 0.025, 5.0],
    floor: [5.0, 0.015, 5.0], psmTankShell: [4.5, 0.015, 5.0], psmSuperstructure: [4.5, 0.01, 2.0], psm: [4.5, 0.01, 5.0],
    stringerDoubleSideDry: [4.5, 0.015, 2.5],
  };
  function minPSMNet(loc, L, k) {
    const r = MIN_PSM[loc]; if (!r) throw new Error('DNV minimum PSM: unknown location ' + loc);
    const [a, b, cap] = r;
    return a + Math.min(b * L2(L), cap) * Math.sqrt(k);
  }

  // ------------------------------------------------------------ M8 narinlik (Ch 8 Sec 2)
  // [2.2] t_p ≥ b/C·√(R_eH/235)?  — DİKKAT: metinde t_p ≥ b/C ; C Table 1: dış kaplama+mukavemet güvertesi
  //   L < 90 → 125, L ≥ 90 → 100; üstyapı 175; diğer 125. R_eH terimi plaka için YOK (Table 1'de C sabit).
  //   Nauticus fikstüründe kolonlar (s, C, ReH, tp_min) — doğrulama testi hangisini kullandığını gösterir.
  function plateC(loc, L) {
    if (loc === 'outerShellOrStrengthDeck') return L < 90 ? 125 : 100;
    if (loc === 'superstructure' || loc === 'internalManyDecks') return 175;
    return 125;
  }
  function slendernessPlate(b_mm, C, ReH) {
    // İki aday: (a) b/C ; (b) b/C·√(R_eH/235). Testte hangisi Nauticus'a oturuyorsa o esas alınır.
    return { tp_min_a: b_mm / C, tp_min_b: b_mm / C * Math.sqrt(ReH / 235) };
  }
  // [3.1.1] stiffener: t_w ≥ h_w/C_w·√(R_eH/235) ; t_f ≥ b_f-out/C_f·√(R_eH/235)  (Table 2)
  const STIFF_C = { angle: [75, 12], L2: [75, 12], L3: [75, 12], T: [75, 12], bulb: [45, null], flat: [22, null] };
  function slendernessStiffener(type, hw_mm, bfOut_mm, ReH) {
    const c = STIFF_C[type]; if (!c) throw new Error('DNV slenderness: unknown profile ' + type);
    const f = Math.sqrt(ReH / 235);
    return { tw_min: hw_mm / c[0] * f, tf_min: (c[1] && bfOut_mm) ? bfOut_mm / c[1] * f : null, Cw: c[0], Cf: c[1] };
  }
  // [3.1.2] L/T flanş genişliği ≥ 0.2 h_w (C_w = 45 ile web sağlanıyorsa muaf)
  function flangeBreadthMin(hw_gr) { return 0.2 * hw_gr; }
  // [4.1.1] PSM: web t_w ≥ s_w/C_w·√(R_eH/235), flanş t_f ≥ b_f-out/C_f·√(R_eH/235) — C_w, C_f Table 4 (100 / 12 tipik; DOĞRULA)
  function slendernessPSM(sw_mm, bfOut_mm, ReH, Cw, Cf) {
    const f = Math.sqrt(ReH / 235);
    return { tw_min: sw_mm / (Cw || 100) * f, tf_min: bfOut_mm ? bfOut_mm / (Cf || 12) * f : null };
  }
  // [5.1.2] tripping bracket serbest kenar > 75·t_b → flanş/kenar takviyesi ; [5.3.1] kenar takviyesi h_w ≥ max(50; C·ℓ_b·√(R_eH/235)·1e-3), C = 75 uç / 50 tripping
  function bracketEdge(lb_mm, tb_mm, ReH, kind) {
    const C = kind === 'tripping' ? 50 : 75;
    return { needsEdgeStiffener: lb_mm > 75 * tb_mm, hw_min: Math.max(50, C * lb_mm * Math.sqrt(ReH / 235) * 1e-3) };
  }

  // ------------------------------------------------------------ M4 hull girder (Ch 4 Sec 4, Ch 5 Sec 1-3)
  // Ch 4 Sec 4 semboller: dalga katsayısı
  function Cw(L) {
    if (L < 90) return 0.0856 * L;
    if (L <= 300) return 10.75 - Math.pow((300 - L) / 100, 1.5);
    if (L <= 350) return 10.75;
    return 10.75 - Math.pow((L - 350) / 150, 1.5);
  }
  // Ch 5 Sec 2 [1.3]: C_w0 = C_w (L > 90), 5.7 + 0.0222 L (L ≤ 90)
  function Cw0(L) { return L > 90 ? Cw(L) : 5.7 + 0.0222 * L; }
  const lerp = (x, pts) => {                       // kırık çizgi [[x,y],...] doğrusal enterpolasyon
    if (x <= pts[0][0]) return pts[0][1];
    for (let i = 1; i < pts.length; i++) if (x <= pts[i][0]) { const [x0, y0] = pts[i - 1], [x1, y1] = pts[i]; return y0 + (y1 - y0) * (x - x0) / (x1 - x0); }
    return pts[pts.length - 1][1];
  };
  // [3.1.1] f_m: 0 (x≤0) → 1.0 (0.4L–0.65L) → 0 (x≥L)
  const fm = (x, L) => lerp(x / L, [[0, 0], [0.4, 1], [0.65, 1], [1, 0]]);
  // [2.2.1] f_sw: 0 → 0.15 (0.1L) → 1.0 (0.3–0.7L) → 0.15 (0.9L) → 0
  const fsw = (x, L) => lerp(x / L, [[0, 0], [0.1, 0.15], [0.3, 1], [0.7, 1], [0.9, 0.15], [1, 0]]);
  // [2.4.1] f_qs
  const fqs = (x, L) => lerp(x / L, [[0, 0], [0.15, 1], [0.3, 1], [0.4, 0.8], [0.6, 0.8], [0.7, 1], [0.85, 1], [1, 0]]);
  // [3.1.1] doğrusal olmayan etki: hog 1.0 ; sag 0.5789 (C_B+0.7)/C_B  (mukavemet)
  const fnlVs = CB => 0.5789 * (CB + 0.7) / CB;
  // [3.1.1] M_wv (kNm), f_R = 0.85 (mukavemet) → f_R/0.85 = 1 ; f_p = f_ps (1.0 extreme sea, R0)
  function Mwv(x, L, B, CB, fps) {
    const base = 0.19 * fm(x, L) * (fps == null ? 1 : fps) * Cw(L) * L * L * B * CB;
    return { hog: base, sag: -base * fnlVs(CB) };
  }
  // [3.2.1] f_q-pos / f_q-neg ve Q_wv (kN)
  function fq(x, L, CB) {
    const vh = 1.0, vs = fnlVs(CB), r = x / L;
    return { pos: lerp(r, [[0, 0], [0.2, 0.92 * vh], [0.3, 0.92 * vh], [0.4, 0.7 * vs], [0.6, 0.7 * vs], [0.7, 1.0 * vs], [0.85, 1.0 * vs], [1, 0]]),
             neg: lerp(r, [[0, 0], [0.2, 0.92 * vs], [0.3, 0.92 * vs], [0.4, 0.7 * vs], [0.6, 0.7 * vs], [0.7, 1.0 * vh], [0.85, 1.0 * vh], [1, 0]]) };
  }
  function Qwv(x, L, B, CB, fps) {
    const f = fq(x, L, CB), base = 0.52 * (fps == null ? 1 : fps) * Cw(L) * L * B * CB;
    return { pos: f.pos * base, neg: -f.neg * base };
  }
  // [2.2.1] ön tasarım M_sw kılavuz değerleri (kNm)
  function MswMin(x, L, B, CB) {
    const mid = Mwv(L / 2, L, B, CB), a = 171 * Cw(L) * L * L * B * (CB + 0.7) * 1e-3, f = fsw(x, L);
    return { hog: f * (a - mid.hog), sag: -0.85 * f * (a + Math.abs(mid.sag)) };
  }
  // Ch 5 Sec 2 [1.3] Z_R-gr (m³), [1.5.2] I_yR-gr (m⁴) ; f_r servis kısıtı (R0 → 1.0)
  const Zmin = (L, B, CB, k, fr) => k * ((1 + (fr == null ? 1 : fr)) / 2) * Cw0(L) * L * L * B * (CB + 0.7) * 1e-6;
  const Imin = (L, B, CB, fr) => 3 * (fr == null ? 1 : fr) * Cw(L) * L * L * L * B * (CB + 0.7) * 1e-8;
  // [1.4.1] σ_perm: 125/k (x/L ≤ 0.1), 175/k (0.3–0.7), 125/k (≥ 0.9), arası doğrusal
  const sigmaPerm = (x, L, k) => lerp(x / L, [[0, 125 / k], [0.1, 125 / k], [0.3, 175 / k], [0.7, 175 / k], [0.9, 125 / k], [1, 125 / k]]);
  // [1.4.1] Z_gr = |M_sw + M_wv| / σ_perm · 10⁻³  (m³)
  const Zreq = (Msw, Mwv_, sPerm) => Math.abs(Msw + Mwv_) / sPerm * 1e-3;
  // [1.2.3] eşdeğer güverte hattı: V_D = max(z_D − z_n, (z_T − z_n)(0.9 + 0.2 y_T/B))  (m)
  function VD(zD, zn, zT, yT, B) { const a = zD - zn; return (zT != null) ? Math.max(a, (zT - zn) * (0.9 + 0.2 * yT / B)) : a; }
  // Ch 5 Sec 3 [2.1.2] σ_hg-perm = 205/k ; Sec 2 [2.1] τ_i-perm = 110/k
  const sigmaHgPerm = k => 205 / k, tauPerm = k => 110 / k;
  // [1.6.1] HT çelik düşey uzanımı: z_hts = z1·|1 − σ_perm,i / σ_L-gr|
  const zHts = (z1, sigmaPermMild, sigmaL) => sigmaL > sigmaPermMild ? z1 * (1 - sigmaPermMild / sigmaL) : 0;
  // Kesit özellikleri: parçalar {A [mm²], z [mm], I [mm⁴] (kendi)} yarım kesit → tam kesit
  function sectionProps(parts, half) {
    let A = 0, Sz = 0; for (const q of parts) { A += q.A; Sz += q.A * q.z; }
    const zn = Sz / A; let I = 0; for (const q of parts) I += (q.I || 0) + q.A * (q.z - zn) ** 2;
    const f = half ? 2 : 1;
    return { A_mm2: A * f, zn_mm: zn, I_mm4: I * f };
  }

  // ------------------------------------------------------------ Grab (Pt 6 Ch 1 Sec 1) — ek sınıf notasyonu, dökme yük ambarlarında kepçe darbesi
  //   [3.1.2] iç dip: t_G = 0,62·√(b·k)·(M_GR/20)^0,25 ; [3.1.3] düşey/eğik ambar sınırı (hopper eğimi, iç gövde, perde alt bölgesi): 0,55 katsayı
  //   M_GR (t): kullanıcı girmezse Grab(1-X)/(2-X) ≥ 10 ; Grab(3-X) OC(M)/OC(H)/HC(A)/HC(B*) L≥250→35, 200≤L<250→30, diğer 20 [1.5]
  function tGrab(b_mm, k, MGR_t, vertical) {
    const a = vertical ? 0.55 : 0.62;
    return a * Math.sqrt(b_mm * k) * Math.pow(Math.max(MGR_t, 0.001) / 20, 0.25);
  }
  const GRAB_DEFAULT_MGR = (qualifier, L) => (qualifier === '3-X') ? (L >= 250 ? 35 : L >= 200 ? 30 : 20) : 10;   // [1.5]
  const GRAB_EXTENT = { '1-X': 0, '2-X': 1.5, '3-X': 3.0 };                                                        // Table 2: iç dip her zaman; düşey/eğik sınır yalnız 2-X (1,5 m) / 3-X (3,0 m)

  return {
    T_RES, L1, L2, roundHalf,
    Cw, Cw0, fm, fsw, fqs, fq, fnlVs, Mwv, Qwv, MswMin, Zmin, Imin, sigmaPerm, Zreq, VD, sigmaHgPerm, tauPerm, zHts, sectionProps,
    kFactor, ReHOf, GRADES,
    COMP, tc1, plateCorrosion, internalCorrosion, stiffenerCorrosion,
    MIN_PLATE, sideBand, shellLoc, deckAdj, BOTTOM_TOP_Z, minPlateNet, minStiffNet, minPSMNet,
    plateC, slendernessPlate, slendernessStiffener, flangeBreadthMin, slendernessPSM, bracketEdge,
    tGrab, GRAB_DEFAULT_MGR, GRAB_EXTENT,
  };
});
