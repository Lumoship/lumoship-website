// =============================================================================
// 68-dnv-ui.js — DNV RU-SHIP modu: SectionModel + ShipComps + form → DNV modeli (67-dnv-check) → sonuç paneli (M12)
//   Etkin: Classification Society = "DNV". recalcAll sonunda DNVUI.refresh() (71-recalc.js) ve toplum değişince.
//   Girdiler: mevcut form (L, B, D, T, Cb, serviceSpeed, bvBilgeKeel, bvLoadLineLength, bvFreeboardType, MsDesign/MsSag, QsPos/QsNeg,
//   sectionXL, transFrameSpacing, ice_* paneli) + bu modülün eklediği DNV alanları (dnv_TBAL, dnv_holdRho, dnv_holdZc, dnv_xLcpOffset).
//   Kompartıman kutuları (ShipComps) → yüzeyler/tank/ambar; panel konum kodları → korozyon/min kalınlık/narinlik konumları.
// =============================================================================
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const num = (id, def) => { const v = parseFloat(($(id) || {}).value); return isNaN(v) ? def : v; };
  const M = () => window.SectionModel, D = () => window.Draw;
  const isDNV = () => (($('classificationSociety') || {}).value || '') === 'DNV';

  // ------------------------------------------------------------ DNV girdi alanları (form; tam-durum kaydında otomatik saklanır)
  const F = (id, label, val, step, title, unit) => unit
    ? `<div class="ea-field dnv-only" title="${title || ''}"><label class="ea-label">${label}</label><div class="ea-input-unit"><input type="number" step="${step || 0.01}" class="ea-input" id="${id}" value="${val}" onchange="recalcAll()"><span class="ea-unit">${unit}</span></div></div>`
    : `<div class="ea-field dnv-only" title="${title || ''}"><label class="ea-label">${label}</label><input type="number" step="${step || 0.01}" class="ea-input" id="${id}" value="${val}" onchange="recalcAll()"></div>`;
  const Sel = (id, label, opts, val, title) => `<div class="ea-field dnv-only" title="${title || ''}"><label class="ea-label">${label}</label><select class="ea-select" id="${id}" onchange="recalcAll()">${opts.map(([v, l]) => `<option value="${v}" ${v === val ? 'selected' : ''}>${l}</option>`).join('')}</select></div>`;

  function ensureInputs() {
    ensureIceInputs(); ensureRulesInputs();
    if ($('dnvInputs')) return;
    const anchor = $('bvBilgeKeel'); const host = anchor && anchor.closest('.ea-field') && anchor.closest('.ea-field').parentElement; if (!host) return;
    const div = document.createElement('div'); div.id = 'dnvInputs'; div.className = 'dnv-inputs'; div.style.cssText = 'display:contents';
    div.innerHTML =
      F('dnv_TBAL', 'Ballast draught T_BAL', '', 0.01, 'DNV Pt 3 Ch 4 Sec 6 / Ch 6 Sec 2 Table 1: WB-1/WB-4 setleri T_BAL ile; boş = 0.58·T_SC', 'm') +
      F('dnv_holdZc', 'Cargo surface z_C', '', 0.01, 'Pt 5 Ch 1 Sec 2 [3.3.1]: dolu ambarda eşdeğer yatay yüzey (ambar ağzı mezarnası üstü); boş = ambar kutusunun üstü', 'm') +
      F('dnv_xLcpOffset', 'LCP x offset', '', 0.01, 'Ch 3 Sec 7 Table 2: LCP x = EPP orta boyu; kesitin EPP ortasından uzaklığı (m); boş = posta aralığının yarısı (komşu PSM ortası varsayımı)', 'm');
    host.appendChild(div);
  }

  // Applicable Rules sayfası: Nauticus'taki "Rule edition" ve "Maximum cargo density" ile aynı yerde
  function ensureRulesInputs() {
    if ($('dnv_ruleEdition')) return;
    const row = $('dnvRulesHost'); if (!row) return;
    row.innerHTML =
      '<div class="ea-field dnv-only" title="Kural motoru ClauseFinder harvest\'inden DNV RU-SHIP Pt 3/4/5/6, 2026 Temmuz sürümü kullanıyor. Sürüm seçimi yok — tek metin kaynağı. Farklı bir baskıyla (ör. Nauticus Temmuz 2022) karşılaştırırken bazı sapmalar bu yüzden olabilir (bilinen fark: profil berthing gerekliliği 2023\'te kaldırıldı)."><label class="ea-label">Rule edition</label><input type="text" class="ea-input" id="dnv_ruleEdition" readonly value="RU-SHIP 2026-07"></div>' +
      F('dnv_holdRho', 'Maximum cargo density ρ_C', 0.7, 0.05, 'Pt 5 Ch 1 Sec 2 [3.3.3]: M_H/V_Full, en az 0.7 t/m³ (homojen tam yük). Ambar bazında Compartments sayfasında override edilebilir; burası gemi geneli varsayılan.', 't/m³') +
      Sel('dnv_shipGrab', 'Grab', [['', '— none —'], ['1-X', 'Grab(1-X)'], ['2-X', 'Grab(2-X)'], ['3-X', 'Grab(3-X)']], '',
        'Pt 6 Ch 1 Sec 1: gemi geneli Grab ek sınıf notasyonu. Tüm kuru dökme yük ambarları için varsayılan; bir ambarın kendi Grab notasyonu (Compartments sayfası) varsa o öncelikli. Zorunlu: L_LL≥150 m ve kargo yoğunluğu≥1,0 t/m³.') +
      F('dnv_shipGrabMGR', 'Weight of grab M_GR', '', 1, '[1.5]: boş = notasyona göre varsayılan (Grab(1-X)/(2-X)=10 t; Grab(3-X) 20-35 t, L\'ye göre)', 't');
  }

  // DNV buz kuşağı bölgesi — Ice sayfasında (FSICR paneliyle aynı yerde) render edilir; Framing system/m_o alanları
  // yukarıdaki FSICR bölümüyle PAYLAŞILIR (aynı input, ikinci bir kopya değil — DNV buz kontrolü de ice_framing/ice_mo okur)
  function ensureIceInputs() {
    if ($('dnv_iceRegion')) return;
    const row = $('dnvIceRow'); if (!row) return;
    row.innerHTML = Sel('dnv_iceRegion', 'Ice region', [['bow', 'Bow'], ['midbody', 'Midbody'], ['stern', 'Stern']], 'midbody',
      'Pt 6 Ch 6 Sec 3 Table 8/10/11: c_1 ve buz kuşağı düşey uzanımı bölgeye göre değişir (bu kesitin gemi boyundaki konumu). Framing system ve m_o (yukarıdaki FSICR bölümünde) DNV boyuna/enine posta hesabını da besler — aynı alan, iki ayrı kural setinde paylaşılıyor.');
  }
  const TBAL = () => { const v = num('dnv_TBAL', NaN); return isNaN(v) || v <= 0 ? 0.58 * num('T', 7) : v; };

  // ------------------------------------------------------------ M_sw kılavuz değeri (Pt 3 Ch 4 Sec 4 [2.2.1]): girilen M_s hog/sag ile karşılaştırma amaçlı, zorunlu sınır değil
  function ensureMswGuidance() {
    if ($('dnvMswGuide')) return;
    const anchor = $('MsSag'); const host = anchor && anchor.closest('.ea-field') && anchor.closest('.ea-field').parentElement; if (!host) return;
    const div = document.createElement('div');
    div.className = 'ea-field dnv-only';
    div.title = 'DNV Pt 3 Ch 4 Sec 4 [2.2.1]: ön tasarım M_sw kılavuz değerleri, kesitin x konumuna göre — girilen M_s hog/sag ile karşılaştırma içindir, kural motoru daima yukarıdaki girilen değeri kullanır';
    div.innerHTML = '<label class="ea-label">DNV kılavuz M<sub>sw</sub> (hog / sag)</label><input type="text" class="ea-input" id="dnvMswGuide" readonly value="—">';
    host.appendChild(div);
  }
  function updateMswGuidance() {
    const el = $('dnvMswGuide'); if (!el) return;
    const L = num('L', 0), B = num('B', 0), CB = num('Cb', 0.8), x = num('sectionXL', 0.5) * L;
    if (!(L > 0 && B > 0) || !window.DNV || !window.DNV.MswMin) { el.value = '—'; return; }
    const g = window.DNV.MswMin(x, L, B, CB);
    const fmt = v => Math.round(v).toLocaleString('tr-TR');
    el.value = fmt(g.hog) + ' / ' + fmt(g.sag) + ' kN·m';
  }

  // ------------------------------------------------------------ profil adı → boyutlar
  function parseProfile(name) {
    const s = String(name || '').trim(); const m = /^(HP|L|T|FB)\s*(.*)$/i.exec(s); if (!m) return null;
    const type = m[1].toUpperCase(), d = m[2].replace(/\s/g, '').split(/x|\//).map(Number);
    if (type === 'FB') return { type: 'FB', hw: d[0], tw: d[1], bf: 0, tf: 0 };
    if (type === 'HP') {                                                     // Ch 3 Sec 7 [1.4.1]: bulb → eşdeğer L (net ölçüler; burada brüt üzerinden, t_c sonra düşülür)
      const hwp = d[0], twp = d[1], al = hwp <= 120 ? 1.1 + Math.pow(120 - hwp, 2) / 3000 : 1.0;
      return { type: 'L', hw: hwp - hwp / 9.2 + 2, tw: twp, bf: al * (twp + hwp / 6.7 - 2), tf: hwp / 9.2 - 2, bulb: true };
    }
    if (type === 'L') return { type: 'L', hw: d[0] - (d[3] || d[2]), tw: d[2], bf: d[1], tf: d[3] || d[2] };
    if (type === 'T') return { type: 'T', hw: d[0], tw: d[1], bf: d[2], tf: d[3] };
    return null;
  }
  // kompartıman türü → 61-dnv-core COMP anahtarı
  const COMP_KEY = { ballast: 'ballast', cargo: 'hold', dryBulk: 'hold', container: 'hold', holdIndepTank: 'void', liquidCargo: 'cargoOil', liquidCargoHeated: 'cargoOil', lngMembrane: 'cargoOil', lngIndependent: 'void', fuel: 'fuelOil', fuelHeated: 'fuelOil', freshwater: 'fuelOil', void: 'void' };
  const isTank = t => ['ballast', 'liquidCargo', 'liquidCargoHeated', 'fuel', 'fuelHeated', 'freshwater', 'lngMembrane'].includes(t);
  const isHold = t => ['cargo', 'dryBulk'].includes(t);

  // ------------------------------------------------------------ model kurucu
  function buildModel() {
    const DNV = window.DNV, DL = window.DNVLoads, SEC = window.DNVSection, BK = window.DNVBuckling, ICE = window.DNVIce;
    const s = D() && D().getSection && D().getSection(); if (!s || !s.panels || !s.panels.length) return null;
    const L = num('L', 0), B = num('B', 0), Dd = num('D', 0), T = num('T', 0), CB = num('Cb', 0.8); if (!(L > 0 && B > 0 && T > 0)) return null;
    const shipType = ($('shipType') || {}).value || 'other';
    const bulk = /bulk/.test(shipType);
    const iceOn = $('iceEnabledOn') && $('iceEnabledOn').checked;
    const iceCls = (($('iceClass') || {}).value || '1C').replace('1AS', '1A*');
    const ship = { L, B, D: Dd, TSC: T, TBAL: TBAL(), CB, rollType: bulk ? 'bulkFull' : 'general', bilgeKeel: (($('bvBilgeKeel') || {}).value || 'Yes') !== 'No', v: num('serviceSpeed', undefined),
      lamOST: 0.45, LLL: num('bvLoadLineLength', L) || L, freeboardType: (($('bvFreeboardType') || {}).value || 'B'),
      ice: iceOn ? { iceClass: iceCls, deltaF: num('ice_Disp', 0), PS: num('ice_P0', 0), UIWL: num('ice_T_uiwl', T), LIWL: num('ice_T_liwl', TBAL()),
        region: (($('dnv_iceRegion') || {}).value || 'midbody'), framing: (($('ice_framing') || {}).value === 'TRANS' ? 'trans' : 'long'), m0: num('ice_mo', 7), tc: num('ice_tc', 2) } : null };
    const xL = num('sectionXL', 0.5), x = xL * L;
    // web frame (PSM/boyuna posta) aralığı — TEK zincir, üç kaynak yarışmıyor: Frame Table (Web fr. /N, x'e göre) > transFrameSpacing (elle override) > l_e (Ana Particulars, son çare)
    const leM = num('le', NaN);
    const ftWf = (window.ProjectTree && window.ProjectTree.FrameTable && window.ProjectTree.FrameTable.webSpacingAtX) ? window.ProjectTree.FrameTable.webSpacingAtX(x) : null;
    const frameSp = ftWf || num('transFrameSpacing', isNaN(leM) ? 700 : leM * 1000);
    const xLcpOffset = num('dnv_xLcpOffset', frameSp / 2000);   // boş: PSM aralığının yarısı — EPP orta boyu, komşu döşek/web frame ortası varsayımı
    const xLCP = x + xLcpOffset;
    const grFull = num('bvGMfull', NaN), krFull = num('bvKr', NaN), grBal = num('bvGMbal', NaN), krBal = num('bvKrBal', NaN);   // Ch 4 Sec 3 [2.1.1] / Pt 5 Ch 1 [5.1.2]: yükleme kitapçığından biliniyorsa gerçek GM/Kr, yoksa kural varsayılan tablosu
    const ldGMKr = { GM: isNaN(grFull) ? undefined : grFull, kr: isNaN(krFull) ? undefined : krFull }, balGMKr = { GM: isNaN(grBal) ? undefined : grBal, kr: isNaN(krBal) ? undefined : krBal };
    const conds = bulk ? [{ name: 'LD', T, rollType: 'bulkFull', ...ldGMKr }, { name: 'HD', T, rollType: 'bulkHeavyPartial', hd: true }, { name: 'Ballast', T: ship.TBAL, rollType: 'bulkBallast', ...balGMKr }]
      : [{ name: 'LD', T, rollType: 'general', ...ldGMKr }, { name: 'Ballast', T: ship.TBAL, rollType: 'general', ...balGMKr }];
    // --- kompartımanlar
    const comps = (window.ShipComps ? window.ShipComps.forSection(s).filter(c => window.ShipComps.hasSize(c)) : []);
    const tanks = {}, holds = {};
    const zHoldDefault = num('dnv_holdZc', NaN);
    const shipGrabQ = (($('dnv_shipGrab') || {}).value) || '';   // Applicable Rules sayfası "Grab" — ambarın kendi grabQualifier'ı yoksa gemi geneli varsayılan
    comps.forEach(c => {
      const half = 7.0, x0 = c.frFrom != null && c.frTo != null ? Math.min(c.frFrom, c.frTo) * frameSp / 1000 : x - half, x1 = c.frFrom != null && c.frTo != null ? Math.max(c.frFrom, c.frTo) * frameSp / 1000 : x + half;
      const yG = (c.y0 + c.y1) / 2000, zG = (c.z0 + c.z1) / 2000;
      if (isTank(c.type)) tanks[c.id] = { name: c.name, ztop: c.z1 / 1000, zair: (c.airpipe_mm || (c.z1 + 760)) / 1000, rho: c.rho || 1.025, P0: L <= 50 ? 10 : L < 100 ? 0.3 * L - 5 : 25, Pdrop2: 25, x0, x1, y0: c.y0 / 1000, y1: c.y1 / 1000, xG: (x0 + x1) / 2, yG, zG, compType: COMP_KEY[c.type] || 'ballast' };
      else if (isHold(c.type)) {
        const zC = c.holdZc_mm > 0 ? c.holdZc_mm / 1000 : (!isNaN(zHoldDefault) && zHoldDefault > 0 ? zHoldDefault : c.z1 / 1000);   // kompartıman başına z_C önce, sonra küresel dnv_holdZc, sonra kutu üstü
        const psi = c.psiDeg > 0 ? c.psiDeg : 30;   // Pt 5 Ch 1 [3.4]: 30° genel, 35° demir cevheri, 25° çimento (kural metni) — kompartıman başına
        const grabQ = c.grabQualifier || (c.type === 'dryBulk' ? shipGrabQ : '');   // kompartıman kendi notasyonunu istiyorsa öncelikli, yoksa Applicable Rules'daki gemi geneli
        holds[c.id] = { name: c.name, rhoC: Math.max(0.7, c.rho || num('dnv_holdRho', 0.7)), zC, xG: (x0 + x1) / 2, yG: 0, zG: zG, psi, compType: c.type === 'dryBulk' ? 'holdGrab' : 'hold', grab: grabQ ? { qualifier: grabQ, MGR: c.grabMGR > 0 ? c.grabMGR : num('dnv_shipGrabMGR', 0) || DNV.GRAB_DEFAULT_MGR(grabQ, L), z0: c.z0 / 1000 } : null };   // Pt 6 Ch 1 Sec 1: kepçe darbesi
        if (c.type === 'dryBulk' && c.heavyLoaded) holds[c.id].heavy = { rhoC: c.heavyRho || holds[c.id].rhoC, zC, xG: holds[c.id].xG, yG: 0, zG, psi };   // Pt 5 Ch 1 [BC-3/4]: dolu ambar HD alternatif durumu
      }
    });
    const boxAt = (y, z) => comps.find(c => y >= c.y0 && y <= c.y1 && z >= c.z0 && z <= c.z1) || null;
    // --- plakalar (strake parçaları) ve profiller
    const plates = [], epps = [], stiffs = [];
    const gradeReH = g => DNV.ReHOf(g || s.defaultGrade || 'AH36', 355);
    let dbZ = null; s.panels.forEach(pn => { if (pn.position !== 'innerBottom') return; const ln = M().panelLine(pn, s.nodes); const zz = Math.min(ln.a.z, ln.b.z); if (dbZ == null || zz < dbZ) dbZ = zz; }); dbZ = (dbZ || 0) / 1000;   // Table 10/11 'DB' (çift dip üstü) — buz kuşağı alt sınırı
    const iceBelt = kind => ship.ice ? ICE.belt(ship.ice.iceClass, ship.ice.region, ship.ice.UIWL, ship.ice.LIWL, kind, dbZ) : null;
    // strake'i olmayan grup (parametrik örnek gemi: profil grupları var, strake yok) → BOŞ listeler motorun yerleşiminden dolar (dolu listelere dokunmaz)
    const tempStrakes = {};
    try {
      const noStrake = g => { const d = (s.panelData || {})[g]; return !d || !d.strakes || !d.strakes.length || d.strakes.every(x => !(x.t > 0)); };
      if (Object.keys(s.groups || {}).some(noStrake) && window.SectionAdapter && SectionAdapter.legacyToPanelData && D().STRAKES) {
        const ST = D().STRAKES, placeholder = Object.keys(ST).some(k => (ST[k] || []).some(x => x && x.thickness == null));
        if (placeholder && D().computeStrakes) D().computeStrakes();                              // motorun strake'leri henüz hesaplanmamış (kalınlık null)
        Object.keys(s.groups || {}).forEach(g => { if (noStrake(g) && s.panelData && s.panelData[g]) s.panelData[g].strakes = []; });
        SectionAdapter.legacyToPanelData(s, D().STRAKES, D().profiles, D().__cad ? D().__cad.GEOMETRY() : {}, D().PLATE_THICKNESS || {});
        Object.keys(s.groups || {}).forEach(g => { const d = s.panelData && s.panelData[g]; if (d && d.strakes && d.strakes.length && d.strakes.every(x => !(x.t > 0))) d.strakes = []; });   // kalınlıksız yer tutucu kalmasın (otomatik kayda gitmesin)
        // hâlâ strake'i olmayan grup: bölge kalınlığı (PLATE_THICKNESS) tek strake — hesap için model dışı geçici (panelData'ya yazılmaz)
        const PT = D().PLATE_THICKNESS || {}, PTK = { shell: ['shell'], innerBottom: ['ib', 'innerBottom'], innerSide: ['is', 'innerSide'], upperDeck: ['upperDeck', 'deck'], coamingTop: ['coamingTop'], stringer: ['stringer'], tween: ['tween', 'tweenDeck'], sideGirder: ['sideGirder', 'sg'], duct: ['duct', 'centreGirder'] };
        Object.keys(s.groups || {}).forEach(g => { if (!noStrake(g)) return; const key = (window.SectionAdapter.legacyKeyOfGroup ? SectionAdapter.legacyKeyOfGroup(s, g) : null) || ''; const base = key.replace(/\d+$/, ''); const cands = PTK[base] || [base]; const t = cands.map(k => PT[k]).find(v => v > 0); if (t > 0) tempStrakes[g] = t; });
      }
    } catch (e) { console.warn('[DNV] panelData fill', e); }
    const posOf = seg => seg.position || 'other';
    const deckZ = (() => { let z = -Infinity; s.panels.forEach(pn => { if (['upperDeck', 'deck', 'coamingTop'].includes(pn.position)) { const l = M().panelLine(pn, s.nodes); z = Math.max(z, l.a.z, l.b.z); } }); return isFinite(z) ? z : null; })();   // en üst açık güverte (mm)
    Object.keys(s.groups || {}).forEach(gid => {
      const ci = M().chainInfo(s, gid); if (!ci.L) return;
      const d = M().panelData(s, gid);
      const strakes = d.strakes && d.strakes.length ? d.strakes : [{ len: ci.L, t: tempStrakes[gid] || null, grade: null }];   // strake yoksa bölge kalınlığı
      // profil konumları (zincir mesafesi)
      const stPos = []; let prevEnd = null;
      d.stiffGroups.forEach(g => { const r = M().groupPositions(s, gid, g, prevEnd); if (r.placed.length) prevEnd = Math.max(...r.placed);
        r.placed.forEach((xc, i) => { const span = (g.spanOverrides && g.spanOverrides[i]) || g.span || M().spanAt(s, gid, xc) || s.stiffDefaultSpan || 2000; stPos.push({ x: xc, g, span, name: (window.SectionAdapter ? window.SectionAdapter.profileName(g) : null) }); }); });
      stPos.sort((a, b) => a.x - b.x);
      // PSM kesişimleri (≥3 panelin birleştiği düğümler) → profil aralığı sınırı (Ch 3 Sec 7 [1.2.1] b_i: komşu profil veya PSM'e kadar)
      const useN = {}; s.panels.forEach(pn => { useN[pn.from] = (useN[pn.from] || 0) + 1; useN[pn.to] = (useN[pn.to] || 0) + 1; });
      const psmX = [0, ci.L]; ci.items.forEach(it => { const nEnd = it.fwd ? it.seg.to : it.seg.from, nSt = it.fwd ? it.seg.from : it.seg.to; if ((useN[nEnd] || 0) >= 3) psmX.push(it.start + it.len); if ((useN[nSt] || 0) >= 3) psmX.push(it.start); });
      // plaka parçaları: strake sınırları ∪ yay/düz geçişleri ∪ PSM kesişimleri (Nauticus EPP'leri de bu noktalarda ayrılır)
      const isArcItem = it => !!(it.seg.curve && it.seg.curve.type === 'arc');
      const cutSet = new Set([0, Math.round(ci.L)]); { let a0 = 0; strakes.forEach(st => { a0 += st.len || 0; cutSet.add(Math.round(a0)); }); }
      ci.items.forEach((it, i) => { if (i > 0 && isArcItem(it) !== isArcItem(ci.items[i - 1])) cutSet.add(Math.round(it.start)); });
      psmX.forEach(q => cutSet.add(Math.round(q)));
      const cutsP = [...cutSet].filter(q => q >= 0 && q <= ci.L + 0.5).sort((u, v) => u - v);
      const strakeAt = x => { let a0 = 0; for (const st of strakes) { a0 += st.len || 0; if (x <= a0) return st; } return strakes[strakes.length - 1]; };
      const itemAt = x => ci.items.find(it => x >= it.start - 0.5 && x <= it.start + it.len + 0.5) || ci.items[ci.items.length - 1];
      cutsP.slice(0, -1).forEach((x0, si) => {
        const x1 = cutsP[si + 1]; if (x1 - x0 < 1) return;
        const st = strakeAt((x0 + x1) / 2); if (!st || !(st.t > 0)) return;
        const A = M().chainPointAt(s, gid, x0), Bp = M().chainPointAt(s, gid, x1), mid = M().chainPointAt(s, gid, (x0 + x1) / 2); if (!A || !Bp || !mid) return;
        const seg = mid.seg, pos = posOf(seg), ln = M().panelLine(seg, s.nodes), it = itemAt((x0 + x1) / 2);
        const arc = (it && isArcItem(it)) ? { R: it.seg.curve.r, side: 1 } : null;
        // yüzeyler: zincir orta noktasında normal boyunca ±25 mm'deki kompartıman (yay parçasında kirişin orta noktası plakadan uzağa düşer)
        const dy = Bp.y - A.y, dz = Bp.z - A.z;
        const nx = -mid.tz, nz = mid.ty;                                                          // sol normal (CL'den dışa/yukarı çizimde iç taraf)
        const my = mid.y, mz = mid.z;
        const inBox = boxAt(my + nx * 25, mz + nz * 25), outBox = boxAt(my - nx * 25, mz - nz * 25);
        const shell = ['bottom', 'bilge', 'side'].includes(pos), deckPos = ['upperDeck', 'deck', 'coamingTop'].includes(pos);
        const faces = [], sideTypes = [];
        const faceOf = (box, inside) => { if (!box) return; if (isTank(box.type)) faces.push({ kind: 'tank', tank: box.id, inside, cond: 'Ballast' }); else if (isHold(box.type)) faces.push({ kind: 'hold', hold: box.id, alpha: Math.abs(dz) > Math.abs(dy) ? 90 : 0, inside, coaming: pos === 'coaming' || pos === 'coamingTop' }); };
        if (shell) { faces.push({ kind: 'sea' }); faceOf(inBox, true); sideTypes.push('external', inBox ? (COMP_KEY[inBox.type] || 'void') : 'void'); }
        else if (deckPos && (!inBox || !outBox)) { const ub = inBox || outBox; faces.push({ kind: 'sea', deck: { zdk: mz / 1000, LLL: ship.LLL, freeboardType: ship.freeboardType } }); faceOf(ub, true); sideTypes.push('external', ub ? (COMP_KEY[ub.type] || 'void') : 'void'); }   // açık güverte: kutusuz yüz deniz (yeşil deniz), öteki yüz tank/ambar
        else if (inBox && outBox && inBox.id === outBox.id) { faces.push({ kind: 'internal' }); sideTypes.push(COMP_KEY[inBox.type] || 'void', COMP_KEY[inBox.type] || 'void'); }   // iki yüz de aynı kompartıman → net basınç 0, yalnız INT-1
        else { const aboveDeck = deckZ != null && mz >= deckZ - 5; faceOf(inBox, true); faceOf(outBox, false); sideTypes.push(inBox ? (COMP_KEY[inBox.type] || 'void') : (aboveDeck ? 'external' : 'void'), outBox ? (COMP_KEY[outBox.type] || 'void') : (aboveDeck ? 'external' : 'void')); }   // güverte üstü kutusuz yüz: dış ortam
        if (seg.deckLoad && seg.deckLoad.type && seg.deckLoad.type !== 'none' && seg.deckLoad.p > 0) faces.push({ kind: 'deck', Pdls: seg.deckLoad.p, Pdls2: seg.deckLoad.p2 != null ? seg.deckLoad.p2 : seg.deckLoad.p });
        if (!faces.length && (inBox || outBox)) faces.push({ kind: 'internal' });
        // korozyon
        const horiz = Math.abs(dz) < 0.2 * Math.abs(dy), zTop = Math.max(A.z, Bp.z);
        const faceFor = (type, box) => {
          if (!box) return 'other';
          if (type === 'void') return (horiz && Math.abs(mz - box.z0) <= 30) ? 'bottomPlate' : 'other';                     // kompartımanın tabanı
          if (type === 'hold' || type === 'holdGrab') return (pos === 'innerBottom' || zTop <= box.z0 + (type === 'holdGrab' ? 3000 : 1500)) ? 'lower' : 'other';
          return 'other'; };
        const seaCase = shell || (deckPos && (!inBox || !outBox));
        const cA = sideTypes[0] === 'external' ? { type: 'external' } : { type: sideTypes[0], face: faceFor(sideTypes[0], seaCase ? null : inBox) };
        const cB = sideTypes[1] === 'external' ? { type: 'external' } : { type: sideTypes[1], face: faceFor(sideTypes[1], seaCase ? (inBox || outBox) : (inBox && outBox && inBox.id === outBox.id ? inBox : outBox)) };
        let tc; try { tc = DNV.plateCorrosion(cA, cB, st.t).tc; } catch (_) { tc = 1.5; }
        const ReH = gradeReH(st.grade), k = DNV.kFactor(ReH);
        // min kalınlık konumu
        let minLoc = 'otherDeck', minAdj = null, slLoc = 'other';
        const tankSides = sideTypes.every(t => ['ballast', 'cargoOil', 'fuelOil', 'otherTank', 'bilgeBrine'].includes(t));
        if (shell) { minLoc = DNV.shellLoc(Math.min(A.z, Bp.z), Math.max(A.z, Bp.z), T, pos === 'bottom' && x0 < 1); slLoc = 'shell'; }   // omurga: CL'den başlayan dip plakası (strake)
        else if (pos === 'innerBottom') { minLoc = faces.some(f => f.kind === 'hold') ? 'innerBottomCargo' : 'bhdTank'; slLoc = 'innerBottom'; }   // ambar dışı iç dip (tank–tank): tank perdesi satırı (Nauticus 4,5 + 0,015 L)
        else if (deckPos) { minLoc = 'weatherDeck'; slLoc = 'deck'; }
        else if (['tweenDeck', 'stringer', 'deck'].includes(pos)) { minLoc = 'otherDeck'; slLoc = 'deck'; }
        else if (['innerSide', 'longBhd', 'coaming'].includes(pos)) { minLoc = (faces.some(f => f.kind === 'tank') || tankSides || pos === 'coaming') ? 'bhdTank' : 'bhdWT'; slLoc = 'other'; }
        else if (['sideGirder', 'centreGirder', 'stringer'].includes(pos)) { minLoc = 'psm:bottomGirder'; slLoc = 'psm'; }
        const plate = { id: gid + '/' + (si + 1), gid, pos, y0: A.y, z0: A.z, y1: Bp.y, z1: Bp.z, t: st.t, tc, ReH, k, arc, faces, sides: sideTypes.slice(), cFaces: [cA.face || '-', cB.face || '-'], minLoc, minAdj, slLoc, x0, x1, panelId: seg.id };
        plates.push(plate);
      });
      // profiller
      stPos.forEach((sp, i) => {
        const at = M().chainPointAt(s, gid, sp.x); if (!at) return;
        const pr = parseProfile(sp.name); if (!pr) return;
        const plate = plates.find(p => p.gid === gid && sp.x >= p.x0 - 1 && sp.x <= p.x1 + 1) || plates.find(p => p.gid === gid); if (!plate) return;
        const startCL = (() => { const n0 = s.nodes.find(n => n.id === ci.startNode); return !!n0 && Math.abs(n0.y) < 1; })();   // zincir CL'den başlıyor → ayna
        const prevB = Math.max(i > 0 ? stPos[i - 1].x : (startCL ? -sp.x : 0), ...psmX.filter(q => q < sp.x - 1 && !(startCL && q < 1))), nextB = Math.min(i < stPos.length - 1 ? stPos[i + 1].x : ci.L, ...psmX.filter(q => q > sp.x + 1));
        let gapA = sp.x - prevB; const gapB = nextB - sp.x;
        if (startCL && i === 0 && sp.x < 5) gapA = gapB;                                                    // CL üzerindeki profil (omurga boyunası): b1 = b2
        const endN = s.nodes.find(n => n.id === ci.endNode), endFree = !!endN && (useN[endN.id] || 0) < 3;
        let gapB2 = gapB; if (endFree && i === stPos.length - 1 && ci.L - sp.x < 5) gapB2 = gapA;                // serbest uçtaki profil (mezarna üstü): b2 = b1
        const spacing = (gapA + gapB2) / 2 || sp.g.spacing || frameSp;                                   // Ch 3 Sec 7 [1.2.1] s = Σb_i/n
        const seg = at.seg, ln = M().panelLine(seg, s.nodes), dy = ln.b.y - ln.a.y, dz = ln.b.z - ln.a.z;
        const sgnS = sp.g.side === 'out' ? -1 : 1, nx = -at.tz * sgnS, nz = at.ty * sgnS;                    // profil tarafı: sol normal ('in') / ters ('out')
        const sBox = boxAt(at.y + nx * 25, at.z + nz * 25);
        const ReH = gradeReH(sp.g.grade || plate.grade), comp = sBox ? (COMP_KEY[sBox.type] || 'void') : (plate.faces.find(f => f.kind === 'tank') ? 'ballast' : plate.faces.find(f => f.kind === 'hold') ? 'hold' : 'void');
        const sFace = (comp === 'hold' || comp === 'holdGrab') ? ((plate.pos === 'innerBottom' || (sBox && at.z <= sBox.z0 + (comp === 'holdGrab' ? 3000 : 1500))) ? 'lower' : 'other') : 'other';
        let tcw = 1.0, tcf = 1.0; try { const r = DNV.stiffenerCorrosion(comp, sFace, pr.tw, pr.tf || pr.tw); tcw = r.tc_w; tcf = r.tc_f != null ? r.tc_f : r.tc_w; } catch (_) {}
        const lBdg = sp.span / 1000, lShr = Math.max(0.1, lBdg - spacing / 2000);
        stiffs.push({ id: gid + '/' + sp.g.id + '#' + (i + 1), panel: plate.pos, plateId: plate.id, y: at.y, z: at.z, ref: { y: at.y + nx * pr.hw, z: at.z + nz * pr.hw }, type: pr.type, hw: pr.hw, tw: pr.tw, bf: pr.bf, tf: pr.tf, tcw, tcf, ReH, vertical: Math.abs(dz) > Math.abs(dy),
          s: spacing, lBdg, lShr, dShr: pr.hw, fbdg: 12, fu: pr.type === 'L' ? 1.15 : pr.type === 'HP' ? 1.03 : 1.0, fshr: 0.5, fixity: 'fixed', faces: plate.faces.map(f => (sgnS < 0 && f.inside != null) ? Object.assign({}, f, { inside: !f.inside }) : f), minLoc: 'other',   // 'inside' = kompartıman profil tarafında; profil 'out' ise yüzler ters wt: !['bottom', 'bilge', 'side'].includes(plate.pos),
          buck: (() => { const plAt = xx => plates.find(q => q.gid === gid && xx >= q.x0 - 1 && xx <= q.x1 + 1) || plate;   // komşu EPP'lerin gerçek plakaları (Nauticus C_x1/C_x2 farklı t ile)
              const p1 = plAt(sp.x - gapA / 2), p2 = (gapB2 !== gapB) ? p1 : plAt(sp.x + gapB / 2);                  // serbest uç: ayna
              return { b1: gapA, b2: gapB2, tp: plate.t - plate.tc, ReHP: plate.ReH, epp1: { b: gapA, tp: p1.t - p1.tc, ReH: p1.ReH, Flong: 1.1 }, epp2: { b: gapB2, tp: p2.t - p2.tc, ReH: p2.ReH, Flong: 1.1 } }; })(),
          ice: (() => { if (!ship.ice || !['side', 'bilge'].includes(plate.pos)) return null; const bel = iceBelt('frame'); if (!(at.z >= bel.zBot * 1000 && at.z <= bel.zTop * 1000)) return null;
          const trans = sp.g.dir === 'trans' || ship.ice.framing === 'trans';
          return { region: ship.ice.region, s1: spacing / 1000, l: lBdg, m1: sp.g.bracket ? 13.3 : 11.0, trans, m0: ship.ice.m0, tc: ship.ice.tc }; })(), name: sp.name });   // FSICR [9.3]: braket yoksa 11.0, orta açıklık braketi varsa 13.3
      });
      // EPP'ler: profil / PSM kesişimi / yay-düz geçişi sınırlı bölgeler (strake dikişi EPP'yi bölmez);
      //   dikişle kesilen EPP her plaka parçası için ayrı değerlendirilir (kendi t, t_c, R_eH; boyutlar b×a tam EPP'nin) — Nauticus EPP1/EPP2 kopyaları
      const arcCuts = []; ci.items.forEach((it, i) => { if (i > 0 && isArcItem(it) !== isArcItem(ci.items[i - 1])) arcCuts.push(it.start); });
      const bounds = [...new Set([0, ci.L].concat(stPos.map(q => q.x), psmX, arcCuts).map(v => Math.round(v)))].sort((u, v) => u - v);
      const gPlates = plates.filter(p => p.gid === gid);
      let eppN = 0;
      for (let c = 0; c < bounds.length - 1; c++) {
        const xa = bounds[c], xb = bounds[c + 1]; if (xb - xa < 5) continue;
        const stA = stPos.find(q => Math.abs(q.x - xa) < 2), stB = stPos.find(q => Math.abs(q.x - xb) < 2);
        const n0 = s.nodes.find(n => n.id === ci.startNode), mirror = c === 0 && !!n0 && Math.abs(n0.y) < 1 && !stA;   // CL'den başlayan zincir, CL'de profil yok → EPP aynada devam eder
        const ext = mirror ? 2 * (xb - xa) : xb - xa;
        const A0 = M().chainPointAt(s, gid, xa), B0 = M().chainPointAt(s, gid, xb); if (!A0 || !B0) continue;
        eppN++;
        gPlates.filter(p => p.x0 < xb - 1 && p.x1 > xa + 1).forEach((p, pi) => {
          const spanAdj = Math.max(stA && stA.span || 0, stB && stB.span || 0) || null;
          const psm = p.arc ? frameSp : (p.slLoc === 'psm' ? (spanAdj || frameSp) : (spanAdj || M().spanAt(s, gid, (xa + xb) / 2) || s.stiffDefaultSpan || frameSp));   // PSM (döşek / web frame) aralığı = komşu profil açıklığı (büyüğü); yay (bilge): posta aralığı; PSM web: profil varsa açıklığı yoksa posta
          const b = Math.min(ext, psm), a = Math.max(ext, psm), kind = ext <= psm ? 'longStiffened' : 'transStiffened';
          const edge = q => { if (!q) return 1.4; const pr = parseProfile(q.name); return pr ? BK.FlongEdge(pr.type, pr.tw - 1, p.t - p.tc) : 1.0; };
          const Flong = BK.Flong(edge(stA), edge(stB));
          const pa = M().chainPointAt(s, gid, Math.max(xa, p.x0)), pb = M().chainPointAt(s, gid, Math.min(xb, p.x1));
          epps.push({ id: p.id + '/E' + eppN, panel: p.pos, plate: p.id, y0: A0.y, z0: A0.z, y1: B0.y, z1: B0.z, py0: pa ? pa.y : A0.y, pz0: pa ? pa.z : A0.z, py1: pb ? pb.y : B0.y, pz1: pb ? pb.z : B0.z, b, a, kind, tGross: p.t, tc: p.tc, ReH: p.ReH, k: p.k, minLoc: p.minLoc, minAdj: p.minAdj, slC: DNV.plateC((p.slLoc === 'innerBottom' || p.slLoc === 'other') ? 'other' : 'outerShellOrStrengthDeck', L), faces: p.faces,
            Flong, curved: p.arc ? { R0: p.arc.R, d: b, single: true } : null, transverse: kind === 'transStiffened', S: 1, plateZ: [Math.min(p.z0, p.z1), Math.max(p.z0, p.z1)],
            ice: (() => { if (!ship.ice || !['side', 'bilge'].includes(p.pos) || !pa || !pb) return null; const bel = iceBelt('plate'); if (!(Math.max(pa.z, pb.z) >= bel.zBot * 1000 && Math.min(pa.z, pb.z) <= bel.zTop * 1000)) return null;
            return { region: ship.ice.region, s1: b / 1000, longit: kind !== 'transStiffened', tc: ship.ice.tc }; })() });   // buz kuşağı: plaka parçasının z aralığı (Nauticus: kuşak dışındaki plaka kopyasına buz uygulanmaz)
        });
      }
    });
    if (!plates.length) return null;
    // --- kesit özellikleri (net50) + kesme akışı
    const secPlates = plates.map(p => ({ y0: p.y0, z0: p.z0, y1: p.y1, z1: p.z1, t: p.t - 0.5 * p.tc, arc: p.arc }));
    const secStiffs = stiffs.map(st => ({ y: st.y, z: st.z, A: st.hw * (st.tw - 0.5 * st.tcw) + (st.bf || 0) * ((st.tf || 0) - 0.5 * st.tcf) }));
    const sf = SEC.shearFlow(secPlates, secStiffs, { maxDs: 40 });
    const pr = sf.props;
    const Msw = { hog: Math.abs(num('MsDesign', 0)), sag: -Math.abs(num('MsSag', 0)) };
    const Qsw = { pos: Math.abs(num('QsPos', 0)), neg: -Math.abs(num('QsNeg', 0)) };
    const qwv = DNV.Qwv(x, L, B, CB, 1.0);
    const Qwv = lc => { const c = DL.LCF(lc, 1, L).CQW; return DL.fBeta(lc) * c * (c >= 0 ? qwv.pos : Math.abs(qwv.neg)); };
    return { ship, x, xLCP, Bx: B, section: { I_n50: pr.Iy / 1e12, zn_n50: pr.zn / 1000, Iz_n50: pr.Iz / 1e12 }, loads: { Msw, Qsw, Qwv }, qv: (yy, zz) => SEC.qAt(sf, yy, zz, null),
      conditions: conds, tanks, holds, epps, stiffeners: stiffs, plates, props: pr, frameSp };
  }

  // ------------------------------------------------------------ sonuç paneli
  function ensurePanel() {
    let p = $('dnvPanel'); if (p) return p;
    const rc = $('ruleCheckPanel'); if (!rc) return null;
    p = document.createElement('div'); p.id = 'dnvPanel'; p.className = 'ea-panel'; p.style.display = 'none';
    p.innerHTML = `<div class="ea-panel-header" title="DNV RU-SHIP Pt 3 — yerel boyutlandırma (Ch 3 korozyon, Ch 6 min/akma, Ch 8 narinlik/burkulma, Pt 6 Ch 6 buz)">
        <div class="ea-panel-icon warning"></div><span class="ea-panel-title">DNV Rule Check — RU-SHIP Pt 3 (Nauticus eşdeğeri)</span><span class="rulecheck-drawer-status" id="dnvStatus"></span><button type="button" id="dnvCsvBtn" class="ea-header-btn" title="EPP + profil tablolarını CSV olarak indir" style="margin-left:8px">CSV</button><button type="button" id="dnvReportBtn" class="ea-header-btn" title="Markdown rapor indir" style="margin-left:4px">Rapor</button></div>
      <div class="ea-panel-body"><div id="dnvSummary" style="font-size:.7rem;color:var(--text-muted);margin-bottom:6px"></div>
        <div class="ea-table-wrap"><table class="ea-table"><thead><tr><th>EPP</th><th>Panel</th><th>b×a</th><th>t gr</th><th>t_c</th><th>min</th><th>yield</th><th>slend</th><th>buck</th><th>ice</th><th>t_req</th><th>Governing</th><th>OK</th></tr></thead><tbody id="dnvEppBody"></tbody></table></div>
        <div class="ea-table-wrap" style="margin-top:8px"><table class="ea-table"><thead><tr><th>Stiffener</th><th>Panel</th><th>Profile</th><th>s / ℓ</th><th>Z_req net</th><th>Z_act net</th><th>t_w req</th><th>η buck</th><th>Ice Z/A/t_w</th><th>Governing</th><th>OK</th></tr></thead><tbody id="dnvStiffBody"></tbody></table></div>
      </div>`;
    rc.parentNode.insertBefore(p, rc);
    p.querySelector('#dnvCsvBtn').addEventListener('click', ev => { ev.stopPropagation(); download('dnv-check.csv', toCSV(), 'text/csv;charset=utf-8'); });
    p.querySelector('#dnvReportBtn').addEventListener('click', ev => { ev.stopPropagation(); download('dnv-check.md', toReport(), 'text/markdown;charset=utf-8'); });
    return p;
  }
  // ---------------------------------------------------------- dışa aktarma (CSV / Markdown rapor)
  function download(name, text, mime) {
    if (!text) return;
    const blob = new Blob(['\ufeff' + text], { type: mime }), url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
  }
  const csvCell = v => { const t = v == null ? '' : String(v); return /[";\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
  const n2 = v => (v == null || !isFinite(v)) ? '' : (+v).toFixed(2);
  function rowsEPP() {
    if (!last) return [];
    const { model, out } = last;
    return out.epps.map((e, i) => { const m = model.epps[i]; return {
      EPP: e.id, Panel: e.panel, y0: Math.round(m.y0), z0: Math.round(m.z0), y1: Math.round(m.y1), z1: Math.round(m.z1), py0: Math.round(m.py0 != null ? m.py0 : m.y0), pz0: Math.round(m.pz0 != null ? m.pz0 : m.z0), py1: Math.round(m.py1 != null ? m.py1 : m.y1), pz1: Math.round(m.pz1 != null ? m.pz1 : m.z1), b: Math.round(m.b), a: Math.round(m.a), t_gr: e.tGross, t_c: e.tc, ReH: m.ReH,
      t_min_gr: n2(e.tMinNet + e.tc), t_yield_gr: n2(e.tLocNet + e.tc), yield_set: e.yield ? e.yield.set + ' ' + e.yield.lc + ' ' + (e.yield.sw || '') : '', P_yield: e.yield ? n2(e.yield.P) : '', C_a: e.yield ? n2(e.yield.Ca) : '',
      t_slend_gr: n2(e.tSlendNet + e.tc), t_buck_gr: e.tBucNet != null ? n2(e.tBucNet + e.tc) : '', eta_buck: e.buckling ? n2(e.buckling.eta) : '', buck_lc: e.buckling ? e.buckling.lc + ' ' + e.buckling.sw + ' c' + e.buckling.comb : '', buck_sx: e.buckling && e.buckling.inp ? n2(e.buckling.inp.sx) : '', buck_sy: e.buckling && e.buckling.inp ? n2(e.buckling.inp.sy) : '', buck_tau: e.buckling && e.buckling.inp ? n2(e.buckling.inp.tau) : '', buck_psi: e.buckling && e.buckling.inp ? n2(e.buckling.inp.psi_x) : '',
      t_ice_gr: e.tIceGr ? n2(e.tIceGr) : '', t_grab_gr: e.tGrabGr ? n2(e.tGrabGr + e.tc) : '', t_req_gr: e.tReqGr, governing: e.governing, OK: e.isOK ? 'Yes' : 'No' }; });
  }
  function rowsStiff() {
    if (!last) return [];
    const { model, out } = last;
    return out.stiffeners.map((r, i) => { const st = model.stiffeners[i], pl = model.plates.find(q => q.id === st.plateId); const Zact = pl ? zActNet(st, pl.t - (pl.tc + st.tcw) / 2) : NaN; const R5 = v => Math.round((v + st.tcw) * 2) / 2;
      const twReq = R5(Math.max(r.twLocNet, r.twMinNet, r.twSlendNet)); const cand = [['Yield-Z', r.ZReqNet / (Zact || 1)], ['Yield web', R5(r.twLocNet) / st.tw], ['Min web', R5(r.twMinNet) / st.tw], ['Slend web', R5(r.twSlendNet) / st.tw]];
      const ZactIce = pl ? zActGross(st, pl.t) : NaN;
      if (r.buckling) cand.push(['Buckling', r.buckling.eta]); if (r.ice) cand.push(['Ice Z', r.ice.Z / (ZactIce || 1)], ['Ice t_w', r.ice.tw / st.tw]); cand.sort((x, y) => y[1] - x[1]);
      const ok = (r.ZReqNet <= Zact + 1e-6) && twReq <= st.tw + 1e-6 && (!r.buckling || r.buckling.eta <= 1.0) && (!r.ice || (r.ice.Z <= ZactIce + 1e-6 && Math.round(r.ice.tw * 2) / 2 <= st.tw + 1e-6));
      return { Stiffener: r.id, Panel: r.panel, Profile: st.name || st.type + ' ' + st.hw + 'x' + st.tw, y: Math.round(st.y), z: Math.round(st.z), s: Math.round(st.s), l_bdg: n2(st.lBdg), ReH: st.ReH, tc_w: st.tcw,
        Z_req_net: n2(r.ZReqNet), Z_act_net: n2(Zact), yield_set: r.yieldZ ? r.yieldZ.set + ' ' + r.yieldZ.lc : '', P_yield: r.yieldZ ? n2(r.yieldZ.P) : '', C_s: r.yieldZ ? n2(r.yieldZ.Cs) : '',
        tw_req_gr: n2(twReq), tw_gr: st.tw, eta_buck: r.buckling ? (r.buckling.eta >= 99 ? 'inf' : n2(r.buckling.eta)) : '', buck_set: r.buckling ? r.buckling.set + ' ' + r.buckling.lc + ' ' + r.buckling.mode : '', buck_sx: r.buckling ? n2(r.buckling.sx) : '', buck_tau: r.buckling ? n2(r.buckling.tau) : '', buck_P: r.buckling ? n2(r.buckling.P) : '', buck_sa: r.buckling ? n2(r.buckling.sa) : '', static_sets: r.staticSets || '', buck_top: (r.buckTop || []).map(t => t.set + ' ' + t.lc + ' ' + t.sw + ' c' + t.comb + ' ' + t.mode + ' ' + t.eta.toFixed(2)).join(' / '),
        ice_Z: r.ice ? n2(r.ice.Z) : '', ice_A: r.ice ? n2(r.ice.A) : '', ice_tw: r.ice ? n2(r.ice.tw) : '', governing: cand[0][0] + ' (' + (cand[0][1] >= 99 ? 'inf' : n2(cand[0][1])) + ')', OK: ok ? 'Yes' : 'No' }; });
  }
  function toCSV() {
    const E = rowsEPP(), S = rowsStiff(); if (!E.length && !S.length) return '';
    const tab = rows => { const k = Object.keys(rows[0]); return [k.join(';')].concat(rows.map(r => k.map(c => csvCell(r[c])).join(';'))).join('\n'); };
    return '# DNV RU-SHIP Pt 3 check — ' + ($('dnvSummary') ? $('dnvSummary').textContent : '') + '\n# EPP\n' + (E.length ? tab(E) : '') + '\n\n# Stiffeners\n' + (S.length ? tab(S) : '') + '\n';
  }
  function toReport() {
    if (!last) return '';
    const { model } = last, sh = model.ship, E = rowsEPP(), S = rowsStiff();
    const md = rows => { const k = Object.keys(rows[0]); return '| ' + k.join(' | ') + ' |\n|' + k.map(() => '---').join('|') + '|\n' + rows.map(r => '| ' + k.map(c => String(r[c] == null ? '' : r[c]).replace(/\|/g, '/')).join(' | ') + ' |').join('\n'); };
    const bad = E.filter(r => r.OK === 'No').length + S.filter(r => r.OK === 'No').length;
    return '# DNV RU-SHIP Pt 3 — yerel boyutlandırma kontrolü\n\n' + new Date().toISOString().slice(0, 10) + ' · Midship Scantling (DNV motoru: Ch 3 korozyon, Ch 4 yükler, Ch 5 hull girder, Ch 6 min/akma, Ch 8 + CG-0128 burkulma, Pt 6 Ch 6 buz)\n\n' +
      '## Gemi\n\n| L | B | D | T_SC | T_BAL | C_B | V | Tip |\n|---|---|---|---|---|---|---|---|\n| ' + [sh.L, sh.B, sh.D, sh.TSC, sh.TBAL, sh.CB, sh.V, sh.type || ''].join(' | ') + ' |\n\n' +
      ($('dnvSummary') ? $('dnvSummary').textContent + '\n\n' : '') + '**Sonuç:** ' + (bad ? bad + ' eleman yetersiz (No!)' : 'tüm elemanlar OK') + '\n\n' +
      '## Plakalar (EPP)\n\n' + (E.length ? md(E) : '-') + '\n\n## Profiller\n\n' + (S.length ? md(S) : '-') + '\n';
  }
  // profil net kesit modülü (bağlı plaka s genişliğinde, net kalınlıklar) — plaka dış yüzü ve flanş ucu; küçük olan
  function zActNet(st, tp) {                                                              // Ch 3 Sec 7 [1.3.1] b_eff = min(200·ℓ_bdg, s) (t_p < 8 → ≤ 600); [1.4.4] Z serbest kenar/flanş
    const tw = st.tw - st.tcw, tf = (st.tf || 0) - (st.tcf || 0), hw = st.hw - (st.type === 'L' || st.type === 'T' ? 0 : 0), bf = st.bf || 0;
    let beff = Math.min(200 * (st.lBdg || 0) || st.s, st.s); if (tp < 8) beff = Math.min(beff, 600);
    const Aw = hw * tw, Af = st.type === 'FB' ? 0 : bf * tf, Ap = beff * tp;
    const zw = tp / 2 + hw / 2, zf = tp / 2 + hw + (st.type === 'FB' ? 0 : tf / 2);
    const A = Aw + Af + Ap, zna = (Aw * zw + Af * zf) / A;
    const I = tw * Math.pow(hw, 3) / 12 + Aw * Math.pow(zw - zna, 2) + (Af ? bf * Math.pow(tf, 3) / 12 + Af * Math.pow(zf - zna, 2) : 0) + beff * Math.pow(tp, 3) / 12 + Ap * zna * zna;
    const zTop = tp / 2 + hw + (st.type === 'FB' ? 0 : tf);
    return I / (zTop - zna) / 1000;
  }
  // buz (FSICR / Pt 6 Ch 6) kesit modülü BRÜT: Nauticus ice Z_act = brüt tw, tp, b_eff = min(200ℓ, s) (ref. kesit: 55,2 / 199,9 birebir)
  function zActGross(st, tp) {
    const tw = st.tw, tf = st.tf || 0, hw = st.hw, bf = st.bf || 0;
    let beff = Math.min(200 * (st.lBdg || 0) || st.s, st.s);
    const Aw = hw * tw, Af = st.type === 'FB' ? 0 : bf * tf, Ap = beff * tp;
    const zw = tp / 2 + hw / 2, zf = tp / 2 + hw + (st.type === 'FB' ? 0 : tf / 2);
    const A = Aw + Af + Ap, zna = (Aw * zw + Af * zf) / A;
    const I = tw * Math.pow(hw, 3) / 12 + Aw * Math.pow(zw - zna, 2) + (Af ? bf * Math.pow(tf, 3) / 12 + Af * Math.pow(zf - zna, 2) : 0) + beff * Math.pow(tp, 3) / 12 + Ap * zna * zna;
    return I / (tp / 2 + hw + (st.type === 'FB' ? 0 : tf) - zna) / 1000;
  }
  const f1 = v => (v == null || !isFinite(v)) ? '–' : (Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(1));
  const f2 = v => (v == null || !isFinite(v)) ? '–' : v.toFixed(2);
  function render(model, out) {
    const p = ensurePanel(); if (!p) return;
    p.style.display = '';
    const eb = $('dnvEppBody'), sb = $('dnvStiffBody'); let bad = 0;
    eb.innerHTML = out.epps.map((e, i) => { const m = model.epps[i]; if (!e.isOK) bad++;
      return `<tr class="${e.isOK ? '' : 'fail'}"><td>${e.id}</td><td>${e.panel}</td><td>${Math.round(m.b)}×${Math.round(m.a)}</td><td>${f1(e.tGross)}</td><td>${f1(e.tc)}</td><td>${f2(e.tMinNet + e.tc)}</td><td title="${e.yield ? e.yield.set + ' ' + e.yield.lc + ' ' + (e.yield.sw || '') + ' P=' + f1(e.yield.P) + ' C_a=' + f2(e.yield.Ca) : ''}">${f2(e.tLocNet + e.tc)}</td><td>${f2(e.tSlendNet + e.tc)}</td><td title="${e.buckling ? 'η=' + f2(e.buckling.eta) + ' ' + e.buckling.lc + ' c' + e.buckling.comb : ''}">${f2(e.tBucNet + e.tc)}</td><td>${e.tIceGr ? f2(e.tIceGr) : '–'}</td><td><b>${f1(e.tReqGr)}</b></td><td>${e.governing}</td><td>${e.isOK ? '✓' : '<b>No!</b>'}</td></tr>`; }).join('');
    sb.innerHTML = out.stiffeners.map((r, i) => { const st = model.stiffeners[i], pl = model.plates.find(q => q.id === st.plateId); const Zact = pl ? zActNet(st, pl.t - (pl.tc + st.tcw) / 2) : NaN;
      // brüt web gereklilikleri en yakın 0,5 mm'ye yuvarlanır (Nauticus; Ch 3 Sec 2)
      const R5 = v => Math.round((v + st.tcw) * 2) / 2;
      const twGr = st.tw, ok = (r.ZReqNet <= Zact + 1e-6) && (R5(r.twLocNet) <= twGr + 1e-6) && (R5(r.twMinNet) <= twGr + 1e-6) && (R5(r.twSlendNet) <= twGr + 1e-6) && (!r.buckling || r.buckling.eta <= 1.0) && (!r.ice || (r.ice.Z <= zActGross(st, pl ? pl.t : st.tw) + 1e-6 && Math.round(r.ice.tw * 2) / 2 <= twGr + 1e-6));
      if (!ok) bad++;
      const cand = [['Yield-Z', r.ZReqNet / (Zact || 1)], ['Yield-shear', R5(r.twLocNet) / twGr], ['Min web', R5(r.twMinNet) / twGr], ['Slend web', R5(r.twSlendNet) / twGr]];
      if (r.buckling) cand.push(['Buckling', r.buckling.eta]); if (r.ice) cand.push(['Ice Z', r.ice.Z / (zActGross(st, pl ? pl.t : st.tw) || 1)], ['Ice t_w', r.ice.tw / twGr]);
      cand.sort((a, b) => b[1] - a[1]);
      return `<tr class="${ok ? '' : 'fail'}"><td>${r.id}</td><td>${r.panel}</td><td>${st.name || st.type + ' ' + st.hw + 'x' + st.tw}</td><td>${Math.round(st.s)} / ${f2(st.lBdg)}</td><td title="${r.yieldZ ? r.yieldZ.set + ' ' + r.yieldZ.lc + ' P=' + f1(r.yieldZ.P) + ' C_s=' + f2(r.yieldZ.Cs) : ''}">${f1(r.ZReqNet)}</td><td>${f1(Zact)}</td><td>${f1(R5(Math.max(r.twLocNet, r.twMinNet, r.twSlendNet)))}</td><td>${r.buckling ? (r.buckling.eta >= 99 ? '∞' : f2(r.buckling.eta)) : '–'}</td><td>${r.ice ? f1(r.ice.Z) + ' / ' + f1(r.ice.A) + ' / ' + f1(r.ice.tw) : '–'}</td><td>${cand[0][0]} (${cand[0][1] >= 99 ? '∞' : f2(cand[0][1])})</td><td>${ok ? '✓' : '<b>No!</b>'}</td></tr>`; }).join('');
    const pr = model.props;
    $('dnvSummary').textContent = `x = ${model.x.toFixed(2)} m · ${out.epps.length} EPP, ${out.stiffeners.length} profil · net50: A ${(pr.A / 100).toFixed(0)} cm², z_n ${(pr.zn / 1000).toFixed(3)} m, I_y ${(pr.Iy / 1e12).toFixed(3)} m⁴, I_z ${(pr.Iz / 1e12).toFixed(3)} m⁴ · M_sw ${f1(model.loads.Msw.hog)}/${f1(model.loads.Msw.sag)} kNm · T_BAL ${model.ship.TBAL.toFixed(2)} m · tanks ${Object.keys(model.tanks).length}, holds ${Object.keys(model.holds).length}`;
    $('dnvStatus').textContent = bad ? bad + ' No!' : 'all OK';
    $('dnvStatus').className = 'rulecheck-drawer-status ' + (bad ? 'fail' : 'ok');
  }
  let last = null;
  let lastError = null;
  function refresh() {
    ensureInputs(); ensureMswGuidance();
    const iceOnEl = $('iceEnabledOn'), rulesStatus = $('rulesIceStatus');   // Applicable Rules ayna metni — her recalc'ta taze (proje yüklendikten sonra da doğru)
    if (rulesStatus) rulesStatus.textContent = (iceOnEl && iceOnEl.checked) ? 'Enabled (FSICR) — see Ice Class page' : 'Disabled — see Ice Class page';
    const on = isDNV();
    document.querySelectorAll('.dnv-only').forEach(el => { el.style.display = on ? '' : 'none'; });
    // Applicable Rules: hangi notasyon hangi kural setinde gerçekten var (ClauseFinder LR Ships / BV NR467 / DNV RU-SHIP taraması) — data-rules yoksa üçünde de geçerli, her zaman görünür
    const socRaw = ($('classificationSociety') || {}).value || '';
    const socKey = socRaw === 'DNV' ? 'dnv' : socRaw === 'Bureau Veritas' ? 'bv' : socRaw === "Lloyd's Register" ? 'lr' : null;
    document.querySelectorAll('[data-rules]').forEach(el => { const list = (el.dataset.rules || '').split(/\s+/); el.style.display = (!socKey || list.indexOf(socKey) >= 0) ? '' : 'none'; });
    if (on) updateMswGuidance();
    const p = $('dnvPanel'); if (!on) { if (p) p.style.display = 'none'; return null; }
    if (!window.DNVCheck) return null;
    try {
      const model = buildModel(); if (!model) { if (p) p.style.display = 'none'; return null; }
      const out = window.DNVCheck.run(model); last = { model, out }; render(model, out); return last;
    } catch (e) { console.warn('[DNV] check failed', e); lastError = String(e && e.stack || e); return null; }
  }
  document.addEventListener('DOMContentLoaded', () => { ensureInputs(); ensureMswGuidance(); const sel = $('classificationSociety'); if (sel) sel.addEventListener('change', () => setTimeout(refresh, 0)); setTimeout(refresh, 500); });
  // headless test kancasi: ?dnvsetexample=1 → ornek gemi bayragi ; ?dnvtest=1 → DNV modu + sonucu #dnvTestOut'a JSON yaz
  try {
    const q = new URLSearchParams(location.search);
    if (q.get('dnvsetexample')) { localStorage.setItem('midship_project_v1:example', '1'); localStorage.removeItem('midship_project_v1'); document.title = 'dnv-example-set'; }
    if (q.get('dnvbuildlive')) setTimeout(() => {  // M15 elle çizim provası: referans kesiti SectionModel.addLine/addArc ile (çizim aracının kullandığı BİREBİR fonksiyonlar) kurar; _dev/dnv-ref/dnv-sample-project.json'dan tablo verisi alır
    function setVal(id, v) {
      const el = document.getElementById(id); if (!el) return false;
      const proto = el.tagName === 'SELECT' ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
      el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }
    async function run() {
    const out = { errors: [] };
    try {
      const j = await fetch('/_dev/dnv-ref/dnv-sample-project.json').then(r => r.json());
      const fv = j.formValues, pdSrc = j.SECTIONS.items[0].panelData;

      // 1) sınıflandırma DNV
      setVal('classificationSociety', 'DNV');

      // 2) geometri: çizim aracının addLine/addArc'ı — referans kesit, nokta nokta
      let m = { id: 'S1', manual: true, nodes: [], panels: [], groups: {}, panelData: {}, frame: null, isMidship: true };
      const SM = window.SectionModel;
      const L = (a, b, opts) => { m = SM.addLine(m, a, b, opts || {}); };
      const A = (a, b, r, opts) => { m = SM.addArc(m, a, b, r, opts || {}); };
      L({ y: 0, z: 0 }, { y: 890, z: 0 }, { position: 'bottom' });
      L({ y: 890, z: 0 }, { y: 3650, z: 0 }, { position: 'bottom' });
      L({ y: 3650, z: 0 }, { y: 7100, z: 0 }, { position: 'bottom' });
      A({ y: 7100, z: 0 }, { y: 8600, z: 1200 }, 2676, { position: 'bilge' });
      L({ y: 8600, z: 1200 }, { y: 8600, z: 9800 }, { position: 'side' });
      L({ y: 0, z: 1200 }, { y: 890, z: 1200 }, { position: 'innerBottom' });
      L({ y: 890, z: 1200 }, { y: 3650, z: 1200 }, { position: 'innerBottom' });
      L({ y: 3650, z: 1200 }, { y: 7100, z: 1200 }, { position: 'innerBottom' });
      L({ y: 7100, z: 1200 }, { y: 8600, z: 1200 }, { position: 'innerBottom' });
      L({ y: 7100, z: 0 }, { y: 7100, z: 1200 }, { position: 'innerSide' });
      L({ y: 7100, z: 1200 }, { y: 7100, z: 9800 }, { position: 'innerSide' });
      L({ y: 7100, z: 9800 }, { y: 7100, z: 12000 }, { position: 'coaming' });
      L({ y: 890, z: 0 }, { y: 890, z: 1200 }, { position: 'centreGirder' });
      L({ y: 3650, z: 0 }, { y: 3650, z: 1200 }, { position: 'sideGirder' });
      L({ y: 7100, z: 9800 }, { y: 8600, z: 9800 }, { position: 'upperDeck' });
      window.Draw.setSection(m);
      m = window.Draw.getSection();
      // iç dip ambar tarafı: yayılı yük UDL-1 P_dl-s 2,5 / UDL-2 statik 255,06 (dnv-sample-project.json'daki gibi, panel düzeyinde)
      m.panels.forEach(pn => { if (pn.position !== 'innerBottom') return; const b1 = m.nodes.find(n => n.id === pn.from), b2 = m.nodes.find(n => n.id === pn.to); if (b1 && b2 && Math.max(b1.y, b2.y) <= 7100) pn.deckLoad = { type: 'udl', p: 2.5, p2: 255.06 }; });
      window.Draw.setSection(m);
      out.geometry = { panels: m.panels.length, nodes: m.nodes.length, groups: m.groups };

      // 3) strakes + profiller: üretilen projeden (grup ID'leri role bazlı, örtüşüyor)
      const M = SM;
      Object.keys(pdSrc).forEach(gid => {
        const d = M.panelData(m, gid); const ci = M.chainInfo(m, gid);
        const strakes = pdSrc[gid].strakes.map(x => ({ len: x.len, t: x.t, grade: x.grade, type: 'ordinary', hole: null }));
        const sum = strakes.reduce((a, x) => a + x.len, 0);
        if (Math.abs(sum - ci.L) > 1 && strakes.length) strakes[strakes.length - 1].len += Math.round(ci.L - sum);
        d.strakes = strakes;
        d.stiffGroups = JSON.parse(JSON.stringify(pdSrc[gid].stiffGroups));
      });
      window.Draw.setSection(m);

      // 4) form alanları + kompartımanlar
      ['L', 'B', 'D', 'Cb', 'sectionXL', 'T', 'shipType', 'MsDesign', 'MsSag', 'QsPos', 'QsNeg', 'transFrameSpacing', 'dnv_TBAL', 'dnv_xLcpOffset',
       'material', 'steelFamily', 'ice_T_uiwl', 'ice_T_liwl', 'ice_Disp', 'ice_P0', 'ice_framing', 'iceClass',
       'bvLoadLineLength', 'bvFreeboardType', 'compartmentsJson'].forEach(id => { if (id in fv) setVal(id, fv[id]); });
      const iceOn = document.getElementById('iceEnabledOn');
      if (iceOn) { iceOn.checked = !!fv.iceEnabledOn; iceOn.dispatchEvent(new Event('change', { bubbles: true })); }
      if (window.ShipComps && window.ShipComps.reload) window.ShipComps.reload();

      // 5) hesapla
      const r = window.DNVUI.refresh();
      out.hasResult = !!r; out.dnvError = window.DNVUI.lastError;
      out.status = (document.getElementById('dnvStatus') || {}).textContent;
      out.summary = (document.getElementById('dnvSummary') || {}).textContent;

      // 6) CSV (gerçek #dnvCsvBtn akışı — Blob yakala)
      let captured = null; const origCreate = URL.createObjectURL;
      URL.createObjectURL = function (b) { captured = b; return origCreate.call(URL, b); };
      const btn = document.getElementById('dnvCsvBtn'); if (btn) btn.click();
      URL.createObjectURL = origCreate;
      out.csv = captured ? await captured.text() : null;

      if (q.get('dnvbuildshot')) { const p = document.getElementById('dnvPanel'); if (p) { document.body.prepend(p); p.style.cssText = 'display:block;position:relative;z-index:9999;background:#fff;max-width:1380px'; } }
    } catch (e) { out.errors.push(String(e.stack || e)); }
    const pre = document.createElement('pre'); pre.id = 'dnvLiveOut'; pre.textContent = JSON.stringify(out); document.body.appendChild(pre);
    }
    run();
    }, 500);
    if (q.get('dnvuitest')) setTimeout(() => {   // headless UI duman testi: kompartıman/profil/güverte editörlerinin yeni DNV alanları hatasız render oluyor mu (M14/M15)
      const out = { errors: [] };
      const tryStep = (name, fn) => { try { fn(); } catch (e) { out.errors.push(name + ': ' + (e.stack || e)); } };
      const sec = D() && D().getSection ? D().getSection() : null;
      tryStep('compartments-heavy', () => {
        D().setViewMode('compartments');
        let c = window.ShipComps.list().find(x => x.type === 'dryBulk');
        const cid = c ? c.id : window.ShipComps.add({ type: 'dryBulk', frFrom: null, frTo: null, y0: 0, y1: 1000, z0: 1000, z1: 5000 });
        window.ShipComps.update(cid, { heavyLoaded: true, heavyRho: 2.5, holdZc_mm: 4500 });
        SectionCAD.renderPanel();
        let ec = document.getElementById('edContent');
        const row = ec && ec.querySelector('[data-row="' + cid + '"]'); if (row) row.click();
        SectionCAD.renderPanel();
        ec = document.getElementById('edContent');
        out.compHtmlLen = ec ? ec.innerHTML.length : -1;
        out.hasHeavyCheckbox = !!(ec && ec.querySelector('.cp-heavy'));
        out.hasHoldZc = !!(ec && ec.querySelector('[data-k="holdZc_mm"]'));
        const cb = ec && ec.querySelector('.cp-heavy');
        if (cb) { out.heavyCheckedBefore = cb.checked; cb.checked = false; cb.dispatchEvent(new Event('change')); }
        SectionCAD.renderPanel(); ec = document.getElementById('edContent');
        const cb2 = ec && ec.querySelector('.cp-heavy'); out.heavyUncheckWorked = cb2 ? !cb2.checked : null;
        out.heavyLoadedAfter = window.ShipComps.get(cid).heavyLoaded;
      });
      tryStep('deckload-p2', () => {
        D().setViewMode('compartments');
        SectionCAD.renderPanel();
        const ec = document.getElementById('edContent');
        out.hasDlP2 = !!(ec && ec.querySelector('.dl-p2'));
      });
      tryStep('stiffeners-bracket', () => {
        D().setViewMode('stiffeners');
        SectionCAD.renderPanel();
        const ec = document.getElementById('edContent');
        const sgRow = ec && ec.querySelector('[data-sg]');
        if (sgRow) { sgRow.click(); }
        SectionCAD.renderPanel();
        out.hasBracket = !!(document.getElementById('edContent') && document.getElementById('edContent').querySelector('[data-k="bracket"]'));
      });
      const pre = document.createElement('pre'); pre.id = 'dnvUiTest'; pre.textContent = JSON.stringify(out); document.body.appendChild(pre);
    }, 1500);
    if (q.get('dnvmsshot')) setTimeout(() => {
      window.ProjectTree.goTo(1, 'frames');
      const FT = window.ProjectTree.FrameTable;
      const t = FT.read();
      if (!t.rows.length) { t.rows = [{ from: t.f0 || 0, to: (t.f0 || 0) + 40, s: 749, wf: 4 }, { from: (t.f0 || 0) + 40, to: (t.f0 || 0) + 200, s: 726, wf: 3 }]; FT.write(t); }
      const MS = window.ProjectTree.MainStruct;
      const ms = MS.read();
      if (!Object.keys(ms.marks).length) { [3, 17, 32, 40, 44, 48, 52].forEach((f, i) => { ms.marks[f] = { bhd: i < 3, wf: i >= 3 }; }); MS.write(ms); }
      window.ProjectTree.goTo(1, 'mainstruct');
      document.title = 'msshot-ready';
    }, 3500);
    if (q.get('dnvftshot')) setTimeout(() => {
      window.ProjectTree.goTo(1, 'frames');
      const FT = window.ProjectTree.FrameTable;
      const t = FT.read();
      if (!t.rows.length) { t.rows = [{ from: t.f0 || 0, to: (t.f0 || 0) + 40, s: 749, wf: 4 }, { from: (t.f0 || 0) + 40, to: (t.f0 || 0) + 200, s: 726, wf: 3 }]; FT.write(t); }
      FT.render();
      document.title = 'ftshot-ready';
    }, 3500);
    if (q.get('dnvfttest')) setTimeout(() => {
      const before = window.DNVUI.refresh();
      const beforeSp = before ? before.out.epps.find(e => e.buckling)?.tBucNet : null;
      const FT = window.ProjectTree.FrameTable;
      const t = FT.read();
      t.rows = [{ from: t.f0 || 0, to: (t.f0 || 0) + 200, s: 749, wf: 4 }];
      t.x0 = 0;
      FT.write(t); FT.render(); FT.syncSection();
      const after = window.DNVUI.refresh();
      const out = { beforeSummary: before ? before.summary : null, afterSummary: after ? (document.getElementById('dnvSummary')||{}).textContent : null,
        webSpacingAtX_before_wf: FT.webSpacingAtX(57490), status: (document.getElementById('dnvStatus')||{}).textContent, error: window.DNVUI.lastError };
      const pre = document.createElement('pre'); pre.id = 'dnvFtTest'; pre.textContent = JSON.stringify(out); document.body.appendChild(pre);
    }, 4500);
    if (q.get('dnvmswtest')) setTimeout(() => {
      const cs = document.getElementById('classificationSociety');
      Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set.call(cs, 'DNV');
      cs.dispatchEvent(new Event('change', { bubbles: true }));
      window.DNVUI.refresh();
      const el = document.getElementById('dnvMswGuide');
      const out = { value: el ? el.value : null, visible: el ? (el.closest('.ea-field').style.display !== 'none') : null,
        L: document.getElementById('L').value, sectionXL: document.getElementById('sectionXL').value };
      const pre = document.createElement('pre'); pre.id = 'dnvMswTest'; pre.textContent = JSON.stringify(out); document.body.appendChild(pre);
    }, 3000);
    if (q.get('dnvstepshot')) setTimeout(() => { if (window.goToStep) window.goToStep(parseInt(q.get('dnvstepshot'))); document.title = 'step-ready'; }, 1500);
    if (q.get('dnvviewshot')) setTimeout(() => {   // ?dnvviewshot=main gibi — istenen sekmeye gider, ekran görüntüsü için
      const cs = document.getElementById('classificationSociety');
      Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set.call(cs, 'DNV');
      cs.dispatchEvent(new Event('change', { bubbles: true }));
      window.ProjectTree.goTo(1, q.get('dnvviewshot'));
      document.title = 'view-ready';
    }, 2500);
    if (q.get('dnvrulesshot')) setTimeout(() => {
      const cs = document.getElementById('classificationSociety');
      Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set.call(cs, q.get('dnvrulesshot') === 'lr' ? "Lloyd's Register" : q.get('dnvrulesshot') === 'bv' ? 'Bureau Veritas' : 'DNV');
      cs.dispatchEvent(new Event('change', { bubbles: true }));
      window.ProjectTree.goTo(1, 'rules');
      document.title = 'rules-ready';
    }, 2500);
    if (q.get('dnvcompshot')) setTimeout(() => {
      if (window.goToPage) window.goToPage(3);
      window.Draw.setViewMode('compartments');
      const c = window.ShipComps.list().find(x => x.type === 'dryBulk');
      if (c) { window.ShipComps.update(c.id, { grabQualifier: '3-X' }); }
      SectionCAD.renderPanel();
      const ec = document.getElementById('edContent');
      const row = c && ec && ec.querySelector('[data-row="' + c.id + '"]'); if (row) row.click();
      SectionCAD.renderPanel();
      const p = document.getElementById('edContent'); if (p) { document.body.innerHTML = ''; document.body.appendChild(p); p.style.cssText = 'display:block;position:static;background:#fff;width:900px;padding:12px;font-size:13px'; }
      document.title = 'compshot-ready';
    }, 4500);
    if (q.get('dnvgrabtest')) setTimeout(() => {
      const c = window.ShipComps.list().find(x => x.type === 'dryBulk');
      const out = { before: null, after: null };
      let r = window.DNVUI.refresh();
      const ibBefore = r.out.epps.find((e, i) => r.model.epps[i].panel === 'innerBottom' && !e.tGrabGr);
      out.before = ibBefore ? { id: ibBefore.id, tReqGr: ibBefore.tReqGr, gov: ibBefore.governing } : null;
      if (c) window.ShipComps.update(c.id, { grabQualifier: '3-X', grabMGR: null });
      r = window.DNVUI.refresh();
      const ibAfter = r.out.epps.find(e => ibBefore && e.id === ibBefore.id);
      out.after = ibAfter ? { id: ibAfter.id, tReqGr: ibAfter.tReqGr, gov: ibAfter.governing, tGrabGr: ibAfter.tGrabGr } : null;
      out.grabRows = r.out.epps.filter(e => e.tGrabGr).map(e => ({ id: e.id, tGrabGr: +e.tGrabGr.toFixed(2), gov: e.governing }));
      const pre = document.createElement('pre'); pre.id = 'dnvGrabTest'; pre.textContent = JSON.stringify(out); document.body.appendChild(pre);
    }, 4500);
    if (q.get('dnvfbtest')) setTimeout(() => {
      const setVal = (id, v) => { const el = document.getElementById(id); if (!el) return; const proto = el.tagName === 'SELECT' ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v); el.dispatchEvent(new Event('change', { bubbles: true })); };
      setVal('sectionXL', '0.9');
      const out = {};
      ['A', 'B'].forEach(fb => { setVal('bvFreeboardType', fb); const r = window.DNVUI.refresh(); const m = r.model.epps.find(e => e.faces && e.faces.some(f => f.kind === 'sea' && f.deck)); out[fb] = m ? { panel: m.panel, tReqGr: r.out.epps[r.model.epps.indexOf(m)].tReqGr } : null; });
      const pre = document.createElement('pre'); pre.id = 'dnvFbTest'; pre.textContent = JSON.stringify(out); document.body.appendChild(pre);
    }, 4500);
    if (q.get('dnviceregtest')) setTimeout(() => {
      const sel = document.getElementById('dnv_iceRegion'); if (sel) { sel.value = q.get('dnviceregtest').replace(/-trans$/, ''); sel.dispatchEvent(new Event('change', { bubbles: true })); }
      if (q.get('dnviceregtest').endsWith('-trans')) { const s0 = window.Draw.getSection(); Object.keys(s0.groups || {}).forEach(g => { const d = window.SectionModel.panelData(s0, g); (d.stiffGroups || []).forEach(sg => { sg.dir = 'trans'; }); }); window.Draw.setSection(s0); }
      const r = window.DNVUI.refresh();
      const out = { region: sel ? sel.value : null, status: (document.getElementById('dnvStatus')||{}).textContent, summary: (document.getElementById('dnvSummary')||{}).textContent, error: window.DNVUI.lastError };
      if (r) {
        const iceEpp = r.out.epps.filter(e => e.ice).map(e => ({ id: e.id, P: +e.ice.P.toFixed(1), t: +e.ice.t.toFixed(2) }));
        const iceSt = r.out.stiffeners.filter(t => t.ice).map(t => ({ id: t.id, P: +t.ice.P.toFixed(1), Z: +t.ice.Z.toFixed(1) }));
        out.iceEppCount = iceEpp.length; out.iceStCount = iceSt.length; out.iceEppSample = iceEpp.slice(0,3); out.iceStSample = iceSt.slice(0,3);
      }
      const pre = document.createElement('pre'); pre.id = 'dnvIceRegTest'; pre.textContent = JSON.stringify(out); document.body.appendChild(pre);
    }, 4500);
    if (q.get('dnvdumpsec')) setTimeout(() => { const sec = D() && D().getSection ? D().getSection() : null; const pre = document.createElement('pre'); pre.id = 'dnvSec'; pre.textContent = JSON.stringify(sec ? { id: sec.id, manual: sec.manual, groups: sec.groups, panelData: sec.panelData, panels: sec.panels.map(p => [p.id, p.from, p.to, p.position, p.group, !!p.curve]), nodes: sec.nodes, sections: window.Sections ? Sections.list() : null, strakesKeys: Object.keys((D() && D().STRAKES) || {}).map(k => k + ':' + ((D().STRAKES[k] || []).length)), legacyKeys: Object.keys(sec.groups || {}).map(g => g + '=' + (window.SectionAdapter && SectionAdapter.legacyKeyOfGroup ? SectionAdapter.legacyKeyOfGroup(sec, g) : '?')) } : null); document.body.appendChild(pre); }, 4500);
    if (q.get('dnvdump')) setTimeout(() => { const o = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); o[k] = localStorage.getItem(k); } const pre = document.createElement('pre'); pre.id = 'dnvDump'; pre.textContent = JSON.stringify(o); document.body.appendChild(pre); }, 4500);
    if (q.get('dnvloadurl')) { fetch(q.get('dnvloadurl')).then(r => r.text()).then(t => { const o = JSON.parse(t); if (o.midship_project_v1) Object.keys(o).forEach(k => localStorage.setItem(k, typeof o[k] === 'string' ? o[k] : JSON.stringify(o[k]))); else localStorage.setItem('midship_project_v1', t); localStorage.removeItem('midship_project_v1:example'); document.title = 'dnv-loaded-url'; const pre = document.createElement('pre'); pre.id = 'dnvLoaded'; pre.textContent = 'loaded ' + t.length; document.body.appendChild(pre); }).catch(e => { const pre = document.createElement('pre'); pre.id = 'dnvLoaded'; pre.textContent = 'ERR ' + e; document.body.appendChild(pre); }); }
    if (q.get('dnvload')) { try { const raw = q.get('dnvload'); const o = JSON.parse(decodeURIComponent(raw)); Object.keys(o).forEach(k => localStorage.setItem(k, o[k])); document.title = 'dnv-loaded'; } catch (e) { console.warn('dnvload', e); } }
    if (q.get('dnvtest')) setTimeout(() => {
      const out = document.createElement('pre'); out.id = 'dnvTestOut'; document.body.appendChild(out);
      try {
        const sel = $('classificationSociety'); if (sel) sel.value = 'DNV';
        const r = refresh();
        const s = D() && D().getSection ? D().getSection() : null;
        out.textContent = JSON.stringify({ panels: s ? s.panels.length : null, comps: window.ShipComps ? ShipComps.list().map(c => c.name + ':' + c.type) : null,
          res: r ? { epps: r.out.epps.length, stiffs: r.out.stiffeners.length, tanks: Object.keys(r.model.tanks), holds: Object.keys(r.model.holds), props: r.model.props, summary: $('dnvSummary').textContent, status: $('dnvStatus').textContent, csvLen: toCSV().length, reportLen: toReport().length, csv: toCSV(), csvHead: toCSV().split('\n').slice(0, 4).join('\n'),
            plates: r.model.plates.map(p => [p.id, p.pos, Math.round(p.x0), Math.round(p.x1), p.t, p.tc, p.sides.join('/'), p.cFaces.join('/'), p.faces.map(f => f.kind + (f.coaming ? '(c)' : '')).join(','), p.minLoc, !!p.arc]),
            epps: r.out.epps.map(e => [e.id, e.panel, e.tGross, e.tc, +e.tMinNet.toFixed(2), +e.tLocNet.toFixed(2), +e.tSlendNet.toFixed(2), +(e.tBucNet || 0).toFixed(2), e.tReqGr, e.governing, e.yield && e.yield.set + ' ' + e.yield.lc, e.isOK ? 1 : 0]),
            outliers: r.out.epps.filter(e => e.buckling && e.tBucNet > e.tLocNet + 3).map(e => { const m = r.model.epps.find(q => q.id === e.id); const i = e.buckling.inp; return { id: e.id, panel: e.panel, y0: m.y0, z0: m.z0, y1: m.y1, z1: m.z1, b: m.b, a: m.a, kind: m.kind, Flong: m.Flong, curved: !!m.curved, eta: +e.buckling.eta.toFixed(3), lc: e.buckling.lc + ' ' + e.buckling.sw + ' c' + e.buckling.comb, sx: +i.sx.toFixed(1), sy: +i.sy.toFixed(1), tau: +i.tau.toFixed(1), psi_x: +i.psi_x.toFixed(3), tp: i.tp, tBuc: +e.tBucNet.toFixed(2) }; }),
            stiffs: r.out.stiffeners.map((t, i) => { const st = r.model.stiffeners[i], pl = r.model.plates.find(q => q.id === st.plateId); const Za = pl ? zActNet(st, pl.t - (pl.tc + st.tcw) / 2) : NaN;
              return [t.id, t.panel, st.name, Math.round(st.s), +t.ZReqNet.toFixed(1), +Za.toFixed(1), +(t.twLocNet + st.tcw).toFixed(2), +(t.twMinNet + st.tcw).toFixed(2), +(t.twSlendNet + st.tcw).toFixed(2), st.tw, t.buckling ? +t.buckling.eta.toFixed(3) : null, t.yieldZ && t.yieldZ.set + ' ' + t.yieldZ.lc + ' P=' + t.yieldZ.P.toFixed(0), t.buckling && t.buckling.eta >= 50 ? Object.assign({ hw: st.hw, tw: st.tw, s: st.s, l: st.lBdg, z: st.z, y: st.y, ReH: st.ReH }, t.buckling) : null]; }) } : { error: lastError } });
      } catch (e) { out.textContent = 'ERR ' + (e.stack || e); }
      if (q.get('dnvshot')) { const p = $('dnvPanel'); if (p) { document.body.prepend(p); p.style.cssText = 'display:block;position:relative;z-index:9999;background:#fff;max-width:1380px'; } }
    }, 4000);
  } catch (_) {}
  window.DNVUI = { refresh, buildModel, get last() { return last; }, parseProfile };
})();
