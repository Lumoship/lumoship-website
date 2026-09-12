/* ==========================================================================
   22-variants-materials.js  —  Variants table, steel families, profile catalogs, page nav
   Extracted verbatim from Index.html (lines 15033–15773 of the
   original single-file build). Load order is significant: see index.html.
   ========================================================================== */
// ==========================================================================
// SCANTLING APP (original code below)
let logoData = null;
document.getElementById('analysisDate').valueAsDate = new Date();


// ==================== SHIP CONSTANTS ====================
// VARIANTS table — each entry carries:
//   L, D, Cb       → form input defaults (rule particulars)
//   geom           → optional geometry overrides applied to GEOMETRY when
//                    the variant is selected. UD typically tracks D × 1000;
//                    HC follows UD (default 1050 mm above).
//   tweenUDProfiles → number of equally-spaced IS longitudinals between TT
//                    and UD (Variant 2A is taller so it needs more).
const VARIANTS = {
  '1B': {
    L: 192, D: 15.3, Cb: 0.881,    // Baltic Laker Var 1B
    geom: { UD: 15300, HC: 16350 },
    tweenUDProfiles: 3,             // current 1B layout (3 internal stiffs)
    // Still-water bending moments (LR Pt 3 Ch 4 Sec 5.3.1):
    //   Ms_hog = positive (hogging condition's max)
    //   Ms_sag = negative (sagging condition's max, |Ms_sag| ≤ |Ms_hog| typical)
    // For preliminary design with no loading manual, |Ms_sag| = |Ms_hog| is
    // a reasonable conservative pair until real loading data is available.
    Ms_hog: +900000, Ms_sag: -900000,
    // Plate-thickness defaults written to form inputs on variant change.
    // These mirror the values shown in the HTML form's value="..." attributes
    // and act as the source of truth that recalcAll() will sync into
    // STRAKES.shell + PLATE_THICKNESS on every recompute.
    plateT: {
      keel: 16, bottom: 14, bilge: 14, ib: 16,    // bottom-shell + IB
      deck: 25, coaming: 40,                       // upper deck + coaming top
      duct: 12,                                    // duct keel side plate
      sg: 10,                                      // side girder
      strDeck: 10,                                 // stringer deck (single z=8590)
      twnDeck: 12,                                 // tween deck
    },
  },
  '2A': {
    L: 216, D: 15.5, Cb: 0.878,    // Baltic Laker Var 2A
    geom: { UD: 15500, HC: 16350 },
    tweenUDProfiles: 3,             // match 1B layout (Excel defaults pin
                                    //  the actual z's; this is the fallback
                                    //  count if the Excel pin is bypassed)
    // Still-water bending moments — see note in 1B above.
    Ms_hog: +1000000, Ms_sag: -1000000,
    // 2A scantling overrides — user Excel sheet, May 2026:
    //   Bottom group: keel 17, bottom 15, bilge 15
    //   IB: 20 mm (all 6 strakes)
    //   Inner side: 15 mm (IS01-03), 20 mm (IS04), 25 mm (IS05), 45 mm (IS06 top)
    //   Upper deck: 45 mm (was 25 in 1B, 30 in earlier 2A iteration)
    //   Coaming top: 50 mm (was 40 in 1B)
    //   Stringer deck: 20 mm — applies to ALL 3 stringers (z=8590/10435/11665)
    //   Tween deck: 35 mm (was 12 in 1B)
    //   Duct keel side plate 15 mm (was 12 in 1B, 13 in earlier 2A iteration)
    //   Side girder 15 mm (was 10 in 1B, 11 in earlier 2A iteration) — applies
    //     to all three side girders (SG1/SG2/SG3 — Y=3700/6500/10030).
    //   Side strake pattern: 15/15/20/20/20/45 (alt→üst) — set via
    //     SIDE_PATTERN_2A in the strake applier (per-strake data lives there,
    //     not in this single-field plateT object).
    plateT: {
      keel: 17, bottom: 15, bilge: 15, ib: 20,
      deck: 45, coaming: 50,
      duct: 15,
      sg: 15,
      strDeck: 20,    // single value applied to all stringer decks (SD01..SD03)
      twnDeck: 35,    // tween deck plate
    },
  },
};
// Yield-strength steel families (LR Pt 3 Ch 2 Table 2.1.1 + 2.1.2).
// Each entry: { sigma_o (MPa), k, kL, label }
//   k  = higher tensile factor for plate t / stiffener Z formulas (Pt 4 Ch 1)
//   kL = same factor used in Pt 3 Ch 4 hull-girder formulas (some tables
//        differentiate, here they're aligned with k).
const MATERIAL = {
  'MS':   { sigma_o: 235, k: 1.00, kL: 1.00, label: 'Mild Steel' },
  'AH32': { sigma_o: 315, k: 0.78, kL: 0.78, label: 'AH32' },
  'AH36': { sigma_o: 355, k: 0.72, kL: 0.72, label: 'AH36' },
  'AH40': { sigma_o: 390, k: 0.68, kL: 0.68, label: 'AH40' },
};
// v33: expose so _resolveK() in _computeElemInspect can look up family→k
window.MATERIAL = MATERIAL;

// ─── k-value display helpers ─────────────────────────────────────────
// The UI shows material families as their k-value (1.00, 0.78, 0.72, 0.68)
// instead of the LR designation (MS, AH32, AH36, AH40). This keeps the user's
// mental model on the structural quantity that matters in the formulas.
// `familyToKLabel(family)` → "k=0.72"
// `kToFamily(kStr)`        → "AH36"
// Used by every grade dropdown / pill / badge across Setup and Geometry.
function familyToKLabel(family) {
  if (family && MATERIAL[family]) return 'k=' + MATERIAL[family].k.toFixed(2);
  return '—';
}
function kToFamily(kStr) {
  // Accept either "0.72" or "k=0.72"
  const v = parseFloat(String(kStr).replace(/^k\s*=\s*/, ''));
  if (!isFinite(v)) return null;
  for (const key of Object.keys(MATERIAL)) {
    if (Math.abs(MATERIAL[key].k - v) < 0.001) return key;
  }
  return null;
}
window.familyToKLabel = familyToKLabel;
window.kToFamily = kToFamily;

// Color palette for k pills (kept consistent across Setup, strake editor,
// profile editor, and the various inspectors). Indexed by family key —
// internal storage stays "AH36" etc., but display always shows k.
const K_PILL_COLORS = {
  'MS':'#6b7280', 'AH32':'#0891b2', 'AH36':'#7c3aed', 'AH40':'#ea580c'
};
window.K_PILL_COLORS = K_PILL_COLORS;

// Material family helper.
// Resolves a family key (e.g. 'AH36') or `null` (= use global default from
// the #material select) to a concrete { k, kL, family } object.
// All per-strake / per-stiffener hesap fonksiyonları önce bu helper'ı
// çağırır → eğer parça lokal family ile override edilmişse kendi k/kL'i
// kullanılır, değilse gemi geneline düşer.
function getFamilyKKL(family) {
  if (family && MATERIAL[family]) {
    return { k: MATERIAL[family].k, kL: MATERIAL[family].kL, family: family };
  }
  // Fall back to global Setup → #material
  let global = 'AH36';
  try {
    const el = document.getElementById('material');
    if (el && el.value && MATERIAL[el.value]) global = el.value;
  } catch(_) {}
  return { k: MATERIAL[global].k, kL: MATERIAL[global].kL, family: global };
}
window.getFamilyKKL = getFamilyKKL;

// Resolve the family for a strake. Order:
//   1) strake.family (manual pin set via the strake-mf dropdown)
//   2) Setup zone the strake's z-band falls in (live, no field write needed)
//   3) global Setup material (#material dropdown)
// This means pin-free strakes still get the right k from Setup zones —
// they don't have to be "assigned" first.
function resolveStrakeFamily(strake) {
  if (!strake) return getFamilyKKL(null);
  // Pin wins
  if (strake.family) return getFamilyKKL(strake.family);
  // Live Setup-zone resolution. Caller must know the plate key for the
  // strake; we cache it on the strake itself (kind hints the panel).
  if (typeof getZoneMaterialForStrake === 'function') {
    try {
      const plateKey = strake._plateKey || _plateKeyForStrake(strake);
      if (plateKey) {
        const mf = getZoneMaterialForStrake(plateKey, strake);
        if (mf) {
          const fam = (mf === 'MS') ? 'Mild' : 'HT';
          return getFamilyKKL(fam);
        }
      }
    } catch (_) {}
  }
  return getFamilyKKL(null);
}
// Best-effort lookup: scan STRAKES to find which plate key this strake
// object belongs to. This is only needed when the caller didn't set
// strake._plateKey. O(plates × strakes) but only on cache miss.
function _plateKeyForStrake(strake) {
  try {
    const STR = window.Draw?.STRAKES;
    if (!STR) return null;
    for (const k of Object.keys(STR)) {
      const arr = STR[k];
      if (Array.isArray(arr) && arr.indexOf(strake) >= 0) {
        strake._plateKey = k;
        return k;
      }
    }
  } catch (_) {}
  return null;
}
window.resolveStrakeFamily = resolveStrakeFamily;

// Resolve the family for a stiffener. Order:
//   1) profile.family (manual pin set via the per-row dropdown)
//   2) parent strake's resolved family (which itself reads Setup zone live)
//   3) global Setup material
function resolveStiffFamily(profile) {
  if (!profile) return getFamilyKKL(null);
  if (profile.family) return getFamilyKKL(profile.family);
  // Live: pull from parent strake via the inherited resolver.
  if (typeof getInheritedFamilyForLong === 'function') {
    try {
      const D = window.Draw;
      if (D && D.profiles) {
        for (const grp of Object.keys(D.profiles)) {
          const arr = D.profiles[grp];
          if (!Array.isArray(arr)) continue;
          const idx = arr.indexOf(profile);
          if (idx < 0) continue;
          const mf = getInheritedFamilyForLong(grp, idx);
          if (mf) {
            const fam = (mf === 'MS') ? 'Mild' : 'HT';
            return getFamilyKKL(fam);
          }
          break;
        }
      }
    } catch (_) {}
  }
  return getFamilyKKL(null);
}
window.resolveStiffFamily = resolveStiffFamily;

// Default long positions (based on chat decisions)
const DEFAULT_SIDE_LONGS = [
  { n:1,  z:2375,  s:575,  fixed:true,  note:'LR' },
  { n:2,  z:2950,  s:575,  fixed:true,  note:'LR' },
  { n:3,  z:3655,  s:705,  fixed:false, note:'C' },
  { n:4,  z:4360,  s:705,  fixed:false, note:'C' },
  { n:5,  z:5065,  s:705,  fixed:false, note:'C' },
  { n:6,  z:5770,  s:705,  fixed:false, note:'C' },
  { n:7,  z:6475,  s:705,  fixed:false, note:'C' },
  { n:8,  z:7180,  s:705,  fixed:false, note:'C' },
  { n:9,  z:7885,  s:705,  fixed:false, note:'C' },
  { n:10, z:8590,  s:705,  fixed:false, note:'C' },
  { n:11, z:9295,  s:705,  fixed:false, note:'C' },
  { n:12, z:10000, s:705,  fixed:false, note:'C' },
  { n:13, z:10700, s:700,  fixed:true,  note:'User' },
  { n:14, z:11433, s:733,  fixed:false, note:'D' },
  { n:15, z:12166, s:733,  fixed:false, note:'D' },
  { n:16, z:13500, s:600,  fixed:false, note:'E void' },
  { n:17, z:14100, s:600,  fixed:false, note:'E void' },
  { n:18, z:14700, s:600,  fixed:false, note:'E void' }
];

const STRAKE_BOUNDARIES = [1900, 3880, 6360, 8690, 11170, 13420, 15300];

// ═══════════════════════════════════════════════════════════════════════
// SECTIONPRO INTEGRATION — Full HP catalog (EN 10067) + L/FB/T calc
// Attached plate section modulus computed automatically
// ═══════════════════════════════════════════════════════════════════════

// HP Catalog (EN 10067) — single source of truth.
//
// This file used to carry its own copy of the catalogue literal. The two
// copies had already drifted: the module in 20-profile.js had 59 entries,
// this one 54 (the whole HP 430 series was missing here). Because the bare
// `HP_CATALOG` identifier is what 60-scantling-rules.js, 80-export.js and
// 90-custom-profile.js resolve to, HP 430 profiles were invisible to the
// optimiser, the profile picker and the Excel type detection, while
// computeSectionProperties() (which reads Profile.HP_CATALOG) could still
// resolve them. Re-export the module copy so the drift cannot come back.
//
// 20-profile.js is loaded first, so Profile.HP_CATALOG already exists here.
const HP_CATALOG = window.Profile.HP_CATALOG;

// L profile catalog (common marine angles)
const L_CATALOG = [
  { name:"L 75x50x6",    a:75,  b:50,  t:6 },
  { name:"L 75x50x8",    a:75,  b:50,  t:8 },
  { name:"L 100x75x7",   a:100, b:75,  t:7 },
  { name:"L 100x75x8",   a:100, b:75,  t:8 },
  { name:"L 100x75x10",  a:100, b:75,  t:10 },
  { name:"L 125x75x8",   a:125, b:75,  t:8 },
  { name:"L 125x75x10",  a:125, b:75,  t:10 },
  { name:"L 125x75x12",  a:125, b:75,  t:12 },
  { name:"L 150x75x9",   a:150, b:75,  t:9 },
  { name:"L 150x90x9",   a:150, b:90,  t:9 },
  { name:"L 150x90x10",  a:150, b:90,  t:10 },
  { name:"L 150x90x12",  a:150, b:90,  t:12 },
  { name:"L 150x100x10", a:150, b:100, t:10 },
  { name:"L 150x100x12", a:150, b:100, t:12 },
  { name:"L 175x90x10",  a:175, b:90,  t:10 },
  { name:"L 175x90x12",  a:175, b:90,  t:12 },
  { name:"L 180x100x10", a:180, b:100, t:10 },
  { name:"L 200x90x10",  a:200, b:90,  t:10 },
  { name:"L 200x90x12",  a:200, b:90,  t:12 },
  { name:"L 200x100x10", a:200, b:100, t:10 },
  { name:"L 200x100x12", a:200, b:100, t:12 },
  { name:"L 200x100x14", a:200, b:100, t:14 },
  { name:"L 250x90x10",  a:250, b:90,  t:10 },
  { name:"L 250x90x12",  a:250, b:90,  t:12 },
  { name:"L 250x100x12", a:250, b:100, t:12 },
  { name:"L 250x100x14", a:250, b:100, t:14 },
  { name:"L 300x100x12", a:300, b:100, t:12 },
  { name:"L 300x100x14", a:300, b:100, t:14 }
];

// Flat bar catalog
const FB_CATALOG = [
  // h=80
  { name:"FB 80x8", h:80, t:8 }, { name:"FB 80x9", h:80, t:9 }, { name:"FB 80x10", h:80, t:10 }, { name:"FB 80x11", h:80, t:11 }, { name:"FB 80x12", h:80, t:12 }, { name:"FB 80x13", h:80, t:13 }, { name:"FB 80x14", h:80, t:14 }, { name:"FB 80x15", h:80, t:15 }, { name:"FB 80x16", h:80, t:16 }, { name:"FB 80x18", h:80, t:18 }, { name:"FB 80x20", h:80, t:20 }, { name:"FB 80x22", h:80, t:22 }, { name:"FB 80x25", h:80, t:25 }, { name:"FB 80x28", h:80, t:28 }, { name:"FB 80x30", h:80, t:30 }, { name:"FB 80x35", h:80, t:35 }, { name:"FB 80x40", h:80, t:40 },
  // h=85
  { name:"FB 85x8", h:85, t:8 }, { name:"FB 85x9", h:85, t:9 }, { name:"FB 85x10", h:85, t:10 }, { name:"FB 85x11", h:85, t:11 }, { name:"FB 85x12", h:85, t:12 }, { name:"FB 85x13", h:85, t:13 }, { name:"FB 85x14", h:85, t:14 }, { name:"FB 85x15", h:85, t:15 }, { name:"FB 85x16", h:85, t:16 }, { name:"FB 85x18", h:85, t:18 }, { name:"FB 85x20", h:85, t:20 }, { name:"FB 85x22", h:85, t:22 }, { name:"FB 85x25", h:85, t:25 }, { name:"FB 85x28", h:85, t:28 }, { name:"FB 85x30", h:85, t:30 }, { name:"FB 85x35", h:85, t:35 }, { name:"FB 85x40", h:85, t:40 },
  // h=90
  { name:"FB 90x8", h:90, t:8 }, { name:"FB 90x9", h:90, t:9 }, { name:"FB 90x10", h:90, t:10 }, { name:"FB 90x11", h:90, t:11 }, { name:"FB 90x12", h:90, t:12 }, { name:"FB 90x13", h:90, t:13 }, { name:"FB 90x14", h:90, t:14 }, { name:"FB 90x15", h:90, t:15 }, { name:"FB 90x16", h:90, t:16 }, { name:"FB 90x18", h:90, t:18 }, { name:"FB 90x20", h:90, t:20 }, { name:"FB 90x22", h:90, t:22 }, { name:"FB 90x25", h:90, t:25 }, { name:"FB 90x28", h:90, t:28 }, { name:"FB 90x30", h:90, t:30 }, { name:"FB 90x35", h:90, t:35 }, { name:"FB 90x40", h:90, t:40 },
  // h=95
  { name:"FB 95x8", h:95, t:8 }, { name:"FB 95x9", h:95, t:9 }, { name:"FB 95x10", h:95, t:10 }, { name:"FB 95x11", h:95, t:11 }, { name:"FB 95x12", h:95, t:12 }, { name:"FB 95x13", h:95, t:13 }, { name:"FB 95x14", h:95, t:14 }, { name:"FB 95x15", h:95, t:15 }, { name:"FB 95x16", h:95, t:16 }, { name:"FB 95x18", h:95, t:18 }, { name:"FB 95x20", h:95, t:20 }, { name:"FB 95x22", h:95, t:22 }, { name:"FB 95x25", h:95, t:25 }, { name:"FB 95x28", h:95, t:28 }, { name:"FB 95x30", h:95, t:30 }, { name:"FB 95x35", h:95, t:35 }, { name:"FB 95x40", h:95, t:40 },
  // h=100
  { name:"FB 100x8", h:100, t:8 }, { name:"FB 100x9", h:100, t:9 }, { name:"FB 100x10", h:100, t:10 }, { name:"FB 100x11", h:100, t:11 }, { name:"FB 100x12", h:100, t:12 }, { name:"FB 100x13", h:100, t:13 }, { name:"FB 100x14", h:100, t:14 }, { name:"FB 100x15", h:100, t:15 }, { name:"FB 100x16", h:100, t:16 }, { name:"FB 100x18", h:100, t:18 }, { name:"FB 100x20", h:100, t:20 }, { name:"FB 100x22", h:100, t:22 }, { name:"FB 100x25", h:100, t:25 }, { name:"FB 100x28", h:100, t:28 }, { name:"FB 100x30", h:100, t:30 }, { name:"FB 100x35", h:100, t:35 }, { name:"FB 100x40", h:100, t:40 },
  // h=105
  { name:"FB 105x8", h:105, t:8 }, { name:"FB 105x9", h:105, t:9 }, { name:"FB 105x10", h:105, t:10 }, { name:"FB 105x11", h:105, t:11 }, { name:"FB 105x12", h:105, t:12 }, { name:"FB 105x13", h:105, t:13 }, { name:"FB 105x14", h:105, t:14 }, { name:"FB 105x15", h:105, t:15 }, { name:"FB 105x16", h:105, t:16 }, { name:"FB 105x18", h:105, t:18 }, { name:"FB 105x20", h:105, t:20 }, { name:"FB 105x22", h:105, t:22 }, { name:"FB 105x25", h:105, t:25 }, { name:"FB 105x28", h:105, t:28 }, { name:"FB 105x30", h:105, t:30 }, { name:"FB 105x35", h:105, t:35 }, { name:"FB 105x40", h:105, t:40 },
  // h=110
  { name:"FB 110x8", h:110, t:8 }, { name:"FB 110x9", h:110, t:9 }, { name:"FB 110x10", h:110, t:10 }, { name:"FB 110x11", h:110, t:11 }, { name:"FB 110x12", h:110, t:12 }, { name:"FB 110x13", h:110, t:13 }, { name:"FB 110x14", h:110, t:14 }, { name:"FB 110x15", h:110, t:15 }, { name:"FB 110x16", h:110, t:16 }, { name:"FB 110x18", h:110, t:18 }, { name:"FB 110x20", h:110, t:20 }, { name:"FB 110x22", h:110, t:22 }, { name:"FB 110x25", h:110, t:25 }, { name:"FB 110x28", h:110, t:28 }, { name:"FB 110x30", h:110, t:30 }, { name:"FB 110x35", h:110, t:35 }, { name:"FB 110x40", h:110, t:40 },
  // h=115
  { name:"FB 115x8", h:115, t:8 }, { name:"FB 115x9", h:115, t:9 }, { name:"FB 115x10", h:115, t:10 }, { name:"FB 115x11", h:115, t:11 }, { name:"FB 115x12", h:115, t:12 }, { name:"FB 115x13", h:115, t:13 }, { name:"FB 115x14", h:115, t:14 }, { name:"FB 115x15", h:115, t:15 }, { name:"FB 115x16", h:115, t:16 }, { name:"FB 115x18", h:115, t:18 }, { name:"FB 115x20", h:115, t:20 }, { name:"FB 115x22", h:115, t:22 }, { name:"FB 115x25", h:115, t:25 }, { name:"FB 115x28", h:115, t:28 }, { name:"FB 115x30", h:115, t:30 }, { name:"FB 115x35", h:115, t:35 }, { name:"FB 115x40", h:115, t:40 },
  // h=120
  { name:"FB 120x8", h:120, t:8 }, { name:"FB 120x9", h:120, t:9 }, { name:"FB 120x10", h:120, t:10 }, { name:"FB 120x11", h:120, t:11 }, { name:"FB 120x12", h:120, t:12 }, { name:"FB 120x13", h:120, t:13 }, { name:"FB 120x14", h:120, t:14 }, { name:"FB 120x15", h:120, t:15 }, { name:"FB 120x16", h:120, t:16 }, { name:"FB 120x18", h:120, t:18 }, { name:"FB 120x20", h:120, t:20 }, { name:"FB 120x22", h:120, t:22 }, { name:"FB 120x25", h:120, t:25 }, { name:"FB 120x28", h:120, t:28 }, { name:"FB 120x30", h:120, t:30 }, { name:"FB 120x35", h:120, t:35 }, { name:"FB 120x40", h:120, t:40 },
  // h=125
  { name:"FB 125x8", h:125, t:8 }, { name:"FB 125x9", h:125, t:9 }, { name:"FB 125x10", h:125, t:10 }, { name:"FB 125x11", h:125, t:11 }, { name:"FB 125x12", h:125, t:12 }, { name:"FB 125x13", h:125, t:13 }, { name:"FB 125x14", h:125, t:14 }, { name:"FB 125x15", h:125, t:15 }, { name:"FB 125x16", h:125, t:16 }, { name:"FB 125x18", h:125, t:18 }, { name:"FB 125x20", h:125, t:20 }, { name:"FB 125x22", h:125, t:22 }, { name:"FB 125x25", h:125, t:25 }, { name:"FB 125x28", h:125, t:28 }, { name:"FB 125x30", h:125, t:30 }, { name:"FB 125x35", h:125, t:35 }, { name:"FB 125x40", h:125, t:40 },
  // h=130
  { name:"FB 130x8", h:130, t:8 }, { name:"FB 130x9", h:130, t:9 }, { name:"FB 130x10", h:130, t:10 }, { name:"FB 130x11", h:130, t:11 }, { name:"FB 130x12", h:130, t:12 }, { name:"FB 130x13", h:130, t:13 }, { name:"FB 130x14", h:130, t:14 }, { name:"FB 130x15", h:130, t:15 }, { name:"FB 130x16", h:130, t:16 }, { name:"FB 130x18", h:130, t:18 }, { name:"FB 130x20", h:130, t:20 }, { name:"FB 130x22", h:130, t:22 }, { name:"FB 130x25", h:130, t:25 }, { name:"FB 130x28", h:130, t:28 }, { name:"FB 130x30", h:130, t:30 }, { name:"FB 130x35", h:130, t:35 }, { name:"FB 130x40", h:130, t:40 },
  // h=135
  { name:"FB 135x8", h:135, t:8 }, { name:"FB 135x9", h:135, t:9 }, { name:"FB 135x10", h:135, t:10 }, { name:"FB 135x11", h:135, t:11 }, { name:"FB 135x12", h:135, t:12 }, { name:"FB 135x13", h:135, t:13 }, { name:"FB 135x14", h:135, t:14 }, { name:"FB 135x15", h:135, t:15 }, { name:"FB 135x16", h:135, t:16 }, { name:"FB 135x18", h:135, t:18 }, { name:"FB 135x20", h:135, t:20 }, { name:"FB 135x22", h:135, t:22 }, { name:"FB 135x25", h:135, t:25 }, { name:"FB 135x28", h:135, t:28 }, { name:"FB 135x30", h:135, t:30 }, { name:"FB 135x35", h:135, t:35 }, { name:"FB 135x40", h:135, t:40 },
  // h=140
  { name:"FB 140x8", h:140, t:8 }, { name:"FB 140x9", h:140, t:9 }, { name:"FB 140x10", h:140, t:10 }, { name:"FB 140x11", h:140, t:11 }, { name:"FB 140x12", h:140, t:12 }, { name:"FB 140x13", h:140, t:13 }, { name:"FB 140x14", h:140, t:14 }, { name:"FB 140x15", h:140, t:15 }, { name:"FB 140x16", h:140, t:16 }, { name:"FB 140x18", h:140, t:18 }, { name:"FB 140x20", h:140, t:20 }, { name:"FB 140x22", h:140, t:22 }, { name:"FB 140x25", h:140, t:25 }, { name:"FB 140x28", h:140, t:28 }, { name:"FB 140x30", h:140, t:30 }, { name:"FB 140x35", h:140, t:35 }, { name:"FB 140x40", h:140, t:40 },
  // h=145
  { name:"FB 145x8", h:145, t:8 }, { name:"FB 145x9", h:145, t:9 }, { name:"FB 145x10", h:145, t:10 }, { name:"FB 145x11", h:145, t:11 }, { name:"FB 145x12", h:145, t:12 }, { name:"FB 145x13", h:145, t:13 }, { name:"FB 145x14", h:145, t:14 }, { name:"FB 145x15", h:145, t:15 }, { name:"FB 145x16", h:145, t:16 }, { name:"FB 145x18", h:145, t:18 }, { name:"FB 145x20", h:145, t:20 }, { name:"FB 145x22", h:145, t:22 }, { name:"FB 145x25", h:145, t:25 }, { name:"FB 145x28", h:145, t:28 }, { name:"FB 145x30", h:145, t:30 }, { name:"FB 145x35", h:145, t:35 }, { name:"FB 145x40", h:145, t:40 },
  // h=150
  { name:"FB 150x8", h:150, t:8 }, { name:"FB 150x9", h:150, t:9 }, { name:"FB 150x10", h:150, t:10 }, { name:"FB 150x11", h:150, t:11 }, { name:"FB 150x12", h:150, t:12 }, { name:"FB 150x13", h:150, t:13 }, { name:"FB 150x14", h:150, t:14 }, { name:"FB 150x15", h:150, t:15 }, { name:"FB 150x16", h:150, t:16 }, { name:"FB 150x18", h:150, t:18 }, { name:"FB 150x20", h:150, t:20 }, { name:"FB 150x22", h:150, t:22 }, { name:"FB 150x25", h:150, t:25 }, { name:"FB 150x28", h:150, t:28 }, { name:"FB 150x30", h:150, t:30 }, { name:"FB 150x35", h:150, t:35 }, { name:"FB 150x40", h:150, t:40 },
  // h=155
  { name:"FB 155x8", h:155, t:8 }, { name:"FB 155x9", h:155, t:9 }, { name:"FB 155x10", h:155, t:10 }, { name:"FB 155x11", h:155, t:11 }, { name:"FB 155x12", h:155, t:12 }, { name:"FB 155x13", h:155, t:13 }, { name:"FB 155x14", h:155, t:14 }, { name:"FB 155x15", h:155, t:15 }, { name:"FB 155x16", h:155, t:16 }, { name:"FB 155x18", h:155, t:18 }, { name:"FB 155x20", h:155, t:20 }, { name:"FB 155x22", h:155, t:22 }, { name:"FB 155x25", h:155, t:25 }, { name:"FB 155x28", h:155, t:28 }, { name:"FB 155x30", h:155, t:30 }, { name:"FB 155x35", h:155, t:35 }, { name:"FB 155x40", h:155, t:40 },
  // h=160
  { name:"FB 160x8", h:160, t:8 }, { name:"FB 160x9", h:160, t:9 }, { name:"FB 160x10", h:160, t:10 }, { name:"FB 160x11", h:160, t:11 }, { name:"FB 160x12", h:160, t:12 }, { name:"FB 160x13", h:160, t:13 }, { name:"FB 160x14", h:160, t:14 }, { name:"FB 160x15", h:160, t:15 }, { name:"FB 160x16", h:160, t:16 }, { name:"FB 160x18", h:160, t:18 }, { name:"FB 160x20", h:160, t:20 }, { name:"FB 160x22", h:160, t:22 }, { name:"FB 160x25", h:160, t:25 }, { name:"FB 160x28", h:160, t:28 }, { name:"FB 160x30", h:160, t:30 }, { name:"FB 160x35", h:160, t:35 }, { name:"FB 160x40", h:160, t:40 },
  // h=165
  { name:"FB 165x8", h:165, t:8 }, { name:"FB 165x9", h:165, t:9 }, { name:"FB 165x10", h:165, t:10 }, { name:"FB 165x11", h:165, t:11 }, { name:"FB 165x12", h:165, t:12 }, { name:"FB 165x13", h:165, t:13 }, { name:"FB 165x14", h:165, t:14 }, { name:"FB 165x15", h:165, t:15 }, { name:"FB 165x16", h:165, t:16 }, { name:"FB 165x18", h:165, t:18 }, { name:"FB 165x20", h:165, t:20 }, { name:"FB 165x22", h:165, t:22 }, { name:"FB 165x25", h:165, t:25 }, { name:"FB 165x28", h:165, t:28 }, { name:"FB 165x30", h:165, t:30 }, { name:"FB 165x35", h:165, t:35 }, { name:"FB 165x40", h:165, t:40 },
  // h=170
  { name:"FB 170x8", h:170, t:8 }, { name:"FB 170x9", h:170, t:9 }, { name:"FB 170x10", h:170, t:10 }, { name:"FB 170x11", h:170, t:11 }, { name:"FB 170x12", h:170, t:12 }, { name:"FB 170x13", h:170, t:13 }, { name:"FB 170x14", h:170, t:14 }, { name:"FB 170x15", h:170, t:15 }, { name:"FB 170x16", h:170, t:16 }, { name:"FB 170x18", h:170, t:18 }, { name:"FB 170x20", h:170, t:20 }, { name:"FB 170x22", h:170, t:22 }, { name:"FB 170x25", h:170, t:25 }, { name:"FB 170x28", h:170, t:28 }, { name:"FB 170x30", h:170, t:30 }, { name:"FB 170x35", h:170, t:35 }, { name:"FB 170x40", h:170, t:40 },
  // h=175
  { name:"FB 175x8", h:175, t:8 }, { name:"FB 175x9", h:175, t:9 }, { name:"FB 175x10", h:175, t:10 }, { name:"FB 175x11", h:175, t:11 }, { name:"FB 175x12", h:175, t:12 }, { name:"FB 175x13", h:175, t:13 }, { name:"FB 175x14", h:175, t:14 }, { name:"FB 175x15", h:175, t:15 }, { name:"FB 175x16", h:175, t:16 }, { name:"FB 175x18", h:175, t:18 }, { name:"FB 175x20", h:175, t:20 }, { name:"FB 175x22", h:175, t:22 }, { name:"FB 175x25", h:175, t:25 }, { name:"FB 175x28", h:175, t:28 }, { name:"FB 175x30", h:175, t:30 }, { name:"FB 175x35", h:175, t:35 }, { name:"FB 175x40", h:175, t:40 },
  // h=180
  { name:"FB 180x8", h:180, t:8 }, { name:"FB 180x9", h:180, t:9 }, { name:"FB 180x10", h:180, t:10 }, { name:"FB 180x11", h:180, t:11 }, { name:"FB 180x12", h:180, t:12 }, { name:"FB 180x13", h:180, t:13 }, { name:"FB 180x14", h:180, t:14 }, { name:"FB 180x15", h:180, t:15 }, { name:"FB 180x16", h:180, t:16 }, { name:"FB 180x18", h:180, t:18 }, { name:"FB 180x20", h:180, t:20 }, { name:"FB 180x22", h:180, t:22 }, { name:"FB 180x25", h:180, t:25 }, { name:"FB 180x28", h:180, t:28 }, { name:"FB 180x30", h:180, t:30 }, { name:"FB 180x35", h:180, t:35 }, { name:"FB 180x40", h:180, t:40 },
  // h=185
  { name:"FB 185x8", h:185, t:8 }, { name:"FB 185x9", h:185, t:9 }, { name:"FB 185x10", h:185, t:10 }, { name:"FB 185x11", h:185, t:11 }, { name:"FB 185x12", h:185, t:12 }, { name:"FB 185x13", h:185, t:13 }, { name:"FB 185x14", h:185, t:14 }, { name:"FB 185x15", h:185, t:15 }, { name:"FB 185x16", h:185, t:16 }, { name:"FB 185x18", h:185, t:18 }, { name:"FB 185x20", h:185, t:20 }, { name:"FB 185x22", h:185, t:22 }, { name:"FB 185x25", h:185, t:25 }, { name:"FB 185x28", h:185, t:28 }, { name:"FB 185x30", h:185, t:30 }, { name:"FB 185x35", h:185, t:35 }, { name:"FB 185x40", h:185, t:40 },
  // h=190
  { name:"FB 190x8", h:190, t:8 }, { name:"FB 190x9", h:190, t:9 }, { name:"FB 190x10", h:190, t:10 }, { name:"FB 190x11", h:190, t:11 }, { name:"FB 190x12", h:190, t:12 }, { name:"FB 190x13", h:190, t:13 }, { name:"FB 190x14", h:190, t:14 }, { name:"FB 190x15", h:190, t:15 }, { name:"FB 190x16", h:190, t:16 }, { name:"FB 190x18", h:190, t:18 }, { name:"FB 190x20", h:190, t:20 }, { name:"FB 190x22", h:190, t:22 }, { name:"FB 190x25", h:190, t:25 }, { name:"FB 190x28", h:190, t:28 }, { name:"FB 190x30", h:190, t:30 }, { name:"FB 190x35", h:190, t:35 }, { name:"FB 190x40", h:190, t:40 },
  // h=195
  { name:"FB 195x8", h:195, t:8 }, { name:"FB 195x9", h:195, t:9 }, { name:"FB 195x10", h:195, t:10 }, { name:"FB 195x11", h:195, t:11 }, { name:"FB 195x12", h:195, t:12 }, { name:"FB 195x13", h:195, t:13 }, { name:"FB 195x14", h:195, t:14 }, { name:"FB 195x15", h:195, t:15 }, { name:"FB 195x16", h:195, t:16 }, { name:"FB 195x18", h:195, t:18 }, { name:"FB 195x20", h:195, t:20 }, { name:"FB 195x22", h:195, t:22 }, { name:"FB 195x25", h:195, t:25 }, { name:"FB 195x28", h:195, t:28 }, { name:"FB 195x30", h:195, t:30 }, { name:"FB 195x35", h:195, t:35 }, { name:"FB 195x40", h:195, t:40 },
  // h=200
  { name:"FB 200x8", h:200, t:8 }, { name:"FB 200x9", h:200, t:9 }, { name:"FB 200x10", h:200, t:10 }, { name:"FB 200x11", h:200, t:11 }, { name:"FB 200x12", h:200, t:12 }, { name:"FB 200x13", h:200, t:13 }, { name:"FB 200x14", h:200, t:14 }, { name:"FB 200x15", h:200, t:15 }, { name:"FB 200x16", h:200, t:16 }, { name:"FB 200x18", h:200, t:18 }, { name:"FB 200x20", h:200, t:20 }, { name:"FB 200x22", h:200, t:22 }, { name:"FB 200x25", h:200, t:25 }, { name:"FB 200x28", h:200, t:28 }, { name:"FB 200x30", h:200, t:30 }, { name:"FB 200x35", h:200, t:35 }, { name:"FB 200x40", h:200, t:40 },
  // h=205
  { name:"FB 205x8", h:205, t:8 }, { name:"FB 205x9", h:205, t:9 }, { name:"FB 205x10", h:205, t:10 }, { name:"FB 205x11", h:205, t:11 }, { name:"FB 205x12", h:205, t:12 }, { name:"FB 205x13", h:205, t:13 }, { name:"FB 205x14", h:205, t:14 }, { name:"FB 205x15", h:205, t:15 }, { name:"FB 205x16", h:205, t:16 }, { name:"FB 205x18", h:205, t:18 }, { name:"FB 205x20", h:205, t:20 }, { name:"FB 205x22", h:205, t:22 }, { name:"FB 205x25", h:205, t:25 }, { name:"FB 205x28", h:205, t:28 }, { name:"FB 205x30", h:205, t:30 }, { name:"FB 205x35", h:205, t:35 }, { name:"FB 205x40", h:205, t:40 },
  // h=210
  { name:"FB 210x8", h:210, t:8 }, { name:"FB 210x9", h:210, t:9 }, { name:"FB 210x10", h:210, t:10 }, { name:"FB 210x11", h:210, t:11 }, { name:"FB 210x12", h:210, t:12 }, { name:"FB 210x13", h:210, t:13 }, { name:"FB 210x14", h:210, t:14 }, { name:"FB 210x15", h:210, t:15 }, { name:"FB 210x16", h:210, t:16 }, { name:"FB 210x18", h:210, t:18 }, { name:"FB 210x20", h:210, t:20 }, { name:"FB 210x22", h:210, t:22 }, { name:"FB 210x25", h:210, t:25 }, { name:"FB 210x28", h:210, t:28 }, { name:"FB 210x30", h:210, t:30 }, { name:"FB 210x35", h:210, t:35 }, { name:"FB 210x40", h:210, t:40 },
  // h=215
  { name:"FB 215x8", h:215, t:8 }, { name:"FB 215x9", h:215, t:9 }, { name:"FB 215x10", h:215, t:10 }, { name:"FB 215x11", h:215, t:11 }, { name:"FB 215x12", h:215, t:12 }, { name:"FB 215x13", h:215, t:13 }, { name:"FB 215x14", h:215, t:14 }, { name:"FB 215x15", h:215, t:15 }, { name:"FB 215x16", h:215, t:16 }, { name:"FB 215x18", h:215, t:18 }, { name:"FB 215x20", h:215, t:20 }, { name:"FB 215x22", h:215, t:22 }, { name:"FB 215x25", h:215, t:25 }, { name:"FB 215x28", h:215, t:28 }, { name:"FB 215x30", h:215, t:30 }, { name:"FB 215x35", h:215, t:35 }, { name:"FB 215x40", h:215, t:40 },
  // h=220
  { name:"FB 220x8", h:220, t:8 }, { name:"FB 220x9", h:220, t:9 }, { name:"FB 220x10", h:220, t:10 }, { name:"FB 220x11", h:220, t:11 }, { name:"FB 220x12", h:220, t:12 }, { name:"FB 220x13", h:220, t:13 }, { name:"FB 220x14", h:220, t:14 }, { name:"FB 220x15", h:220, t:15 }, { name:"FB 220x16", h:220, t:16 }, { name:"FB 220x18", h:220, t:18 }, { name:"FB 220x20", h:220, t:20 }, { name:"FB 220x22", h:220, t:22 }, { name:"FB 220x25", h:220, t:25 }, { name:"FB 220x28", h:220, t:28 }, { name:"FB 220x30", h:220, t:30 }, { name:"FB 220x35", h:220, t:35 }, { name:"FB 220x40", h:220, t:40 },
  // h=225
  { name:"FB 225x8", h:225, t:8 }, { name:"FB 225x9", h:225, t:9 }, { name:"FB 225x10", h:225, t:10 }, { name:"FB 225x11", h:225, t:11 }, { name:"FB 225x12", h:225, t:12 }, { name:"FB 225x13", h:225, t:13 }, { name:"FB 225x14", h:225, t:14 }, { name:"FB 225x15", h:225, t:15 }, { name:"FB 225x16", h:225, t:16 }, { name:"FB 225x18", h:225, t:18 }, { name:"FB 225x20", h:225, t:20 }, { name:"FB 225x22", h:225, t:22 }, { name:"FB 225x25", h:225, t:25 }, { name:"FB 225x28", h:225, t:28 }, { name:"FB 225x30", h:225, t:30 }, { name:"FB 225x35", h:225, t:35 }, { name:"FB 225x40", h:225, t:40 },
  // h=230
  { name:"FB 230x8", h:230, t:8 }, { name:"FB 230x9", h:230, t:9 }, { name:"FB 230x10", h:230, t:10 }, { name:"FB 230x11", h:230, t:11 }, { name:"FB 230x12", h:230, t:12 }, { name:"FB 230x13", h:230, t:13 }, { name:"FB 230x14", h:230, t:14 }, { name:"FB 230x15", h:230, t:15 }, { name:"FB 230x16", h:230, t:16 }, { name:"FB 230x18", h:230, t:18 }, { name:"FB 230x20", h:230, t:20 }, { name:"FB 230x22", h:230, t:22 }, { name:"FB 230x25", h:230, t:25 }, { name:"FB 230x28", h:230, t:28 }, { name:"FB 230x30", h:230, t:30 }, { name:"FB 230x35", h:230, t:35 }, { name:"FB 230x40", h:230, t:40 },
  // h=235
  { name:"FB 235x8", h:235, t:8 }, { name:"FB 235x9", h:235, t:9 }, { name:"FB 235x10", h:235, t:10 }, { name:"FB 235x11", h:235, t:11 }, { name:"FB 235x12", h:235, t:12 }, { name:"FB 235x13", h:235, t:13 }, { name:"FB 235x14", h:235, t:14 }, { name:"FB 235x15", h:235, t:15 }, { name:"FB 235x16", h:235, t:16 }, { name:"FB 235x18", h:235, t:18 }, { name:"FB 235x20", h:235, t:20 }, { name:"FB 235x22", h:235, t:22 }, { name:"FB 235x25", h:235, t:25 }, { name:"FB 235x28", h:235, t:28 }, { name:"FB 235x30", h:235, t:30 }, { name:"FB 235x35", h:235, t:35 }, { name:"FB 235x40", h:235, t:40 },
  // h=240
  { name:"FB 240x8", h:240, t:8 }, { name:"FB 240x9", h:240, t:9 }, { name:"FB 240x10", h:240, t:10 }, { name:"FB 240x11", h:240, t:11 }, { name:"FB 240x12", h:240, t:12 }, { name:"FB 240x13", h:240, t:13 }, { name:"FB 240x14", h:240, t:14 }, { name:"FB 240x15", h:240, t:15 }, { name:"FB 240x16", h:240, t:16 }, { name:"FB 240x18", h:240, t:18 }, { name:"FB 240x20", h:240, t:20 }, { name:"FB 240x22", h:240, t:22 }, { name:"FB 240x25", h:240, t:25 }, { name:"FB 240x28", h:240, t:28 }, { name:"FB 240x30", h:240, t:30 }, { name:"FB 240x35", h:240, t:35 }, { name:"FB 240x40", h:240, t:40 },
  // h=245
  { name:"FB 245x8", h:245, t:8 }, { name:"FB 245x9", h:245, t:9 }, { name:"FB 245x10", h:245, t:10 }, { name:"FB 245x11", h:245, t:11 }, { name:"FB 245x12", h:245, t:12 }, { name:"FB 245x13", h:245, t:13 }, { name:"FB 245x14", h:245, t:14 }, { name:"FB 245x15", h:245, t:15 }, { name:"FB 245x16", h:245, t:16 }, { name:"FB 245x18", h:245, t:18 }, { name:"FB 245x20", h:245, t:20 }, { name:"FB 245x22", h:245, t:22 }, { name:"FB 245x25", h:245, t:25 }, { name:"FB 245x28", h:245, t:28 }, { name:"FB 245x30", h:245, t:30 }, { name:"FB 245x35", h:245, t:35 }, { name:"FB 245x40", h:245, t:40 },
  // h=250
  { name:"FB 250x8", h:250, t:8 }, { name:"FB 250x9", h:250, t:9 }, { name:"FB 250x10", h:250, t:10 }, { name:"FB 250x11", h:250, t:11 }, { name:"FB 250x12", h:250, t:12 }, { name:"FB 250x13", h:250, t:13 }, { name:"FB 250x14", h:250, t:14 }, { name:"FB 250x15", h:250, t:15 }, { name:"FB 250x16", h:250, t:16 }, { name:"FB 250x18", h:250, t:18 }, { name:"FB 250x20", h:250, t:20 }, { name:"FB 250x22", h:250, t:22 }, { name:"FB 250x25", h:250, t:25 }, { name:"FB 250x28", h:250, t:28 }, { name:"FB 250x30", h:250, t:30 }, { name:"FB 250x35", h:250, t:35 }, { name:"FB 250x40", h:250, t:40 },
  // h=255
  { name:"FB 255x8", h:255, t:8 }, { name:"FB 255x9", h:255, t:9 }, { name:"FB 255x10", h:255, t:10 }, { name:"FB 255x11", h:255, t:11 }, { name:"FB 255x12", h:255, t:12 }, { name:"FB 255x13", h:255, t:13 }, { name:"FB 255x14", h:255, t:14 }, { name:"FB 255x15", h:255, t:15 }, { name:"FB 255x16", h:255, t:16 }, { name:"FB 255x18", h:255, t:18 }, { name:"FB 255x20", h:255, t:20 }, { name:"FB 255x22", h:255, t:22 }, { name:"FB 255x25", h:255, t:25 }, { name:"FB 255x28", h:255, t:28 }, { name:"FB 255x30", h:255, t:30 }, { name:"FB 255x35", h:255, t:35 }, { name:"FB 255x40", h:255, t:40 },
  // h=260
  { name:"FB 260x8", h:260, t:8 }, { name:"FB 260x9", h:260, t:9 }, { name:"FB 260x10", h:260, t:10 }, { name:"FB 260x11", h:260, t:11 }, { name:"FB 260x12", h:260, t:12 }, { name:"FB 260x13", h:260, t:13 }, { name:"FB 260x14", h:260, t:14 }, { name:"FB 260x15", h:260, t:15 }, { name:"FB 260x16", h:260, t:16 }, { name:"FB 260x18", h:260, t:18 }, { name:"FB 260x20", h:260, t:20 }, { name:"FB 260x22", h:260, t:22 }, { name:"FB 260x25", h:260, t:25 }, { name:"FB 260x28", h:260, t:28 }, { name:"FB 260x30", h:260, t:30 }, { name:"FB 260x35", h:260, t:35 }, { name:"FB 260x40", h:260, t:40 },
  // h=265
  { name:"FB 265x8", h:265, t:8 }, { name:"FB 265x9", h:265, t:9 }, { name:"FB 265x10", h:265, t:10 }, { name:"FB 265x11", h:265, t:11 }, { name:"FB 265x12", h:265, t:12 }, { name:"FB 265x13", h:265, t:13 }, { name:"FB 265x14", h:265, t:14 }, { name:"FB 265x15", h:265, t:15 }, { name:"FB 265x16", h:265, t:16 }, { name:"FB 265x18", h:265, t:18 }, { name:"FB 265x20", h:265, t:20 }, { name:"FB 265x22", h:265, t:22 }, { name:"FB 265x25", h:265, t:25 }, { name:"FB 265x28", h:265, t:28 }, { name:"FB 265x30", h:265, t:30 }, { name:"FB 265x35", h:265, t:35 }, { name:"FB 265x40", h:265, t:40 },
  // h=270
  { name:"FB 270x8", h:270, t:8 }, { name:"FB 270x9", h:270, t:9 }, { name:"FB 270x10", h:270, t:10 }, { name:"FB 270x11", h:270, t:11 }, { name:"FB 270x12", h:270, t:12 }, { name:"FB 270x13", h:270, t:13 }, { name:"FB 270x14", h:270, t:14 }, { name:"FB 270x15", h:270, t:15 }, { name:"FB 270x16", h:270, t:16 }, { name:"FB 270x18", h:270, t:18 }, { name:"FB 270x20", h:270, t:20 }, { name:"FB 270x22", h:270, t:22 }, { name:"FB 270x25", h:270, t:25 }, { name:"FB 270x28", h:270, t:28 }, { name:"FB 270x30", h:270, t:30 }, { name:"FB 270x35", h:270, t:35 }, { name:"FB 270x40", h:270, t:40 },
  // h=275
  { name:"FB 275x8", h:275, t:8 }, { name:"FB 275x9", h:275, t:9 }, { name:"FB 275x10", h:275, t:10 }, { name:"FB 275x11", h:275, t:11 }, { name:"FB 275x12", h:275, t:12 }, { name:"FB 275x13", h:275, t:13 }, { name:"FB 275x14", h:275, t:14 }, { name:"FB 275x15", h:275, t:15 }, { name:"FB 275x16", h:275, t:16 }, { name:"FB 275x18", h:275, t:18 }, { name:"FB 275x20", h:275, t:20 }, { name:"FB 275x22", h:275, t:22 }, { name:"FB 275x25", h:275, t:25 }, { name:"FB 275x28", h:275, t:28 }, { name:"FB 275x30", h:275, t:30 }, { name:"FB 275x35", h:275, t:35 }, { name:"FB 275x40", h:275, t:40 },
  // h=280
  { name:"FB 280x8", h:280, t:8 }, { name:"FB 280x9", h:280, t:9 }, { name:"FB 280x10", h:280, t:10 }, { name:"FB 280x11", h:280, t:11 }, { name:"FB 280x12", h:280, t:12 }, { name:"FB 280x13", h:280, t:13 }, { name:"FB 280x14", h:280, t:14 }, { name:"FB 280x15", h:280, t:15 }, { name:"FB 280x16", h:280, t:16 }, { name:"FB 280x18", h:280, t:18 }, { name:"FB 280x20", h:280, t:20 }, { name:"FB 280x22", h:280, t:22 }, { name:"FB 280x25", h:280, t:25 }, { name:"FB 280x28", h:280, t:28 }, { name:"FB 280x30", h:280, t:30 }, { name:"FB 280x35", h:280, t:35 }, { name:"FB 280x40", h:280, t:40 },
  // h=285
  { name:"FB 285x8", h:285, t:8 }, { name:"FB 285x9", h:285, t:9 }, { name:"FB 285x10", h:285, t:10 }, { name:"FB 285x11", h:285, t:11 }, { name:"FB 285x12", h:285, t:12 }, { name:"FB 285x13", h:285, t:13 }, { name:"FB 285x14", h:285, t:14 }, { name:"FB 285x15", h:285, t:15 }, { name:"FB 285x16", h:285, t:16 }, { name:"FB 285x18", h:285, t:18 }, { name:"FB 285x20", h:285, t:20 }, { name:"FB 285x22", h:285, t:22 }, { name:"FB 285x25", h:285, t:25 }, { name:"FB 285x28", h:285, t:28 }, { name:"FB 285x30", h:285, t:30 }, { name:"FB 285x35", h:285, t:35 }, { name:"FB 285x40", h:285, t:40 },
  // h=290
  { name:"FB 290x8", h:290, t:8 }, { name:"FB 290x9", h:290, t:9 }, { name:"FB 290x10", h:290, t:10 }, { name:"FB 290x11", h:290, t:11 }, { name:"FB 290x12", h:290, t:12 }, { name:"FB 290x13", h:290, t:13 }, { name:"FB 290x14", h:290, t:14 }, { name:"FB 290x15", h:290, t:15 }, { name:"FB 290x16", h:290, t:16 }, { name:"FB 290x18", h:290, t:18 }, { name:"FB 290x20", h:290, t:20 }, { name:"FB 290x22", h:290, t:22 }, { name:"FB 290x25", h:290, t:25 }, { name:"FB 290x28", h:290, t:28 }, { name:"FB 290x30", h:290, t:30 }, { name:"FB 290x35", h:290, t:35 }, { name:"FB 290x40", h:290, t:40 },
  // h=295
  { name:"FB 295x8", h:295, t:8 }, { name:"FB 295x9", h:295, t:9 }, { name:"FB 295x10", h:295, t:10 }, { name:"FB 295x11", h:295, t:11 }, { name:"FB 295x12", h:295, t:12 }, { name:"FB 295x13", h:295, t:13 }, { name:"FB 295x14", h:295, t:14 }, { name:"FB 295x15", h:295, t:15 }, { name:"FB 295x16", h:295, t:16 }, { name:"FB 295x18", h:295, t:18 }, { name:"FB 295x20", h:295, t:20 }, { name:"FB 295x22", h:295, t:22 }, { name:"FB 295x25", h:295, t:25 }, { name:"FB 295x28", h:295, t:28 }, { name:"FB 295x30", h:295, t:30 }, { name:"FB 295x35", h:295, t:35 }, { name:"FB 295x40", h:295, t:40 },
  // h=300
  { name:"FB 300x8", h:300, t:8 }, { name:"FB 300x9", h:300, t:9 }, { name:"FB 300x10", h:300, t:10 }, { name:"FB 300x11", h:300, t:11 }, { name:"FB 300x12", h:300, t:12 }, { name:"FB 300x13", h:300, t:13 }, { name:"FB 300x14", h:300, t:14 }, { name:"FB 300x15", h:300, t:15 }, { name:"FB 300x16", h:300, t:16 }, { name:"FB 300x18", h:300, t:18 }, { name:"FB 300x20", h:300, t:20 }, { name:"FB 300x22", h:300, t:22 }, { name:"FB 300x25", h:300, t:25 }, { name:"FB 300x28", h:300, t:28 }, { name:"FB 300x30", h:300, t:30 }, { name:"FB 300x35", h:300, t:35 }, { name:"FB 300x40", h:300, t:40 },
  // h=305
  { name:"FB 305x8", h:305, t:8 }, { name:"FB 305x9", h:305, t:9 }, { name:"FB 305x10", h:305, t:10 }, { name:"FB 305x11", h:305, t:11 }, { name:"FB 305x12", h:305, t:12 }, { name:"FB 305x13", h:305, t:13 }, { name:"FB 305x14", h:305, t:14 }, { name:"FB 305x15", h:305, t:15 }, { name:"FB 305x16", h:305, t:16 }, { name:"FB 305x18", h:305, t:18 }, { name:"FB 305x20", h:305, t:20 }, { name:"FB 305x22", h:305, t:22 }, { name:"FB 305x25", h:305, t:25 }, { name:"FB 305x28", h:305, t:28 }, { name:"FB 305x30", h:305, t:30 }, { name:"FB 305x35", h:305, t:35 }, { name:"FB 305x40", h:305, t:40 },
  // h=310
  { name:"FB 310x8", h:310, t:8 }, { name:"FB 310x9", h:310, t:9 }, { name:"FB 310x10", h:310, t:10 }, { name:"FB 310x11", h:310, t:11 }, { name:"FB 310x12", h:310, t:12 }, { name:"FB 310x13", h:310, t:13 }, { name:"FB 310x14", h:310, t:14 }, { name:"FB 310x15", h:310, t:15 }, { name:"FB 310x16", h:310, t:16 }, { name:"FB 310x18", h:310, t:18 }, { name:"FB 310x20", h:310, t:20 }, { name:"FB 310x22", h:310, t:22 }, { name:"FB 310x25", h:310, t:25 }, { name:"FB 310x28", h:310, t:28 }, { name:"FB 310x30", h:310, t:30 }, { name:"FB 310x35", h:310, t:35 }, { name:"FB 310x40", h:310, t:40 },
  // h=315
  { name:"FB 315x8", h:315, t:8 }, { name:"FB 315x9", h:315, t:9 }, { name:"FB 315x10", h:315, t:10 }, { name:"FB 315x11", h:315, t:11 }, { name:"FB 315x12", h:315, t:12 }, { name:"FB 315x13", h:315, t:13 }, { name:"FB 315x14", h:315, t:14 }, { name:"FB 315x15", h:315, t:15 }, { name:"FB 315x16", h:315, t:16 }, { name:"FB 315x18", h:315, t:18 }, { name:"FB 315x20", h:315, t:20 }, { name:"FB 315x22", h:315, t:22 }, { name:"FB 315x25", h:315, t:25 }, { name:"FB 315x28", h:315, t:28 }, { name:"FB 315x30", h:315, t:30 }, { name:"FB 315x35", h:315, t:35 }, { name:"FB 315x40", h:315, t:40 },
  // h=320
  { name:"FB 320x8", h:320, t:8 }, { name:"FB 320x9", h:320, t:9 }, { name:"FB 320x10", h:320, t:10 }, { name:"FB 320x11", h:320, t:11 }, { name:"FB 320x12", h:320, t:12 }, { name:"FB 320x13", h:320, t:13 }, { name:"FB 320x14", h:320, t:14 }, { name:"FB 320x15", h:320, t:15 }, { name:"FB 320x16", h:320, t:16 }, { name:"FB 320x18", h:320, t:18 }, { name:"FB 320x20", h:320, t:20 }, { name:"FB 320x22", h:320, t:22 }, { name:"FB 320x25", h:320, t:25 }, { name:"FB 320x28", h:320, t:28 }, { name:"FB 320x30", h:320, t:30 }, { name:"FB 320x35", h:320, t:35 }, { name:"FB 320x40", h:320, t:40 },
  // h=325
  { name:"FB 325x8", h:325, t:8 }, { name:"FB 325x9", h:325, t:9 }, { name:"FB 325x10", h:325, t:10 }, { name:"FB 325x11", h:325, t:11 }, { name:"FB 325x12", h:325, t:12 }, { name:"FB 325x13", h:325, t:13 }, { name:"FB 325x14", h:325, t:14 }, { name:"FB 325x15", h:325, t:15 }, { name:"FB 325x16", h:325, t:16 }, { name:"FB 325x18", h:325, t:18 }, { name:"FB 325x20", h:325, t:20 }, { name:"FB 325x22", h:325, t:22 }, { name:"FB 325x25", h:325, t:25 }, { name:"FB 325x28", h:325, t:28 }, { name:"FB 325x30", h:325, t:30 }, { name:"FB 325x35", h:325, t:35 }, { name:"FB 325x40", h:325, t:40 },
  // h=330
  { name:"FB 330x8", h:330, t:8 }, { name:"FB 330x9", h:330, t:9 }, { name:"FB 330x10", h:330, t:10 }, { name:"FB 330x11", h:330, t:11 }, { name:"FB 330x12", h:330, t:12 }, { name:"FB 330x13", h:330, t:13 }, { name:"FB 330x14", h:330, t:14 }, { name:"FB 330x15", h:330, t:15 }, { name:"FB 330x16", h:330, t:16 }, { name:"FB 330x18", h:330, t:18 }, { name:"FB 330x20", h:330, t:20 }, { name:"FB 330x22", h:330, t:22 }, { name:"FB 330x25", h:330, t:25 }, { name:"FB 330x28", h:330, t:28 }, { name:"FB 330x30", h:330, t:30 }, { name:"FB 330x35", h:330, t:35 }, { name:"FB 330x40", h:330, t:40 },
  // h=335
  { name:"FB 335x8", h:335, t:8 }, { name:"FB 335x9", h:335, t:9 }, { name:"FB 335x10", h:335, t:10 }, { name:"FB 335x11", h:335, t:11 }, { name:"FB 335x12", h:335, t:12 }, { name:"FB 335x13", h:335, t:13 }, { name:"FB 335x14", h:335, t:14 }, { name:"FB 335x15", h:335, t:15 }, { name:"FB 335x16", h:335, t:16 }, { name:"FB 335x18", h:335, t:18 }, { name:"FB 335x20", h:335, t:20 }, { name:"FB 335x22", h:335, t:22 }, { name:"FB 335x25", h:335, t:25 }, { name:"FB 335x28", h:335, t:28 }, { name:"FB 335x30", h:335, t:30 }, { name:"FB 335x35", h:335, t:35 }, { name:"FB 335x40", h:335, t:40 },
  // h=340
  { name:"FB 340x8", h:340, t:8 }, { name:"FB 340x9", h:340, t:9 }, { name:"FB 340x10", h:340, t:10 }, { name:"FB 340x11", h:340, t:11 }, { name:"FB 340x12", h:340, t:12 }, { name:"FB 340x13", h:340, t:13 }, { name:"FB 340x14", h:340, t:14 }, { name:"FB 340x15", h:340, t:15 }, { name:"FB 340x16", h:340, t:16 }, { name:"FB 340x18", h:340, t:18 }, { name:"FB 340x20", h:340, t:20 }, { name:"FB 340x22", h:340, t:22 }, { name:"FB 340x25", h:340, t:25 }, { name:"FB 340x28", h:340, t:28 }, { name:"FB 340x30", h:340, t:30 }, { name:"FB 340x35", h:340, t:35 }, { name:"FB 340x40", h:340, t:40 },
  // h=345
  { name:"FB 345x8", h:345, t:8 }, { name:"FB 345x9", h:345, t:9 }, { name:"FB 345x10", h:345, t:10 }, { name:"FB 345x11", h:345, t:11 }, { name:"FB 345x12", h:345, t:12 }, { name:"FB 345x13", h:345, t:13 }, { name:"FB 345x14", h:345, t:14 }, { name:"FB 345x15", h:345, t:15 }, { name:"FB 345x16", h:345, t:16 }, { name:"FB 345x18", h:345, t:18 }, { name:"FB 345x20", h:345, t:20 }, { name:"FB 345x22", h:345, t:22 }, { name:"FB 345x25", h:345, t:25 }, { name:"FB 345x28", h:345, t:28 }, { name:"FB 345x30", h:345, t:30 }, { name:"FB 345x35", h:345, t:35 }, { name:"FB 345x40", h:345, t:40 },
  // h=350
  { name:"FB 350x8", h:350, t:8 }, { name:"FB 350x9", h:350, t:9 }, { name:"FB 350x10", h:350, t:10 }, { name:"FB 350x11", h:350, t:11 }, { name:"FB 350x12", h:350, t:12 }, { name:"FB 350x13", h:350, t:13 }, { name:"FB 350x14", h:350, t:14 }, { name:"FB 350x15", h:350, t:15 }, { name:"FB 350x16", h:350, t:16 }, { name:"FB 350x18", h:350, t:18 }, { name:"FB 350x20", h:350, t:20 }, { name:"FB 350x22", h:350, t:22 }, { name:"FB 350x25", h:350, t:25 }, { name:"FB 350x28", h:350, t:28 }, { name:"FB 350x30", h:350, t:30 }, { name:"FB 350x35", h:350, t:35 }, { name:"FB 350x40", h:350, t:40 },
  // h=355
  { name:"FB 355x8", h:355, t:8 }, { name:"FB 355x9", h:355, t:9 }, { name:"FB 355x10", h:355, t:10 }, { name:"FB 355x11", h:355, t:11 }, { name:"FB 355x12", h:355, t:12 }, { name:"FB 355x13", h:355, t:13 }, { name:"FB 355x14", h:355, t:14 }, { name:"FB 355x15", h:355, t:15 }, { name:"FB 355x16", h:355, t:16 }, { name:"FB 355x18", h:355, t:18 }, { name:"FB 355x20", h:355, t:20 }, { name:"FB 355x22", h:355, t:22 }, { name:"FB 355x25", h:355, t:25 }, { name:"FB 355x28", h:355, t:28 }, { name:"FB 355x30", h:355, t:30 }, { name:"FB 355x35", h:355, t:35 }, { name:"FB 355x40", h:355, t:40 },
  // h=360
  { name:"FB 360x8", h:360, t:8 }, { name:"FB 360x9", h:360, t:9 }, { name:"FB 360x10", h:360, t:10 }, { name:"FB 360x11", h:360, t:11 }, { name:"FB 360x12", h:360, t:12 }, { name:"FB 360x13", h:360, t:13 }, { name:"FB 360x14", h:360, t:14 }, { name:"FB 360x15", h:360, t:15 }, { name:"FB 360x16", h:360, t:16 }, { name:"FB 360x18", h:360, t:18 }, { name:"FB 360x20", h:360, t:20 }, { name:"FB 360x22", h:360, t:22 }, { name:"FB 360x25", h:360, t:25 }, { name:"FB 360x28", h:360, t:28 }, { name:"FB 360x30", h:360, t:30 }, { name:"FB 360x35", h:360, t:35 }, { name:"FB 360x40", h:360, t:40 },
  // h=365
  { name:"FB 365x8", h:365, t:8 }, { name:"FB 365x9", h:365, t:9 }, { name:"FB 365x10", h:365, t:10 }, { name:"FB 365x11", h:365, t:11 }, { name:"FB 365x12", h:365, t:12 }, { name:"FB 365x13", h:365, t:13 }, { name:"FB 365x14", h:365, t:14 }, { name:"FB 365x15", h:365, t:15 }, { name:"FB 365x16", h:365, t:16 }, { name:"FB 365x18", h:365, t:18 }, { name:"FB 365x20", h:365, t:20 }, { name:"FB 365x22", h:365, t:22 }, { name:"FB 365x25", h:365, t:25 }, { name:"FB 365x28", h:365, t:28 }, { name:"FB 365x30", h:365, t:30 }, { name:"FB 365x35", h:365, t:35 }, { name:"FB 365x40", h:365, t:40 },
  // h=370
  { name:"FB 370x8", h:370, t:8 }, { name:"FB 370x9", h:370, t:9 }, { name:"FB 370x10", h:370, t:10 }, { name:"FB 370x11", h:370, t:11 }, { name:"FB 370x12", h:370, t:12 }, { name:"FB 370x13", h:370, t:13 }, { name:"FB 370x14", h:370, t:14 }, { name:"FB 370x15", h:370, t:15 }, { name:"FB 370x16", h:370, t:16 }, { name:"FB 370x18", h:370, t:18 }, { name:"FB 370x20", h:370, t:20 }, { name:"FB 370x22", h:370, t:22 }, { name:"FB 370x25", h:370, t:25 }, { name:"FB 370x28", h:370, t:28 }, { name:"FB 370x30", h:370, t:30 }, { name:"FB 370x35", h:370, t:35 }, { name:"FB 370x40", h:370, t:40 },
  // h=375
  { name:"FB 375x8", h:375, t:8 }, { name:"FB 375x9", h:375, t:9 }, { name:"FB 375x10", h:375, t:10 }, { name:"FB 375x11", h:375, t:11 }, { name:"FB 375x12", h:375, t:12 }, { name:"FB 375x13", h:375, t:13 }, { name:"FB 375x14", h:375, t:14 }, { name:"FB 375x15", h:375, t:15 }, { name:"FB 375x16", h:375, t:16 }, { name:"FB 375x18", h:375, t:18 }, { name:"FB 375x20", h:375, t:20 }, { name:"FB 375x22", h:375, t:22 }, { name:"FB 375x25", h:375, t:25 }, { name:"FB 375x28", h:375, t:28 }, { name:"FB 375x30", h:375, t:30 }, { name:"FB 375x35", h:375, t:35 }, { name:"FB 375x40", h:375, t:40 },
  // h=380
  { name:"FB 380x8", h:380, t:8 }, { name:"FB 380x9", h:380, t:9 }, { name:"FB 380x10", h:380, t:10 }, { name:"FB 380x11", h:380, t:11 }, { name:"FB 380x12", h:380, t:12 }, { name:"FB 380x13", h:380, t:13 }, { name:"FB 380x14", h:380, t:14 }, { name:"FB 380x15", h:380, t:15 }, { name:"FB 380x16", h:380, t:16 }, { name:"FB 380x18", h:380, t:18 }, { name:"FB 380x20", h:380, t:20 }, { name:"FB 380x22", h:380, t:22 }, { name:"FB 380x25", h:380, t:25 }, { name:"FB 380x28", h:380, t:28 }, { name:"FB 380x30", h:380, t:30 }, { name:"FB 380x35", h:380, t:35 }, { name:"FB 380x40", h:380, t:40 },
  // h=385
  { name:"FB 385x8", h:385, t:8 }, { name:"FB 385x9", h:385, t:9 }, { name:"FB 385x10", h:385, t:10 }, { name:"FB 385x11", h:385, t:11 }, { name:"FB 385x12", h:385, t:12 }, { name:"FB 385x13", h:385, t:13 }, { name:"FB 385x14", h:385, t:14 }, { name:"FB 385x15", h:385, t:15 }, { name:"FB 385x16", h:385, t:16 }, { name:"FB 385x18", h:385, t:18 }, { name:"FB 385x20", h:385, t:20 }, { name:"FB 385x22", h:385, t:22 }, { name:"FB 385x25", h:385, t:25 }, { name:"FB 385x28", h:385, t:28 }, { name:"FB 385x30", h:385, t:30 }, { name:"FB 385x35", h:385, t:35 }, { name:"FB 385x40", h:385, t:40 },
  // h=390
  { name:"FB 390x8", h:390, t:8 }, { name:"FB 390x9", h:390, t:9 }, { name:"FB 390x10", h:390, t:10 }, { name:"FB 390x11", h:390, t:11 }, { name:"FB 390x12", h:390, t:12 }, { name:"FB 390x13", h:390, t:13 }, { name:"FB 390x14", h:390, t:14 }, { name:"FB 390x15", h:390, t:15 }, { name:"FB 390x16", h:390, t:16 }, { name:"FB 390x18", h:390, t:18 }, { name:"FB 390x20", h:390, t:20 }, { name:"FB 390x22", h:390, t:22 }, { name:"FB 390x25", h:390, t:25 }, { name:"FB 390x28", h:390, t:28 }, { name:"FB 390x30", h:390, t:30 }, { name:"FB 390x35", h:390, t:35 }, { name:"FB 390x40", h:390, t:40 },
  // h=395
  { name:"FB 395x8", h:395, t:8 }, { name:"FB 395x9", h:395, t:9 }, { name:"FB 395x10", h:395, t:10 }, { name:"FB 395x11", h:395, t:11 }, { name:"FB 395x12", h:395, t:12 }, { name:"FB 395x13", h:395, t:13 }, { name:"FB 395x14", h:395, t:14 }, { name:"FB 395x15", h:395, t:15 }, { name:"FB 395x16", h:395, t:16 }, { name:"FB 395x18", h:395, t:18 }, { name:"FB 395x20", h:395, t:20 }, { name:"FB 395x22", h:395, t:22 }, { name:"FB 395x25", h:395, t:25 }, { name:"FB 395x28", h:395, t:28 }, { name:"FB 395x30", h:395, t:30 }, { name:"FB 395x35", h:395, t:35 }, { name:"FB 395x40", h:395, t:40 },
  // h=400
  { name:"FB 400x8", h:400, t:8 }, { name:"FB 400x9", h:400, t:9 }, { name:"FB 400x10", h:400, t:10 }, { name:"FB 400x11", h:400, t:11 }, { name:"FB 400x12", h:400, t:12 }, { name:"FB 400x13", h:400, t:13 }, { name:"FB 400x14", h:400, t:14 }, { name:"FB 400x15", h:400, t:15 }, { name:"FB 400x16", h:400, t:16 }, { name:"FB 400x18", h:400, t:18 }, { name:"FB 400x20", h:400, t:20 }, { name:"FB 400x22", h:400, t:22 }, { name:"FB 400x25", h:400, t:25 }, { name:"FB 400x28", h:400, t:28 }, { name:"FB 400x30", h:400, t:30 }, { name:"FB 400x35", h:400, t:35 }, { name:"FB 400x40", h:400, t:40 },
  // h=405
  { name:"FB 405x8", h:405, t:8 }, { name:"FB 405x9", h:405, t:9 }, { name:"FB 405x10", h:405, t:10 }, { name:"FB 405x11", h:405, t:11 }, { name:"FB 405x12", h:405, t:12 }, { name:"FB 405x13", h:405, t:13 }, { name:"FB 405x14", h:405, t:14 }, { name:"FB 405x15", h:405, t:15 }, { name:"FB 405x16", h:405, t:16 }, { name:"FB 405x18", h:405, t:18 }, { name:"FB 405x20", h:405, t:20 }, { name:"FB 405x22", h:405, t:22 }, { name:"FB 405x25", h:405, t:25 }, { name:"FB 405x28", h:405, t:28 }, { name:"FB 405x30", h:405, t:30 }, { name:"FB 405x35", h:405, t:35 }, { name:"FB 405x40", h:405, t:40 },
  // h=410
  { name:"FB 410x8", h:410, t:8 }, { name:"FB 410x9", h:410, t:9 }, { name:"FB 410x10", h:410, t:10 }, { name:"FB 410x11", h:410, t:11 }, { name:"FB 410x12", h:410, t:12 }, { name:"FB 410x13", h:410, t:13 }, { name:"FB 410x14", h:410, t:14 }, { name:"FB 410x15", h:410, t:15 }, { name:"FB 410x16", h:410, t:16 }, { name:"FB 410x18", h:410, t:18 }, { name:"FB 410x20", h:410, t:20 }, { name:"FB 410x22", h:410, t:22 }, { name:"FB 410x25", h:410, t:25 }, { name:"FB 410x28", h:410, t:28 }, { name:"FB 410x30", h:410, t:30 }, { name:"FB 410x35", h:410, t:35 }, { name:"FB 410x40", h:410, t:40 },
  // h=415
  { name:"FB 415x8", h:415, t:8 }, { name:"FB 415x9", h:415, t:9 }, { name:"FB 415x10", h:415, t:10 }, { name:"FB 415x11", h:415, t:11 }, { name:"FB 415x12", h:415, t:12 }, { name:"FB 415x13", h:415, t:13 }, { name:"FB 415x14", h:415, t:14 }, { name:"FB 415x15", h:415, t:15 }, { name:"FB 415x16", h:415, t:16 }, { name:"FB 415x18", h:415, t:18 }, { name:"FB 415x20", h:415, t:20 }, { name:"FB 415x22", h:415, t:22 }, { name:"FB 415x25", h:415, t:25 }, { name:"FB 415x28", h:415, t:28 }, { name:"FB 415x30", h:415, t:30 }, { name:"FB 415x35", h:415, t:35 }, { name:"FB 415x40", h:415, t:40 },
  // h=420
  { name:"FB 420x8", h:420, t:8 }, { name:"FB 420x9", h:420, t:9 }, { name:"FB 420x10", h:420, t:10 }, { name:"FB 420x11", h:420, t:11 }, { name:"FB 420x12", h:420, t:12 }, { name:"FB 420x13", h:420, t:13 }, { name:"FB 420x14", h:420, t:14 }, { name:"FB 420x15", h:420, t:15 }, { name:"FB 420x16", h:420, t:16 }, { name:"FB 420x18", h:420, t:18 }, { name:"FB 420x20", h:420, t:20 }, { name:"FB 420x22", h:420, t:22 }, { name:"FB 420x25", h:420, t:25 }, { name:"FB 420x28", h:420, t:28 }, { name:"FB 420x30", h:420, t:30 }, { name:"FB 420x35", h:420, t:35 }, { name:"FB 420x40", h:420, t:40 },
  // h=425
  { name:"FB 425x8", h:425, t:8 }, { name:"FB 425x9", h:425, t:9 }, { name:"FB 425x10", h:425, t:10 }, { name:"FB 425x11", h:425, t:11 }, { name:"FB 425x12", h:425, t:12 }, { name:"FB 425x13", h:425, t:13 }, { name:"FB 425x14", h:425, t:14 }, { name:"FB 425x15", h:425, t:15 }, { name:"FB 425x16", h:425, t:16 }, { name:"FB 425x18", h:425, t:18 }, { name:"FB 425x20", h:425, t:20 }, { name:"FB 425x22", h:425, t:22 }, { name:"FB 425x25", h:425, t:25 }, { name:"FB 425x28", h:425, t:28 }, { name:"FB 425x30", h:425, t:30 }, { name:"FB 425x35", h:425, t:35 }, { name:"FB 425x40", h:425, t:40 },
  // h=430
  { name:"FB 430x8", h:430, t:8 }, { name:"FB 430x9", h:430, t:9 }, { name:"FB 430x10", h:430, t:10 }, { name:"FB 430x11", h:430, t:11 }, { name:"FB 430x12", h:430, t:12 }, { name:"FB 430x13", h:430, t:13 }, { name:"FB 430x14", h:430, t:14 }, { name:"FB 430x15", h:430, t:15 }, { name:"FB 430x16", h:430, t:16 }, { name:"FB 430x18", h:430, t:18 }, { name:"FB 430x20", h:430, t:20 }, { name:"FB 430x22", h:430, t:22 }, { name:"FB 430x25", h:430, t:25 }, { name:"FB 430x28", h:430, t:28 }, { name:"FB 430x30", h:430, t:30 }, { name:"FB 430x35", h:430, t:35 }, { name:"FB 430x40", h:430, t:40 },
  // h=435
  { name:"FB 435x8", h:435, t:8 }, { name:"FB 435x9", h:435, t:9 }, { name:"FB 435x10", h:435, t:10 }, { name:"FB 435x11", h:435, t:11 }, { name:"FB 435x12", h:435, t:12 }, { name:"FB 435x13", h:435, t:13 }, { name:"FB 435x14", h:435, t:14 }, { name:"FB 435x15", h:435, t:15 }, { name:"FB 435x16", h:435, t:16 }, { name:"FB 435x18", h:435, t:18 }, { name:"FB 435x20", h:435, t:20 }, { name:"FB 435x22", h:435, t:22 }, { name:"FB 435x25", h:435, t:25 }, { name:"FB 435x28", h:435, t:28 }, { name:"FB 435x30", h:435, t:30 }, { name:"FB 435x35", h:435, t:35 }, { name:"FB 435x40", h:435, t:40 },
  // h=440
  { name:"FB 440x8", h:440, t:8 }, { name:"FB 440x9", h:440, t:9 }, { name:"FB 440x10", h:440, t:10 }, { name:"FB 440x11", h:440, t:11 }, { name:"FB 440x12", h:440, t:12 }, { name:"FB 440x13", h:440, t:13 }, { name:"FB 440x14", h:440, t:14 }, { name:"FB 440x15", h:440, t:15 }, { name:"FB 440x16", h:440, t:16 }, { name:"FB 440x18", h:440, t:18 }, { name:"FB 440x20", h:440, t:20 }, { name:"FB 440x22", h:440, t:22 }, { name:"FB 440x25", h:440, t:25 }, { name:"FB 440x28", h:440, t:28 }, { name:"FB 440x30", h:440, t:30 }, { name:"FB 440x35", h:440, t:35 }, { name:"FB 440x40", h:440, t:40 },
  // h=445
  { name:"FB 445x8", h:445, t:8 }, { name:"FB 445x9", h:445, t:9 }, { name:"FB 445x10", h:445, t:10 }, { name:"FB 445x11", h:445, t:11 }, { name:"FB 445x12", h:445, t:12 }, { name:"FB 445x13", h:445, t:13 }, { name:"FB 445x14", h:445, t:14 }, { name:"FB 445x15", h:445, t:15 }, { name:"FB 445x16", h:445, t:16 }, { name:"FB 445x18", h:445, t:18 }, { name:"FB 445x20", h:445, t:20 }, { name:"FB 445x22", h:445, t:22 }, { name:"FB 445x25", h:445, t:25 }, { name:"FB 445x28", h:445, t:28 }, { name:"FB 445x30", h:445, t:30 }, { name:"FB 445x35", h:445, t:35 }, { name:"FB 445x40", h:445, t:40 },
  // h=450
  { name:"FB 450x8", h:450, t:8 }, { name:"FB 450x9", h:450, t:9 }, { name:"FB 450x10", h:450, t:10 }, { name:"FB 450x11", h:450, t:11 }, { name:"FB 450x12", h:450, t:12 }, { name:"FB 450x13", h:450, t:13 }, { name:"FB 450x14", h:450, t:14 }, { name:"FB 450x15", h:450, t:15 }, { name:"FB 450x16", h:450, t:16 }, { name:"FB 450x18", h:450, t:18 }, { name:"FB 450x20", h:450, t:20 }, { name:"FB 450x22", h:450, t:22 }, { name:"FB 450x25", h:450, t:25 }, { name:"FB 450x28", h:450, t:28 }, { name:"FB 450x30", h:450, t:30 }, { name:"FB 450x35", h:450, t:35 }, { name:"FB 450x40", h:450, t:40 },
  // h=455
  { name:"FB 455x8", h:455, t:8 }, { name:"FB 455x9", h:455, t:9 }, { name:"FB 455x10", h:455, t:10 }, { name:"FB 455x11", h:455, t:11 }, { name:"FB 455x12", h:455, t:12 }, { name:"FB 455x13", h:455, t:13 }, { name:"FB 455x14", h:455, t:14 }, { name:"FB 455x15", h:455, t:15 }, { name:"FB 455x16", h:455, t:16 }, { name:"FB 455x18", h:455, t:18 }, { name:"FB 455x20", h:455, t:20 }, { name:"FB 455x22", h:455, t:22 }, { name:"FB 455x25", h:455, t:25 }, { name:"FB 455x28", h:455, t:28 }, { name:"FB 455x30", h:455, t:30 }, { name:"FB 455x35", h:455, t:35 }, { name:"FB 455x40", h:455, t:40 },
  // h=460
  { name:"FB 460x8", h:460, t:8 }, { name:"FB 460x9", h:460, t:9 }, { name:"FB 460x10", h:460, t:10 }, { name:"FB 460x11", h:460, t:11 }, { name:"FB 460x12", h:460, t:12 }, { name:"FB 460x13", h:460, t:13 }, { name:"FB 460x14", h:460, t:14 }, { name:"FB 460x15", h:460, t:15 }, { name:"FB 460x16", h:460, t:16 }, { name:"FB 460x18", h:460, t:18 }, { name:"FB 460x20", h:460, t:20 }, { name:"FB 460x22", h:460, t:22 }, { name:"FB 460x25", h:460, t:25 }, { name:"FB 460x28", h:460, t:28 }, { name:"FB 460x30", h:460, t:30 }, { name:"FB 460x35", h:460, t:35 }, { name:"FB 460x40", h:460, t:40 },
  // h=465
  { name:"FB 465x8", h:465, t:8 }, { name:"FB 465x9", h:465, t:9 }, { name:"FB 465x10", h:465, t:10 }, { name:"FB 465x11", h:465, t:11 }, { name:"FB 465x12", h:465, t:12 }, { name:"FB 465x13", h:465, t:13 }, { name:"FB 465x14", h:465, t:14 }, { name:"FB 465x15", h:465, t:15 }, { name:"FB 465x16", h:465, t:16 }, { name:"FB 465x18", h:465, t:18 }, { name:"FB 465x20", h:465, t:20 }, { name:"FB 465x22", h:465, t:22 }, { name:"FB 465x25", h:465, t:25 }, { name:"FB 465x28", h:465, t:28 }, { name:"FB 465x30", h:465, t:30 }, { name:"FB 465x35", h:465, t:35 }, { name:"FB 465x40", h:465, t:40 },
  // h=470
  { name:"FB 470x8", h:470, t:8 }, { name:"FB 470x9", h:470, t:9 }, { name:"FB 470x10", h:470, t:10 }, { name:"FB 470x11", h:470, t:11 }, { name:"FB 470x12", h:470, t:12 }, { name:"FB 470x13", h:470, t:13 }, { name:"FB 470x14", h:470, t:14 }, { name:"FB 470x15", h:470, t:15 }, { name:"FB 470x16", h:470, t:16 }, { name:"FB 470x18", h:470, t:18 }, { name:"FB 470x20", h:470, t:20 }, { name:"FB 470x22", h:470, t:22 }, { name:"FB 470x25", h:470, t:25 }, { name:"FB 470x28", h:470, t:28 }, { name:"FB 470x30", h:470, t:30 }, { name:"FB 470x35", h:470, t:35 }, { name:"FB 470x40", h:470, t:40 },
  // h=475
  { name:"FB 475x8", h:475, t:8 }, { name:"FB 475x9", h:475, t:9 }, { name:"FB 475x10", h:475, t:10 }, { name:"FB 475x11", h:475, t:11 }, { name:"FB 475x12", h:475, t:12 }, { name:"FB 475x13", h:475, t:13 }, { name:"FB 475x14", h:475, t:14 }, { name:"FB 475x15", h:475, t:15 }, { name:"FB 475x16", h:475, t:16 }, { name:"FB 475x18", h:475, t:18 }, { name:"FB 475x20", h:475, t:20 }, { name:"FB 475x22", h:475, t:22 }, { name:"FB 475x25", h:475, t:25 }, { name:"FB 475x28", h:475, t:28 }, { name:"FB 475x30", h:475, t:30 }, { name:"FB 475x35", h:475, t:35 }, { name:"FB 475x40", h:475, t:40 },
  // h=480
  { name:"FB 480x8", h:480, t:8 }, { name:"FB 480x9", h:480, t:9 }, { name:"FB 480x10", h:480, t:10 }, { name:"FB 480x11", h:480, t:11 }, { name:"FB 480x12", h:480, t:12 }, { name:"FB 480x13", h:480, t:13 }, { name:"FB 480x14", h:480, t:14 }, { name:"FB 480x15", h:480, t:15 }, { name:"FB 480x16", h:480, t:16 }, { name:"FB 480x18", h:480, t:18 }, { name:"FB 480x20", h:480, t:20 }, { name:"FB 480x22", h:480, t:22 }, { name:"FB 480x25", h:480, t:25 }, { name:"FB 480x28", h:480, t:28 }, { name:"FB 480x30", h:480, t:30 }, { name:"FB 480x35", h:480, t:35 }, { name:"FB 480x40", h:480, t:40 },
  // h=485
  { name:"FB 485x8", h:485, t:8 }, { name:"FB 485x9", h:485, t:9 }, { name:"FB 485x10", h:485, t:10 }, { name:"FB 485x11", h:485, t:11 }, { name:"FB 485x12", h:485, t:12 }, { name:"FB 485x13", h:485, t:13 }, { name:"FB 485x14", h:485, t:14 }, { name:"FB 485x15", h:485, t:15 }, { name:"FB 485x16", h:485, t:16 }, { name:"FB 485x18", h:485, t:18 }, { name:"FB 485x20", h:485, t:20 }, { name:"FB 485x22", h:485, t:22 }, { name:"FB 485x25", h:485, t:25 }, { name:"FB 485x28", h:485, t:28 }, { name:"FB 485x30", h:485, t:30 }, { name:"FB 485x35", h:485, t:35 }, { name:"FB 485x40", h:485, t:40 },
  // h=490
  { name:"FB 490x8", h:490, t:8 }, { name:"FB 490x9", h:490, t:9 }, { name:"FB 490x10", h:490, t:10 }, { name:"FB 490x11", h:490, t:11 }, { name:"FB 490x12", h:490, t:12 }, { name:"FB 490x13", h:490, t:13 }, { name:"FB 490x14", h:490, t:14 }, { name:"FB 490x15", h:490, t:15 }, { name:"FB 490x16", h:490, t:16 }, { name:"FB 490x18", h:490, t:18 }, { name:"FB 490x20", h:490, t:20 }, { name:"FB 490x22", h:490, t:22 }, { name:"FB 490x25", h:490, t:25 }, { name:"FB 490x28", h:490, t:28 }, { name:"FB 490x30", h:490, t:30 }, { name:"FB 490x35", h:490, t:35 }, { name:"FB 490x40", h:490, t:40 },
  // h=495
  { name:"FB 495x8", h:495, t:8 }, { name:"FB 495x9", h:495, t:9 }, { name:"FB 495x10", h:495, t:10 }, { name:"FB 495x11", h:495, t:11 }, { name:"FB 495x12", h:495, t:12 }, { name:"FB 495x13", h:495, t:13 }, { name:"FB 495x14", h:495, t:14 }, { name:"FB 495x15", h:495, t:15 }, { name:"FB 495x16", h:495, t:16 }, { name:"FB 495x18", h:495, t:18 }, { name:"FB 495x20", h:495, t:20 }, { name:"FB 495x22", h:495, t:22 }, { name:"FB 495x25", h:495, t:25 }, { name:"FB 495x28", h:495, t:28 }, { name:"FB 495x30", h:495, t:30 }, { name:"FB 495x35", h:495, t:35 }, { name:"FB 495x40", h:495, t:40 },
  // h=500
  { name:"FB 500x8", h:500, t:8 }, { name:"FB 500x9", h:500, t:9 }, { name:"FB 500x10", h:500, t:10 }, { name:"FB 500x11", h:500, t:11 }, { name:"FB 500x12", h:500, t:12 }, { name:"FB 500x13", h:500, t:13 }, { name:"FB 500x14", h:500, t:14 }, { name:"FB 500x15", h:500, t:15 }, { name:"FB 500x16", h:500, t:16 }, { name:"FB 500x18", h:500, t:18 }, { name:"FB 500x20", h:500, t:20 }, { name:"FB 500x22", h:500, t:22 }, { name:"FB 500x25", h:500, t:25 }, { name:"FB 500x28", h:500, t:28 }, { name:"FB 500x30", h:500, t:30 }, { name:"FB 500x35", h:500, t:35 }, { name:"FB 500x40", h:500, t:40 }
];

// ═══ Section property calculators (SectionPro inlined) ═══
// All dimensions in mm; outputs: area cm², Ixx cm⁴, centroidY cm (from top for L, from heel for HP)

function _calcL(a, b, t) {
  // a = vertical leg (web height), b = horizontal leg (flange), t = thickness
  const aCm = a/10, bCm = b/10, tCm = t/10;
  const area = (aCm + bCm - tCm) * tCm;
  const A1 = aCm * tCm, A2 = (bCm - tCm) * tCm;
  const y1 = aCm/2, y2 = tCm/2;
  const centroidY = (A1*y1 + A2*y2) / area;  // from bottom (heel)
  const Ixx = (tCm*Math.pow(aCm,3))/12 + A1*Math.pow(y1-centroidY,2) +
              ((bCm-tCm)*Math.pow(tCm,3))/12 + A2*Math.pow(y2-centroidY,2);
  return { type:'L', area, centroidY, Ixx, height:aCm, maxWidth:bCm };
}

function _calcFB(h, t) {
  const hCm=h/10, tCm=t/10, area=hCm*tCm;
  return { type:'FB', area, centroidY:hCm/2, Ixx:(tCm*Math.pow(hCm,3))/12, height:hCm, maxWidth:tCm };
}

function _calcHP(b, t) {
  // Look up catalog
  const cat = HP_CATALOG.find(hp => hp.b===b && hp.t===t);
  if (cat) {
    return { type:'HP', area:cat.A, centroidY:cat.dx, Ixx:cat.Ixx, height:cat.b/10, maxWidth:cat.c/10, catalogue:cat };
  }
  return null;
}

// Weight per meter (kg/m) from area (cm²)
function weightPerM(area_cm2) { return area_cm2 * 7.85 / 10; }  // ρ=7850 kg/m³ × area(m²=cm²/10000) × 1m → kg; compact: A_cm2 * 0.785

// ═══ Section modulus with attached plate (combined) ═══
// Returns Z_min in cm³ (the lesser of plate-side and flange-side)
function sectionZWithPlate(profileName, plate_s_mm, plate_t_mm, stiff) {
  // stiff (optional): if provided and stiff.customProfile is set, the custom
  // dims override the catalog lookup. This is the single fix that makes Z
  // come out right for user-entered profiles in inspection panels.
  const pd = getProfileData(profileName, stiff);
  if (!pd) return { Z_min: 0, Z_top: 0, Z_bot: 0, area: 0, weight: 0, profileName };
  
  const pwCm = plate_s_mm/10, ptCm = plate_t_mm/10;
  const pArea = pwCm * ptCm;
  const totalArea = pd.area + pArea;
  
  // Profile centroid measured from bottom of plate (hull side)
  // Plate centroid at ptCm/2; profile placed on top of plate.
  // For L/FB, the heel sits on plate (centroidY measured from heel, so from plate top = centroidY)
  // For HP, dx is measured from toe (bottom of profile), profile sits on plate.
  const plateCY_fromBase = ptCm/2;
  const profCY_fromBase = ptCm + pd.centroidY;  // all profiles: centroidY from heel/toe
  
  const combCY = (pArea*plateCY_fromBase + pd.area*profCY_fromBase) / totalArea;
  
  const totalHeight = ptCm + pd.height;
  
  // Combined Ixx
  const d1 = plateCY_fromBase - combCY;  // plate offset from NA
  const d2 = profCY_fromBase - combCY;   // profile offset from NA
  const pIxx = (pwCm * Math.pow(ptCm,3)) / 12;
  const combIxx = pd.Ixx + pd.area*d2*d2 + pIxx + pArea*d1*d1;
  
  // Distance to extreme fibers
  const y_top = totalHeight - combCY;  // from NA to top (flange side)
  const y_bot = combCY;                // from NA to bottom (plate outside)
  
  const Z_top = combIxx / y_top;  // cm³
  const Z_bot = combIxx / y_bot;  // cm³
  
  return {
    profileName, Z_min: Math.min(Z_top, Z_bot), Z_top, Z_bot,
    area: totalArea, Ixx: combIxx, NA_from_base: combCY,
    weight: weightPerM(totalArea)
  };
}

// Get profile data from any catalog by name, OR from a stiff's customProfile.
// stiff (optional): if provided and stiff.customProfile is set, use the
// custom dims directly — name lookup is skipped.
function getProfileData(name, stiff) {
  // CUSTOM PROFILE BRANCH — overrides any catalog lookup
  if (stiff && stiff.customProfile) {
    const cp = stiff.customProfile;
    const d  = cp.dims || {};
    if (cp.type === 'L')  return _calcL(d.a||0, d.b||0, d.t||0);
    if (cp.type === 'FB') return _calcFB(d.h||0, d.t||0);
    if (cp.type === 'T' && typeof _calcT === 'function')
      return _calcT(d.h||0, d.tw||0, d.bf||0, d.tf||0);
    if (cp.type === 'HP') {
      const cat = HP_CATALOG.find(p => p.b===(d.b||0) && p.t===(d.t||0));
      if (cat) return _calcHP(cat.b, cat.t);
      return _calcFB(d.b||0, d.t||0);   // fallback
    }
  }
  if (!name) return null;
  const L = L_CATALOG.find(p => p.name === name);
  if (L) return _calcL(L.a, L.b, L.t);
  const HP = HP_CATALOG.find(p => p.name === name);
  if (HP) return _calcHP(HP.b, HP.t);
  const FB = FB_CATALOG.find(p => p.name === name);
  if (FB) return _calcFB(FB.h, FB.t);
  return null;
}

// Profile slenderness check (LR Table 1.6.1 Note 1)
// stiff (optional): if provided and stiff.customProfile is set, use its
// dimensions directly — supports user-entered profiles outside catalogs.
function checkProfileSlenderness(name, kL, stiff) {
  const limit_LHP = 60 * Math.sqrt(kL);
  const limit_FB_cont = 18 * Math.sqrt(kL);

  if (stiff && stiff.customProfile) {
    const cp = stiff.customProfile;
    const d  = cp.dims || {};
    if (cp.type === 'L') {
      const dw_t = (d.a||0) / (d.t||1);
      return { ratio: dw_t, limit: limit_LHP, ok: dw_t <= limit_LHP, type:'L' };
    }
    if (cp.type === 'HP') {
      const dw_t = (d.b||0) / (d.t||1);
      return { ratio: dw_t, limit: limit_LHP, ok: dw_t <= limit_LHP, type:'HP' };
    }
    if (cp.type === 'FB') {
      const dw_t = (d.h||0) / (d.t||1);
      return { ratio: dw_t, limit: limit_FB_cont, ok: dw_t <= limit_FB_cont, type:'FB' };
    }
    if (cp.type === 'T') {
      const dw_t = (d.h||0) / (d.tw||1);
      return { ratio: dw_t, limit: limit_LHP, ok: dw_t <= limit_LHP, type:'T' };
    }
  }
  
  const L = L_CATALOG.find(p => p.name === name);
  if (L) {
    const dw_t = L.a / L.t;
    return { ratio: dw_t, limit: limit_LHP, ok: dw_t <= limit_LHP, type:'L' };
  }
  const HP = HP_CATALOG.find(p => p.name === name);
  if (HP) {
    const dw_t = HP.b / HP.t;
    return { ratio: dw_t, limit: limit_LHP, ok: dw_t <= limit_LHP, type:'HP' };
  }
  const FB = FB_CATALOG.find(p => p.name === name);
  if (FB) {
    const dw_t = FB.h / FB.t;
    return { ratio: dw_t, limit: limit_FB_cont, ok: dw_t <= limit_FB_cont, type:'FB' };
  }
  return { ratio:0, limit:0, ok:false, type:'?' };
}

// Auto-select best profile (lightest compliant) for given Z_req, s, t, preferring a type
function autoSelectProfile(Z_req, s_mm, t_plate_mm, preferType, kL) {
  const candidates = [];
  
  // Add profiles based on preference
  if (preferType === 'L' || preferType === 'any') {
    L_CATALOG.forEach(p => candidates.push(p.name));
  }
  if (preferType === 'HP' || preferType === 'any') {
    HP_CATALOG.forEach(p => candidates.push(p.name));
  }
  if (preferType === 'FB' || preferType === 'any') {
    FB_CATALOG.forEach(p => candidates.push(p.name));
  }
  
  // Compute Z and weight; keep only LR-compliant
  const results = candidates.map(name => {
    const r = sectionZWithPlate(name, s_mm, t_plate_mm);
    const sl = checkProfileSlenderness(name, kL);
    return { name, Z: r.Z_min, weight: r.weight, slenderOK: sl.ok, dw_t: sl.ratio };
  });
  
  // Filter: Z >= Z_req AND slenderness OK
  const viable = results.filter(r => r.Z >= Z_req && r.slenderOK);
  
  if (viable.length === 0) {
    // Return smallest over-slender but Z-sufficient, or the largest
    const anyZ = results.filter(r => r.Z >= Z_req).sort((a,b) => a.weight - b.weight);
    if (anyZ.length > 0) return { ...anyZ[0], warning:'Slenderness FAIL' };
    const biggest = results.sort((a,b) => b.Z - a.Z)[0];
    return { ...biggest, warning:'Z insufficient' };
  }
  
  // Return lightest viable
  viable.sort((a,b) => a.weight - b.weight);
  return viable[0];
}

// ==================== NAVIGATION ====================
function goToPage(n) {
  // Scantling page (2) is hidden — all its inputs remain in the DOM as the
  // source of truth for calc*() functions, but we don't show the UI anymore.
  // If anything tries to navigate there, go straight to Geometry instead.
  if (n === 2) n = 3;
  document.querySelectorAll('.ea-page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.ea-wizard-step').forEach((s, i) => {
    s.classList.remove('active', 'completed');
    if (i < n - 1) s.classList.add('completed');
    if (i === n - 1) s.classList.add('active');
  });
  document.querySelectorAll('.ea-wizard-line').forEach((l, i) => { l.classList.toggle('completed', i < n - 1); });
  document.getElementById('page-' + n).classList.add('active');
  // Lock/unlock viewport scroll for Geometry page (page-3). Prevents the whole
  // page from drifting downward when the Profile Editor updates its selection.
  document.body.classList.toggle('geometry-active', n === 3);
  if (n !== 3) {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  if (n === 2 || n === 4) recalcAll();
  if (n === 3) {
    // Geometry page: ensure scantling is recalculated, then init drawing, then sync
    recalcAll();
    if (window.Draw && typeof window.Draw.init === 'function') {
      // Give DOM a tick for display:block transitions
      setTimeout(() => {
        window.Draw.init();
        if (window.Bridge) window.Bridge.syncFromScantling();
        // Install SVG icons for top-bar buttons (run analysis + resync)
        if (window.icon) {
          const rai = document.getElementById('runAnalysisIcon');
          if (rai && !rai.innerHTML.includes('svg')) rai.innerHTML = window.icon('beaker', '13px');
          const ris = document.getElementById('reloadIconSlot');
          if (ris && !ris.innerHTML.includes('svg')) ris.innerHTML = window.icon('reload', '13px');
        }
        // Initialize undo/redo manager. (Project state snapshot has been
        // removed — fresh seeds run on first visit.)
        setTimeout(() => {
          if (window.HistoryManager && typeof window.HistoryManager.init === 'function') {
            try { window.HistoryManager.init(); } catch (e) { console.warn('HistoryManager init failed:', e); }
          }
        }, 200);
      }, 50);
    }
  }
}


