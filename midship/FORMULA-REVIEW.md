# Formula review — LR Pt 4 Ch 1 / Pt 3 Ch 4

Checked against the rule text and **equation images** in
`Apps/ClauseFinder/data/lr-ships-2026` (LR Rules for Ships, July 2026).
Every formula below was read from the rendered PNG at 4–7× magnification, not
from the `formula-text` fallback — that fallback is wrong often enough to matter
(it drops `f_1` from one bottom-plating equation and flips the sign in
`F_1 = D_2c_1/(25D_2 − 20h_5)`).

Numeric checks were done by re-implementing each formula independently from the
images and diffing against the live app with the Baltic Laker particulars
(L=192, B=23,76, D=15,3, T=10,5, C_b=0,881, AH36 k=k_L=0,72, F_B=0,8, F_D=1,0,
l_e=1,452).

---

## Status

Two passes. The first covered the scantling formulas (Pt 4 Ch 1 Sec 5/6/8.4/9,
Pt 3 Ch 4 Sec 5) — findings 1–5. The second covered everything the first left
out: `computeSectionProperties`, the profile catalogues, the buckling module
(Pt 3 Ch 4 Sec 7), `calcDB` (Sec 8.3/8.5) and the exports — findings 6–10.

**All ten findings are fixed in `app/`.** Each entry keeps the original
diagnosis and adds what was changed. Verified after the fixes: every module
parses, the app boots clean, and all of `calcBottomPlate` / `calcSidePlate` /
`calcBottomLong` / `calcIBPlate` / `calcSideLong` / `calcSideGroups` /
`calcInnerSide` / `calcDB` / `calcWeight` / `runLongStrengthAnalysis` plus every
analysis panel and the summary page run without throwing.

Because of these fixes `app/` is now **ahead of** the original
`20-Midship Scantling/Index/v1.1/Index.html`, which still has all five. The
extracted app is the version to use.

---

## Findings

### 1. `l_e` is not floored at 1,5 m for bottom and side longitudinals — Z_req is 6,7 % low

Table 1.6.1 redefines the symbol for its own formulas:

> `l_e` = as defined in 1.5.1, **but is not to be taken less than 1,5 m** except in
> way of the centre girder brackets required by 8.5.3, where a minimum span of
> 1,25 m may be used.

The app floors `l_e` at 1,5 m for upper-deck longitudinals, lower-deck
longitudinals and coaming stiffeners (`60-scantling-rules.js:1122, 1275, 1314`)
but **not** for the two biggest groups:

| Where | Line | Code |
| --- | --- | --- |
| `calcBottomLongCore` — Table 1.6.1 (3) | `60-scantling-rules.js:638` | `const le2 = Math.pow(p.le, 2);` |
| `calcSideLong` — Table 1.6.1 (1)(a) | `60-scantling-rules.js:2254` | `... * Math.pow(p.le,2) * F1 * Fs` |
| `calcSideLong` — Table 1.6.1 (1)(b) | `60-scantling-rules.js:2260` | `... * Math.pow(p.le,2) * F1_base` |

The default `l_e` is **1,452 m**, below the floor, so this bites on the shipped
configuration. Since Z ∝ l_e², the shortfall is (1,5/1,452)² − 1 = **6,72 %**.

Measured on the live app, bottom longitudinal:

```
app Z_a                98,939 cm³      (my independent re-implementation: 98,939 — exact match)
with the 1,5 m floor  105,588 cm³
shortfall               6,72 %
```

Every side longitudinal carries the same 6,72 % shortfall. This propagates into
the profile optimisers, which size sections against these Z_req values.

**Fixed.** `calcBottomLongCore` and `calcSideLong` now derive `le_eff =
Math.max(p.le, 1.5)` once and use it for both `l_e²` and `γ(l_e1)`. The Sec 9
deep-tank terms in the same functions deliberately keep the raw `p.le` —
Table 1.9.1 has no such floor. `calcBottomLongCore` now also returns `le`, and
the three inspector panels that printed `p.le` (bottom long, IB long, side long)
show the value the formula actually used, so the panel and the result agree.

Measured after the fix: bottom `Z_a` 98,939 → **105,588 cm³**, side
longitudinal at z=2375 `Z_req` 80,127 → **85,512 cm³** — the predicted +6,72 %.
The rule-check summary still reads 20 OK / 2 FAIL; the extra margin is absorbed
by the profiles already selected.

### 2. `F_1` divides by zero when a side longitudinal sits above D₂

`F1calc` (`60-scantling-rules.js:560`) implements Table 1.6.1 faithfully:

```js
if (aboveMid) F1_raw = D2*c1/(4*D2 + 20*h5);
else          F1_raw = D2*c1/(25*D2 - 20*h5);
```

but `calcSideLong` computes `h5 = D2 - z` with no lower clamp. `h_5` is defined
as a *vertical distance from the longitudinal to the deck at depth D₂*, so the
rule never contemplates a negative value; the app produces one whenever a
longitudinal sits above D₂ = min(D, 1,6T), i.e. whenever **D > 1,6T**.

At `h_5 = −0,2·D₂` the denominator `4D₂ + 20h₅` is exactly zero → `F_1 = Infinity`
→ `Z_req = Infinity` → no profile in the catalogue can ever pass. That happens at
**D/T = 1,92**, which is reachable (a 24 m depth / 12,5 m draught box shape). Past
that point the denominator goes negative, `F_1` clamps to 0,14 and the answer is
silently too small instead.

Not triggered by the current ship (D₂ = D = 15,3 m, highest side longitudinal at
14,7 m, so h₅ ≥ 0,6 m throughout), but it is a live trap for other hull forms.

**Fixed.** `calcSideLong` now clamps `h5 = Math.max(D2 - z, 0)`. No side
longitudinal returns a non-finite `Z_req` for any hull form.

### 3. Table 1.5.3 region boundary uses D₂/2 where the rule says D/2

Table 1.5.3 splits side-shell plating at *"Above **D/2** from base"* and
*"Between upper turn of bilge and **D/2** from base"* — plain `D`. Section 5's
symbol list does not define D₂ at all; D₂ = min(D, 1,6T) is a Section 6 symbol.

`calcSidePlate` (`60-scantling-rules.js:2028`) uses `z_mid_m = D2 / 2`.

Since D₂ ≤ D, the boundary sits too low and strakes between D₂/2 and D/2 are
sized with region (a) — F_D and h_T1 — instead of the interpolated region (c).
Whether that is conservative depends on F_D vs F_B; for this ship it happens to
be (region a gives 15,02 mm vs 13,44 mm), but that is luck, not design.

**Fixed.** `z_mid_m = p.D / 2`, and the now-unused `D2` local was removed from
`calcSidePlate`. No effect on the current ship (D = 15,3 < 1,6T = 16,8, so
D₂ = D and the boundary is unchanged at 7,65 m) — the fix matters for shallower
draughts.

### 4. `f` uses `l_e` instead of `S` in the inner-side deep-tank plating

Table 1.9.1: `f = 1,1 − s/(2500·S)`, not greater than 1,0, where per 1.5.1
**`S` = spacing or mean spacing of primary members, in metres** — a different
symbol from `l_e`, the effective *span* of the stiffener.

`calcInnerSide` (`60-scantling-rules.js:2487`):

```js
const f = Math.min(1.0, 1.1 - s_is/(2500 * p.le));
```

The module already has the correct helper `_f(s_mm, S_m)` at line 1021 and uses
it elsewhere. Numerically the two are close here because the UI labels `l_e` as
"web frame", but they diverge as soon as `withLocalLe()` shortens `l_e` for a
bracketed end — which changes the *plate* thickness, which brackets should not do.

**Fixed.** All four sites that computed this `f` from `p.le` now use
`p.le_global` (the value typed in the field, before any per-stiffener bracket
override) via the existing `_f` helper: `calcInnerSide`, the two deep-tank
branches of `calcLowerDeckPlate`, the inner-side plate optimiser in
`31-optimize-plates.js`, and the matching inspector panel in `50-analysis.js`.
Numbers are unchanged for the default setup; a bracket override no longer moves
plate thickness.

If the web-frame spacing ever differs from the longitudinals' `l_e`, `S` needs
its own input — right now the two share the `l_e` field.

### 5. Reported longitudinal weight was `Infinity` whenever the drawing was initialised

Found while re-checking the summary page after the fixes above, then confirmed
**pre-existing** by running the identical sequence against the original
single-file build — it produces the same `Infinity`.

`calcSideLong` builds its live longitudinal list from `Draw.profiles.sideShell`
as `{ z, s }` — with **no `n`**. `DEFAULT_SIDE_LONGS`, the cold-start fallback,
does carry `n`. So before the drawing initialises everything looks fine, and the
moment it does (i.e. in normal use):

- `if (L.n <= 3) grp = 'G1' … else grp = 'G5'` put **every** longitudinal in G5;
- `calcSideGroups` filtered its bands with `g.longs.includes(l.n)` and matched
  nothing, so `Math.max(...[])` returned **−Infinity** for `Z_max` and `s_max`;
- `sectionZWithPlate(name, −Infinity, …)` returned `Z_sec` and `weight` of
  `Infinity`, which propagated into `calcWeight()` and onto the Summary page as
  **"LONG WEIGHT Infinity ton"** and "GRAND TOTAL Infinity ton steel".

A second defect sat behind it: the bands were hardcoded to ordinals 1..18 (the
length of `DEFAULT_SIDE_LONGS`), so even with `n` present, longitudinals 19 and
up in a real 31–43 long layout belonged to no band at all.

**Fixed.** Live entries now carry `n` (1-based, bottom-up). The five bands are
built from the actual longitudinal count by two shared helpers, `_sideBands()`
and `_sideBandOf()`, which both `calcSideLong` (display label) and
`calcSideGroups` (profile pick) go through, so they cannot drift apart again.
An empty band now reports zeros instead of `−Infinity`.

After the fix: all five bands populated, every `kg` finite, and the Summary page
reads "LONG WEIGHT 1221 ton / GRAND TOTAL 3549 ton" with no `Infinity` or `NaN`
anywhere on the page.

---

## Assumptions worth surfacing (not defects)

- **`ω₁ = ω₂ = 1,0` hardcoded** in every Table 1.9.1 (2) modulus
  (`60-scantling-rules.js:2269, 2510`, `calcSideLong`). Table 1.9.3 gives ω = 1,0
  for bracketed and bracketless connections to a longitudinal member, but **ω = 0**
  for *"end of stiffeners unattached or attached to plating only"*. With ω = 0 the
  denominator halves and Z_req **doubles**. Fine as a default for continuous
  longitudinals; wrong for sniped ends, and there is no way to say so in the UI.
- **`γ = 1,4` hardcoded** in the same formulas. Table 1.9.1 gives 1,4 for rolled
  or built sections but **1,6 for flat bars**. Using 1,4 for an FB over-estimates
  Z_req by 14 % — conservative, so harmless, but it means an FB is penalised.
- **F_B/F_D floors.** `applyComputedFfactors` writes the *longitudinal* floor
  (0,75) into the single F_B/F_D pair, which the plating formulas then reuse
  although Sec 5.7.2 allows 0,67 for plating. Conservative in both plating terms
  (larger F_B thickens via `√(F_B/k_L)` and via `1/(1,8 − F_B)`), so this is a
  safe simplification of the single-input design — worth a tooltip.
- **`h_4` carries a 0,5 m practical floor** (`_LR_h4`) that is not in the rule.
  Documented in the code; conservative.
- **`f = 1,0` in the 8.4.4 deep-tank branch** of `calcIBPlate`. Since Table 1.9.1
  caps f at 1,0, this is the conservative end. Documented in the code.

---

## Verified correct

Independently re-derived from the equation images and matched against the app.

**Pt 4 Ch 1 Sec 5 — plating**

- `s₁ = max(s, min(470 + L/0,6, 700))` — "not less than the smaller of" ✓
- Bottom (1)(a) `t = 0,001·s₁·(0,043L₁+10)·√(F_B/k_L)` ✓ — app 13,5985 = mine 13,5985
- Bottom (1)(b) `t = 0,0052·s₁·√(h_T2·k/(1,8−F_B))` ✓ — app 11,1202 = mine 11,1202
  (no `f_1` in this equation; the text fallback that shows one is wrong)
- `h_T1 = T + C_w ≤ 1,36T`, `h_T2 = T + 0,5C_w ≤ 1,2T` ✓
- `f_1 = 1/(1 + (s/1000S)²)` ✓
- Side (a)(i)/(a)(ii)/(b)(i)/(b)(ii) and the (c) interpolation ✓ — all six strakes match
- `C_w = 7,71·10⁻²·L·e^(−0,0044L)`, floored at 6,446 for L > 227 via the L≤227 clamp ✓

**Pt 4 Ch 1 Sec 6 — longitudinals**

- Side (1)(a) `Z = 0,056·s·k·h_T1·l_e²·F_1·F_S` ✓
- Side (1)(b) = (3)(a) at the baseline, and the rule's *lesser of* ✓
- Bottom (3)(a) `Z = γ·s·k·h_T2·l_e²·F_1` ✓
- Bottom (3)(b) `Z = γ·s·k·h_T3·l_e²·F_1·F_sb`, `h_T3 = h_4 − 0,25T` ✓
- `c_1`: 75/(225−150F_B) at baseline, 1,0 at D₂/2, 60/(225−165F_D) at deck, interpolated ✓
- `F_1 = D₂c₁/(4D₂+20h₅)` above D₂/2, `D₂c₁/(25D₂−20h₅)` below and for bottom, floor 0,14 ✓
- `h₅ = D₂ − z`, `h₆ = |z − T|`, `D₂ = min(D, 1,6T)`, `D₁ = clamp(D₂, 10, 16)` ✓
- `h_T1` above WL `= max(C_w(1−h₆/(D₂−T)), max(L₁/70, 1,20))·F_λ`; below WL
  `= [h₆ + C_w(1−h₆/2T)]·F_λ`; capped at `0,86(h₅+D₁/8)` / `(h₅+D₁/8)` ✓
- `F_s = (1,1/k)[1 − 2(b_f1/b_f)(1−k)]`, `F_sb = 0,5(1+F_s@0,6D₂)` ✓
  (the Apr-2026 comment is right — an earlier revision used F₁ here, which is a
  different quantity entirely)
- `γ = 0,002·l_e1 + 0,046`, `l_e1` clamped to [2,5; 5,0] ✓
- `F_λ = 1,0` for L ≤ 200 ✓
- Web slenderness `d_w/t ≤ 60√k_L` (rolled/built), `18√k_L` / `15√k_L` (FB
  continuous / non-continuous) — `checkWebMin` ✓

All 43 side longitudinals matched my independent implementation to within 0,01 cm³.

**Pt 4 Ch 1 Sec 8 / Sec 9**

- 8.4.1 `t = 0,00136(s+660)·⁴√(k²LT)`, minima 6,5 / 7,5 mm, 8.4.2 +2 mm ✓
- 9.2.1 (1) `t = 0,004·s·f·√(ρh₄k/1,025) + 2,5` ✓
- 9.2.1 (2) `Z = ρ·s·k·h₄·l_e²/(22γ(ω₁+ω₂+2))` ✓ (the symbol is h₄, not "h_d")
- `f = 1,1 − s/(2500S) ≤ 1,0` ✓ (but see finding 4 for which S is passed)
- `h₄` = distance from the reference point to the top of the tank **or half the
  distance to the top of the overflow, whichever is greater** ✓

**Pt 3 Ch 4 Sec 5 — hull girder**

- `C₁` table, all four length bands ✓
- `M_wo = 0,1·C₁·C₂·L²·B·(C_b+0,7)`, `C_b ≥ 0,60`, `C₂ = 1` amidships ✓
- `f₂ = −1,1` sagging, `1,9C_b/(C_b+0,7)` hogging ✓
- `Z_min = f₁·k_L·C₁·L²·B·(C_b+0,7)·10⁻⁶`, `f₁ ≥ 0,5` ✓
- `I_min` (a) `3L|M̄_s+M_w|/(k_L σ)·10⁻⁵` with σ = 175/k_L — the k_L cancellation
  in the code is algebraically right ✓; (b) `3C₁L³B(C_b+0,7)·10⁻⁸` for L ≥ 90 ✓
- `σ = 175/k_L` amidships, the outside-0,4L form, `F_D = σ_D/σ`, `F_B = σ_B/σ` ✓

---

---

# Second pass — the areas the first pass left out

Covers `computeSectionProperties`, the profile catalogues, `21-buckling.js`
(Pt 3 Ch 4 Sec 7), `calcDB` (Pt 4 Ch 1 Sec 8.3/8.5), the FSICR module and the
exports. **All five findings below are fixed in `app/`.**

### 6. HP 120x8 catalogue values were wrong — section modulus 5,5 % overstated

The row read `A:11.72, dx:6.96, Ixx:165`. Rather than trust a remembered EN 10067
table, I checked the catalogue against **itself**: inside a b-group, `I/(A·b²)`
must fall and `dx/b` must rise as `t` increases, and `ΔA/Δt` is near-constant.
HP 120x8 reversed all three, and it was the **only outlier in all 59 entries**:

```
I/(A·b²)   0,0842 → 0,0824 → 0,0978   (must decrease)
dx/b       0,540  → 0,550  → 0,580    (step 0,010 then 0,030)
ΔA/Δt      1,46   → 1,02             (constant elsewhere)
```

The trend gives A ≈ 12,15, dx ≈ 6,72, Ixx ≈ 142 — which agrees with EN 10067
(9,54 kg/m → 12,15 cm²). Effect: section modulus with attached plate **66,93 →
63,43 cm³ (5,5 % overstated, non-conservative)** and weight 3,8 % understated.

**Fixed** in `20-profile.js` with the reasoning in a comment. Not currently
assigned to any stiffener in this model (it only reached the group suggestions),
so no live number moved — but the optimiser could have picked it at any time.
**Confirm the three values against your own EN 10067 table before relying on it.**

### 7. The HP catalogue existed twice and had already drifted

`20-profile.js` (inside the `Profile` IIFE, 59 entries) and
`22-variants-materials.js` (global, **54 entries** — the whole HP 430 series
missing). Both carried the bad HP 120x8 row.

The bare identifier `HP_CATALOG` resolves to the *global* 54-entry copy, so
`60-scantling-rules.js` (optimiser candidate list), `80-export.js` (Excel type
detection) and `90-custom-profile.js` could never see an HP 430, while
`computeSectionProperties` — which reads `Profile.HP_CATALOG` — could.

**Fixed:** the literal in `22-variants-materials.js` is replaced by
`const HP_CATALOG = window.Profile.HP_CATALOG;`. One source of truth; verified
in the browser that the two identifiers are now the same array object.

### 8. Buckling used β = 1,1 for web buckling, where Sec 7.5.1 says β = 1,0

7.5.1: *"β = 1 for plating **and for web plating of longitudinals (local
buckling)**; β = 1,1 for longitudinals."*

`checkLong` picked the governing mode as the one with the lowest σ_CRB and then
applied β = 1,1 to it, whichever mode it was. Two consequences: UC overstated by
10 % whenever web buckling governed, and — because the β values differ by mode —
the *wrong* mode could be named governing.

Measured before the fix: a Tee 400x7 + 120x14 reported `web, UC 0,652`; correct
is `web, UC 0,592`. A Tee 300x8 + 100x12 reported `web` when `torsional` actually
governs on a β-weighted basis.

**Fixed:** each mode carries its own β, and the governing mode is the one with
the highest `β·σ_A/σ_CRB`. Conservative direction either way, so nothing became
unsafe — but the buckling optimiser was over-sizing webs. Flat bars are exempt
from web buckling, and this model is all-FB, so no live number moved.

### 9. Bilge arc centroid was the mid-angle, and its self-inertia was zero

`computeSectionProperties` placed the bilge strake at `R(1 − cos θ_mid)` and gave
it `Iself = 0`. For an arc the centroid is `R[1 − (sin θ₁ − sin θ₀)/Δθ]`; over a
full quarter that is 0,363·R, not the 0,293·R the mid-angle gives — **122 mm low**
here — and the arc's own inertia is ≈ 0,149·t·R³, not zero. The area also used the
strake width rather than the arc length it actually subtends.

Effect on the hull girder: NA 25,9 mm low, I_NA 0,5 % high, **Z_B 0,89 % high**
(non-conservative), Z_D 0,21 % high.

**Fixed** with the exact closed-form arc centroid and self-inertia. Measured
after: NA 6667,5 → 6671,3 mm, Z_B 12,608 → 12,498 m³, Z_D 9,738 → 9,663 m³.
Both hull-girder checks still pass (Z_B 1,302, Z_D 1,012).

### 10. The Sec 8.3.2 d_DB relaxation was applied to every Sec 8 member

Sec 8 defines `d_DB` as the **Rule** depth of the centre girder (with `d_DBA` as
the separate symbol for the actual depth), i.e. the greater of 8.3.1 (a), (b) and
(c). 8.3.2 then adds an explicit, narrowly-worded relaxation for the **centre
girder thickness only**: *"The thickness may be determined using the value for
d_DB without applying the minimum depths specified in 8.3.1.(b) and 8.3.1.(c)."*

`calcDB` set `dDB_for_thickness = dDB_a` once and used it for 8.3.5 (side
girder), 8.3.8 (duct keel), 8.5.1/8.5.2 (floors) and 8.5.3 (brackets) as well —
making all of them thinner than required whenever (b) or (c) governs the depth
(beamy shallow ships, roughly B ≳ 9,3·√T).

**Fixed:** the relaxation is now scoped to 8.3.2; everything else takes the Rule
depth. Formula (a) governs for this ship (1330 vs 1188 vs 760), so no number
moved. The row notes that claimed "formula (a) permitted" were corrected too.

---

## Verified correct in the second pass

- **Table 4.7.1 corrosion** `d_t`: (a)/(b) 0,05t 0,5–1; (c)/(d) 0,10t 2–3;
  (e) 0,15t 2–4 ✓ including the grouping
- **Table 4.7.2**: (a) `σ_E = 3,6E(t_p/s)²`; (b) `0,9c[1+(s/1000S)²]²E(t_p/s)²`
  with c = 1,3/1,21/1,10/1,05; (c) `τ_E = 3,6[1,335+(s/1000S)²]E(t_p/s)²` ✓
  (all three read from the equation images at 5×)
- **Johnson correction** σ_CRB / τ_CRB, with τ_o = σ_o/√3 ✓; E = 206 000 ✓
- **Table 4.7.3**: column `0,001E·I_a/(A_t S²)`; torsional
  `(0,001E·I_w/(I_p S²))(m²+K/m²) + 0,385E·I_t/I_p`; web `3,8E(t_w/d_w)²` ✓
- `I_t`, `I_p`, `I_w` for flat bars / Tees / angles-bulbs — all six closed forms ✓
- `C`, `K = 1,03CS⁴/(EI_w)·10⁴`, `k_p = 1−η_p` (≥0, ≥0,1 for non-FB),
  `η_p = σ_A/σ_Ep`, and the `m` selection `(m−1)²m² < K ≤ m²(m+1)²` ✓
- `σ_A = σ_D(z/z_D)` above NA, `σ_B(z/z_B)` below, min 30/k_L; `τ_A = 110/k_L` ✓
- Flange proportions b_f/t ≤ 15 (angles) / ≤ 30 (Tees) ✓
- **Sec 8.3.1** `d_DB = max(28B+205√T, min(50B,2000), 760)` ✓; **8.3.2**
  `(0,008d+4)√k` min 6,0 ✓; **8.3.5** `(0,0075d+1)√k` ✓; **8.3.8** `(0,008d+2)√k` ✓;
  **8.5.1** `(0,009d+1)√k` min 6 max 15 ✓; **8.5.2** greater of `(0,008d+3)√k` and
  `(0,009d+1)√k`, cap 15 ✓; **8.5.3** bracket `0,009·d_DB` (no √k) ✓;
  **8.5.7** bracket breadth ¾ of the *actual* centre girder depth ✓
- **FB catalogue** (1445 entries): `A = h·t`, `I = t·h³/12`, centroid `h/2` —
  computed, not tabulated, and exact in every entry ✓
- **L catalogue** (28 entries): `A = (a+b−t)·t` and the centroid/inertia match a
  first-principles two-rectangle decomposition exactly (checked L 75x50x6:
  A 714 mm², ȳ 24,74 mm, I 40,977 cm⁴) ✓
- **`cz` orientation handling** in `_resolveProfilePropsFromCatalog`: for HP the
  plate sits at the flat end so `cz = dx`; for L/T the catalogue centroid is
  measured from the heel so `cz = height − centroidY` puts the flange at the free
  end. Both correct — verified by re-deriving the L centroid in both orientations ✓
- Stiffener attachment offsets: bottom `+cz`, inner bottom `−cz`, side/inner side
  at the plate's own z (no offset — correct for a vertical plate) ✓
- **Excel export** contains no formulas of its own: it calls
  `computeSectionProperties()`, `runLongStrengthAnalysis()` and `calcWeight()` and
  otherwise reads state, so it cannot drift from the screen. Ran it with
  `XLSX.writeFile` stubbed: 6 sheets, 4816 cells, **zero** non-finite values ✓

## Still not verified

- **The FSICR ice engine.** LR Pt 8 Ch 2 Sec 6.1.1 says its requirements apply
  *"in addition to the requirements of the Finnish-Swedish Ice Class Rules"* — LR
  references the FSICR rather than reproducing it, and a corpus-wide search of
  ClauseFinder finds neither the 5,6 MPa nominal pressure nor the `c_a` formula.
  The module's cited source (`A3098_ice_scantling_v2_1_.html`) is not in this
  repo either. The values in it (ice-belt and frame extents per class, h₀/h,
  c₁ = 1,0/0,85/0,70/0,50, p₀ = 5,6 MPa, `c_a = (47−5l_a)/44` clamped to
  [0,6; 1,0], `c_d` from `k = √(ΔP)/1000`, P₀ minima 2800/1000 kW) look like the
  standard FSICR values, but I could not check them against a source on this
  machine. **To verify this, put the FSICR / TRAFICOM ice class regulation where
  I can read it.**
- PDF export layout and DXF geometry output (the Excel path was checked; these
  two were not).
- `Bridge`, the history manager, and the compartment/transverse geometry helpers
  — plumbing rather than rule formulas.
