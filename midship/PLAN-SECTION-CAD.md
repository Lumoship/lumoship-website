# MidshipScantling — MARS benzeri akış: gereksinim listesi ve adım planı (18.09.2026)

Kaynak: kullanıcı talimatı (18.09.2026) + `REVIEW-MARS-FLOW.md`. Kural seti: **önce LR** (Pt 3 / Pt 4); DNV/BV sonra.

## A. Gereksinimler (kullanıcının söylediği, madde madde)

### A1. Section (adım 2) — yalnız geometri, CAD gibi
1. Bu sayfada **sadece kesit çizgileri** görünür: shell, inner bottom, inner side, güverteler, girder'lar. Strake kalınlığı, profil, renk kodu **görünmez** (nötr tek renk). Amaç: boyutlara karar vermek.
2. Sağ panel: **Ship Geometry** (parametrik girişler) kalır; **Elements** bloğu kaldırılır.
3. Ship Geometry'nin altında **Add panel** bölümü: side girder, centre girder, stringer, tween deck, longitudinal bulkhead … gibi hazır paneller eklenir.
4. Çizim alanı **AutoCAD gibi** çalışır: çizgi çiz, çizgi sil, tıkla‑seç, sıfırdan çiz. Her çizgi node'larla birbirine bağlanır (snap). **Yay / radius** çizilebilir (her gemide bilge var).
5. Hızlı kesit çıkarma: parametrik üretici başlangıç kolaylığı, sonrası serbest çizim.
6. Panel başına **bending efficiency %** ve **shear efficiency %** (MARS gibi) — hull girder katkısı.
7. Panel başına **watertight / non‑watertight** seçimi — panele tıklayınca sade bir arayüzle.

### A2. Positions (adım 3) — yalnız isimlendirme
8. Side girder ekleme vb. **burada yok** (Section'a taşındı).
9. Panellere **pozisyon adı** verilir: shell, bottom, bilge, side shell, inner bottom, inner side, side girder, centre girder, stringer, tween deck, upper deck, hatch coaming, longitudinal bulkhead … Liste yoksa kullanıcı verecek.
10. Sağ tarafta **panel listesi + yanında pozisyon adı** seçici.
11. Panel tanımı: **iki node arasındaki her çizgi bir panel**. Section'da istenen yere node eklenebilir (çizgiyi böler) — sadece farklı pozisyon adı verebilmek için.

### A3. Strakes (adım 4)
12. Panel seçilir → o panele strake atanır. Bir panel **birden çok strake**'e bölünebilir (ör. 10 m panel, 5 strake); her strake'in **uzunluğu** ve **kalınlığı** ayrı girilir.
13. Strake **malzeme kalitesi** seçilebilir: A, AH32, AH36, DH36 …

### A4. Stiffeners (adım 5)
14. Her panelin üstüne stiffener; **panel panel** ekleme.
15. **Span**: sayfaya girince herkes için tek **otomatik/varsayılan span**; grup grup veya tek tek değiştirilebilir.
16. Yön: **boyuna (longitudinal)** veya **enine (transverse)**.
17. Tip: **L, T, HP (bulb), FB**.
18. **Grup tanımı**: başlangıç node'u + o node'dan **offset** (ör. 600 mm), **spacing** (600), **adet** (4). İkinci grup: **en yakın node**'dan başlar, kendi offset/spacing/adedi (500 / 400 / 6).
19. **Sığma kontrolü**: adet × spacing panel boyunu aşarsa "otomatik yerleştiremiyorum" ya da "N tanesini koydum, kalanı sığmadı" mesajı.
20. Stiffener **malzeme kalitesi** seçilebilir (A, AH32, AH36 …).

### A5. Compartments (yeni sayfa — adım 6)
21. Tank / mahal tanımı: ballast tank, cargo hold, void, fuel oil, fresh water …
22. Kural girdileri: **density**, **hava firar (air pipe) yüksekliği**, basınç isterleri → **ClauseFinder / LR** kurallarından; kompartıman tipi → hangi basınç formülü.

### A6. Deck loads (yeni sayfa — adım 7)
23. Bazı güverte panellerine deck load; LR kural değerleri ClauseFinder'dan, kullanıcı ezebilir.

### A7. Genel
24. Kurallar: **LR** ile tamamlanır; DNV/BV sonraya.
25. Adım adım ilerlenir; her adım bitince bir sonrakine geçilir.

## B. Veri modeli (yeni çekirdek)

```js
SECTION  = { id:'MS', name:'Midship', xRef_m:null, half:true }
NODES    = [{ id:'N1', y:0, z:0 }, …]                       // mm, CL simetrik yarım kesit
PANELS   = [{ id:'P1', from:'N1', to:'N2',
              curve:null | { type:'arc', r:1800, dir:'cw' },  // yay: iki node + yarıçap
              position:'bottom' | 'bilge' | 'side' | 'innerBottom' | 'innerSide' | 'sideGirder' |
                       'centreGirder' | 'stringer' | 'tweenDeck' | 'upperDeck' | 'coaming' | 'longBhd' | null,
              effB:100, effS:100, wt:true,
              strakes:[{ len:2480, t:14, grade:'AH36' }, …],   // panel boyunca sırayla, Σlen = panel boyu
              stiffGroups:[{ id:'G1', fromNode:'N1', offset:600, spacing:600, count:4,
                             dir:'long'|'trans', type:'HP'|'L'|'T'|'FB', profile:'HP 200x10',
                             grade:'AH36', span:null /* null → varsayılan */ }, …] }]
STIFF_DEFAULT_SPAN = 2400                                       // mm, sayfa varsayılanı
COMPARTMENTS = [{ id:'C1', name:'WBT 1', type:'ballast', density:1.025, airPipe_m:0.76,
                  boundary:['P3','P4',…] }]
DECK_LOADS   = [{ panel:'P10', type:'cargo'|'store'|'accommodation'|'custom', p_kNm2:null }]
```

- **Parametrik üretici** (mevcut 9 parametre + Add panel) → NODES/PANELS üretir; sonra serbest düzenleme.
- Mevcut motor (LR kural eşlemesi, strake/profil optimizörleri, DXF/Excel/PDF) `position` koduna bağlanır (bugünkü `shell/innerBottom/…` anahtarlarının yerine).
- Node'a node ekleme = paneli ikiye bölme; strake/stiffener grupları uzunluğa göre pay edilir.

## C. Adım planı (her adım tek başına test edilir, canlıya birlikte)

| Adım | İş | Dokunulan | Bitiş ölçütü |
|---|---|---|---|
| **0** ✔ 18.09 | Çekirdek: NODES/PANELS modeli, parametrik üretici (9 param → node/panel); `SECTION` yalnız elle düzenlendiğinde (`manual`) JSON'a yazılır, aksi hâlde parametrelerden yeniden üretilir | `app/05-model.js` (yeni), `10-draw.js` (SECTION, syncSectionModel, export/import, Draw.getSection/setSection) | ✔ Laker: 20 node / 26 panel, node kümesi eski `computeNodes()` ile birebir (+ coaming top ucu); shell Σ 26407 mm = strake toplamı; A3021 yeni proje aynı şekilde. CRUD (splitPanel/addLine/addArc/removePanel) + kaydet/yükle testi geçti |
| **1** ✔ 18.09 | Section CAD (`app/12-cad.js`, görünüm `section`): nötr çizim (WT düz / non‑WT kesikli, node'lar, sağda Z ve altta Y kotları), yüzen araç çubuğu **Select · Line · Arc · Node · Delete** (S/L/A/N/D, Esc, Del), node/panel snap, Shift = ortogonal, yay = iki node + yarıçap; sağ panel: durum (parametreden / elle) + **⟲ from parameters**, Ship Geometry (elle düzenlendiğinde kilitli), **Add panel** (side/centre girder, stringer, tween deck, deck, long. bhd — form + varsayılanlar), seçili panel (uçlar, boy, position (adım 3), **bending/shear eff. %, WT/Non‑WT**, mesafeden node ekle, sil), seçili node (Y/Z taşı), Model check listesi. Adım‑2 kontrol listesi modele bağlandı | `12-cad.js` (yeni), `10-draw.js` (render/renderEditor devri, `Draw.__cad` köprüsü, setViewMode), `index.html` (Section pill), `96-steps.js`, `refine.css` | ✔ Headless: node ekle → çizgi çiz (IS→shell, kestiği panelleri böldü) → seç → Non‑WT → yay (r 3000) → Add stringer; 2→3→2 geçişleri; yeni proje adım 2'ye CAD ile iniyor |
| **2** ✔ 18.09 | Positions (görünüm `positions`, 12-cad.js): çizimde paneller pozisyon rengiyle + kısa kod etiketi (BTM/BLG/SS/IB/IS/CG/SG/STR/TD/UD/HC/HCT/LBH/DK), adsızlar amber "?"; sağda durum (N panels · adsız sayısı) + **Guess unnamed / Guess all** (geometrik tahmin `SectionModel.guessPosition`), seçili panel kutusu (uçlar, boy, pozisyon seçici, "collinear panels" ile aynı hat üstündekilere yay), pozisyona göre katlanır gruplar (her satırda seçici). Side girder ekleme Positions'tan kalktı (Section → Add panel). Adım‑3 kontrol listesi: adsız panel yok, shell/deck adlı, non‑WT sayısı | `12-cad.js`, `05-model.js` (guessPosition), `10-draw.js`, `index.html` (Positions pill), `96-steps.js`, `refine.css` | ✔ Headless: elle çizilen güverte adsız → Guess → deck; tahmin üretici adlarıyla 25/26 eşleşiyor (tween↔stringer geometrik olarak ayrılamaz); seçim + dropdown ile yeniden adlandırma |
| **3** ✔ 19.09 | Strakes (görünüm `strakes`, 12-cad.js): çizimde her panelin strake'leri kalınlık rengiyle (≤8 cyan … >26 kırmızı) ve t etiketiyle; strake'siz panel amber kesikli, Σ<L açığı amber. Sağda: durum (N/26 panels with strakes · Σ mismatch), **Seed from Auto** (eski motor STRAKES.* düzenini panel zincirine kesip dağıtır, aynı t/grade komşuları birleştirir, dolu paneli ezmez), seçili panel: yön (from → to), boş panelde "1 strake full length" / "N eşit strake", dolu panelde satırlar **# · Length · t · Grade (A…EH40) · sil**, Σ / L göstergesi + **Fit last**, **+ strake**, **Copy to same position** (boya ölçekli), **clear**; pozisyona göre panel listesi (n × t aralığı, Σ durumu). Adım‑4 kontrolü: strake'siz panel, Σ≠L, kalınlıksız strake | `12-cad.js`, `10-draw.js`, `index.html` (Strakes pill), `96-steps.js`, `refine.css` | ✔ Headless Laker: seed 25/26 (centre girder'ın eski karşılığı yok), side shell P17 = 5193/14 + 1597/16; uzunluk düzenle → "4193 mm short" → Fit last → 1000 + 5790 |
| **4** ✔ 19.09 | Stiffeners (görünüm `stiffeners`, 12-cad.js): çizimde her stiffener panel üzerinde iç tarafa tik (L/HP flanş çizgisi, T başlık, enine olanlar mor çapraz), sığmayanlar amber ✕. Sağda: durum (N stiff · panel sayısı · ✕ no fit · no profile) + **Fill empty** (boş panellere motor aralığıyla grup: ilk = 1 aralık, sığan kadar), **Default span** (l_e'den, "from ship"), seçili panel: **+ group**, grup kartı — Start from (from/to node), First at, Spacing, Count (+ **max fit**), Direction long/trans, Profile type HP/L/T/FB, Size (katalog datalist), Grade, Span (boş = varsayılan), Stiffener side; sığma mesajı "Placed N of M — K did not fit (needs X mm, panel L mm)"; **Per stiffener span override** listesi; pozisyona göre panel listesi (n stiff, ✕). Adım‑5 kontrolü: stiffener var, hepsi sığıyor, hepsinin profili var, span tanımlı | `12-cad.js`, `10-draw.js`, `index.html` (Stiffeners pill), `96-steps.js`, `refine.css` | ✔ Headless Laker: Fill empty → 19 panel; P17'ye grup 500/400×30 → "14 ✕", max fit → 705/705×9 |
| **5** ✔ 19.09 | Compartments (adım 6, görünüm `compartments`): kompartıman = kapalı panel halkası; yarım kesitte CL ve ambar ağzı **sanal kenar**la kapanır (köşe CL üzerinden). Tipler: ballast / fuel / fresh water / cargo hold / liquid cargo / void‑cofferdam / machinery / accommodation — her tipin kural notu; alanlar **density ρ, air pipe top (mm AB), test head (m), cargo load (t/m² IB)** (LR Pt 4 Ch 1 Table 1.9.1 / Sec 8.4.4 / Sec 8.4 — motorun kullandığı girdiler). **Pick panels** ile çizimden sınır seçimi (chip'lerden çıkarma), açık/kapalı durumu, alan (m², yarım). Örnek için **Seed** (eski COMPARTMENTS poligonlarını panellere eşler). Nav 7 adıma çıktı (6 Compartments · 7 Check). Adım‑6 kontrolü: kompartıman var, sınırlar kapalı, tankların hava firar kotu var | `12-cad.js`, `10-draw.js`, `index.html`, `96-steps.js`, `refine.css` | ✔ Laker seed: DUCT / VOID / CARGO / Ballast dördü kapalı (CARGO: CL + ambar ağzı sanal kenar) |
| **6** ✔ 19.09 | Deck loads — Compartments adımında "Deck loads" bloğu (UD / deck / tween / stringer / coaming top panelleri: tip + kN/m²). **Motora bağlı**: `SectionAdapter.deckLoadFor(position)` → `60-scantling-rules.js` **LR Pt 3 Ch 3 Table 3.5.1** (ClauseFinder lr-ships-2026'dan okundu; C = 1,39): weather deck h₁ = 1,2+2,04E ya da 0,14·p_a+2,04E (E = (0,0914+0,003L)/(D−T)−0,15, 0…0,147); cargo deck standart h₂ = H_td, belirtilmiş yük h₂ = C·p_a/9,82; stores 2,0 m; machinery 2,6 m; accommodation h₃ = 1,2 m. Kullanım: Table 1.4.3 (1)(b) UD long (eski sabit 2,5 m yerine), Table 1.4.4 cargo/accommodation/platform long (eski sabit h₂=h₃=2,0 yerine), Table 1.4.2 notu (> 43,2 kN/m² özel değerlendirme). Formül metinleri kaynak notu taşır | `12-cad.js`, `07-adapter.js`, `60-scantling-rules.js`, `96-steps.js` | ✔ Laker tween: standart h₂ = H_td = 2,40 m → Z 63; p_a = 30 kN/m² → h₂ = 4,25 m → Z 69 |
| **7** ✔ 19.09 | **`app/07-adapter.js`** — SectionModel → eski motor durumu: GEOMETRY (B/2, IB, UD, HC, IS, R_B, duct) ve SIDE_GIRDERS / stringerZs / tweenZs modelden türetilir; STRAKES.<legacyKey> panel zincirinden birleştirilir (width/thickness/materialFamily); profiles.* grupları stiffener gruplarının gerçek konumlarından (y/z, profileName "L 200x90x10" vb., span_mm); COMPARTMENTS `poly` noktalarıyla (`_compartmentPolygonPoints/_compartmentBoundingBox` poly destekler); WT_FLAGS. `computeProfiles/computeStrakes` model `manual` iken adapter'a yönlenir; her CAD mutasyonu (`commit/commitNames`), proje yükleme ve CAD'den çıkış adapter'ı çalıştırır. Eşlemesi olmayan pozisyonlar (centreGirder, longBhd, deck, other) Check adımında listelenir | `07-adapter.js` (yeni), `10-draw.js`, `12-cad.js`, `96-steps.js` | ✔ Laker: strake seed + Fill empty + profiller + kompartıman seed → Analysis: 20 OK / 2 FAIL, 74 stiff / 29 strake modelden; kompartımanlar poly ile |

Adım navigasyonu (uygulanan): **1 Ship · 2 Section · 3 Positions · 4 Strakes · 5 Stiffeners · 6 Compartments · 7 Check** — deck loads adım 6'nın içinde ayrı bir sekme/bölüm olarak (plan adımı 6).

## D. Açık noktalar (ilerlerken netleşecek)
- Pozisyon adı listesi: yukarıdaki 13 kod öneri; eksik varsa kullanıcı ekler.
- Varsayılan span kaynağı: web frame aralığı (Ship sayfasındaki `transFrameSpacing`) — onay.
- Kompartıman sınırı: panel seçimiyle mi, node zinciriyle mi (MARS node circuit)? Öneri: panel seçimi (daha hızlı), zincir kapanıklığı otomatik kontrol.

## E. Sonraki tur (19.09.2026)
- **Bending / shear efficiency motora bağlandı**: `computeSectionProperties` her katkıyı (strake ve stiffener) panelin `effB`'si ile ölçekler (A, I_self, Q); `totalArea` brüt kalır, `effectiveArea` ayrı. Kayma: `SectionAdapter.effSAt(y,z)` → `_bucklingPlateResult` τ = F·Q/(I·t·effS). Test: UD effB = 0 → I 72,7 → 65,3 m⁴, Z_D 8335 → 7152 cm³·10; tween effS 50 → 0,5.
- **Deck load → LR** (yukarıda adım 6).
- **Sakin arayüz**: tek tip ölçeği (11 px mono veri, 12 px kontrol, 13 px tek başlık); başlık/nav/şerit/alt bar/form alanları küçültüldü; bridge bar'daki gereksiz "Geometry" ve yardım metni kaldırıldı; sağ panel başlığı adıma göre (Section / Positions / …); SVG etiketleri 7,5–8 px (min 10 px). Kullanıcı tercihi olarak not alındı.
