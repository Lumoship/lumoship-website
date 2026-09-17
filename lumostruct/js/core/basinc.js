        // ============== BASINC YUKU (plaka yuku -> kiris hat yuku) ==============
        //
        // model.pressure[i] = { x1, y1, x2, y2 (m), z (m, istege bagli: kot),
        //                       value (kN/m2, + = asagi), case, tasima: 'auto'|'X'|'Y',
        //                       ad }
        //
        // Eski cozucu basinci dugumlere TOPLU kuvvet olarak dagitiyordu: kiris
        // acikligina yayili yuk dusmuyor, acik ortasinda moment SIFIR cikiyordu
        // - guverte basinci icin dogrudan yanlis. Gemi yapisinda plaka yuku
        // takviyelere KENDI ARALIKLARI kadar seritle gecer (DNV/BV: yuk
        // genisligi s = takviye araligi). Burada da oyle:
        //
        //   q = p * b_trib,   b_trib = iki komsu paralel kirise olan yarim
        //                     uzakliklarin toplami (yamada kenarinda yamanin
        //                     sinirina kadar)
        //
        // Hangi kirisler tasir? 'X' -> X dogrultusundaki kirisler, 'Y' -> Y;
        // 'auto' -> araligi daha SIK olan takim (takviyeler), oteki takim
        // (ana tasiyicilar) yuku takviyelerin tepkileriyle alir - iki takima
        // birden vermek yuku ikiye katlardi.
        //
        // Sonuc, cozumden once her kiris icin SANAL hat yuku listesidir
        // (basincHatYukleri); montaj, mafsal kondansasyonu ve geri kazanim
        // hepsi etkinHatYukleri(elem) uzerinden ayni listeyi gorur.

        const BASINC_TOL = 0.011;   // m: kiris yamanin icinde mi (1 cm pay)

        function basincYonu(p) {
            const y = (p.tasima || 'auto').toUpperCase();
            return (y === 'X' || y === 'Y') ? y : 'AUTO';
        }

        // Kiris yatay mi, X mi Y dogrultusunda mi (egik kirisler basinc almaz)
        function kirisDogrultusu(elem) {
            const a = model.nodes[elem.n1], b = model.nodes[elem.n2];
            if (!a || !b) return null;
            const dx = b.x - a.x, dy = b.y - a.y, dz = (b.z || 0) - (a.z || 0);
            if (Math.abs(dz) > 1e-6) return null;
            if (Math.abs(dy) < 1e-6 && Math.abs(dx) > 1e-9) return { yon: 'X', sabit: a.y, bas: Math.min(a.x, b.x), son: Math.max(a.x, b.x), z: a.z || 0, ters: b.x < a.x };
            if (Math.abs(dx) < 1e-6 && Math.abs(dy) > 1e-9) return { yon: 'Y', sabit: a.x, bas: Math.min(a.y, b.y), son: Math.max(a.y, b.y), z: a.z || 0, ters: b.y < a.y };
            return null;
        }

        // Yamadaki kirisleri dogrultuya gore toplar; her kirisin yama icinde
        // kalan parcasi ve konumu.
        function basincAdaylari(p) {
            const out = { X: [], Y: [] };
            const zVar = (typeof p.z === 'number' && isFinite(p.z));
            Object.entries(model.elements).forEach(([id, e]) => {
                const d = kirisDogrultusu(e);
                if (!d) return;
                if (zVar && Math.abs(d.z - p.z) > BASINC_TOL) return;
                const [lo, hi, sLo, sHi] = d.yon === 'X' ? [p.x1, p.x2, p.y1, p.y2] : [p.y1, p.y2, p.x1, p.x2];
                if (d.sabit < sLo - BASINC_TOL || d.sabit > sHi + BASINC_TOL) return;
                const a = Math.max(d.bas, lo), b = Math.min(d.son, hi);
                if (b - a <= BASINC_TOL) return;
                out[d.yon].push({ id: parseInt(id, 10), elem: e, d: d, a: a, b: b });
            });
            return out;
        }

        // Ortalama aralik (auto secimi icin)
        function ortalamaAralik(liste, lo, hi) {
            const konum = [...new Set(liste.map(k => +k.d.sabit.toFixed(6)))].sort((u, v) => u - v);
            if (konum.length <= 1) return hi - lo;
            let s = 0; for (let i = 1; i < konum.length; i++) s += konum[i] - konum[i - 1];
            return s / (konum.length - 1);
        }

        // Kirise dusen serit genisligi: komsu paralel kirislere yarim uzaklik,
        // kenarda yama sinirina kadar.
        // konum: listedeki kiris cizgilerinin sirali konumlari (bir kez
        // hesaplanir; eskiden her kiris icin yeniden kurulup siralaniyordu -
        // 1 475 kiriste 2 milyon islem, basinc dagilimi 300 ms - 1.6 s).
        function cizgiKonumlari(liste) {
            return [...new Set(liste.map(x => +x.d.sabit.toFixed(6)))].sort((u, v) => u - v);
        }
        function seritGenisligi(k, liste, sLo, sHi, konum) {
            if (!konum) konum = cizgiKonumlari(liste);
            const v = +k.d.sabit.toFixed(6);
            const i = konum.indexOf(v);
            const sol = (i <= 0) ? sLo : (konum[i - 1] + v) / 2;
            const sag = (i >= konum.length - 1) ? sHi : (v + konum[i + 1]) / 2;
            return Math.max(0, Math.min(sag, sHi) - Math.max(sol, sLo));
        }

        // Tek yamanin urettigi hat yukleri: { elemId: [yuk, ...] }
        function basinciHatYukunaCevir(p, uyarilar) {
            const out = {};
            const aday = basincAdaylari(p);
            let yon = basincYonu(p);
            if (yon === 'AUTO') {
                if (!aday.X.length && !aday.Y.length) { if (uyarilar) uyarilar.push('Pressure "' + (p.ad || '') + '": no beam inside the patch'); return out; }
                if (!aday.X.length) yon = 'Y';
                else if (!aday.Y.length) yon = 'X';
                else yon = ortalamaAralik(aday.X, p.y1, p.y2) <= ortalamaAralik(aday.Y, p.x1, p.x2) ? 'X' : 'Y';
            }
            const liste = aday[yon];
            if (!liste.length) { if (uyarilar) uyarilar.push('Pressure "' + (p.ad || '') + '": no ' + yon + ' beam inside the patch'); return out; }
            const [sLo, sHi] = yon === 'X' ? [p.y1, p.y2] : [p.x1, p.x2];
            const konum = cizgiKonumlari(liste);
            liste.forEach(k => {
                const b = seritGenisligi(k, liste, sLo, sHi, konum);
                if (b <= 1e-9) return;
                const q = p.value * b;                              // kN/m
                // yama icinde kalan parca -> kiris kesri (n1 -> n2 yonunde)
                const L = k.d.son - k.d.bas;
                let s = (k.a - k.d.bas) / L, e = (k.b - k.d.bas) / L;
                if (k.d.ters) { const s2 = 1 - e; e = 1 - s; s = s2; }
                (out[k.id] = out[k.id] || []).push({
                    value: q, q: q, startPct: s * 100, endPct: e * 100, start: s, end: e,
                    direction: 'global', angle: 90, case: p.case, kaynak: 'pressure', basinc: p.ad || '', serit: b
                });
            });
            return out;
        }

        // Butun yamalar -> kiris basina sanal hat yukleri (cozum oncesi)
        let basincHatYukleri = {};
        function basincYukleriniHazirla(uyarilar) {
            basincHatYukleri = {};
            (model.pressure || []).forEach(p => {
                if (!p || !(Math.abs(p.value) > 0)) return;
                const y = basinciHatYukunaCevir(p, uyarilar);
                Object.entries(y).forEach(([id, l]) => { (basincHatYukleri[id] = basincHatYukleri[id] || []).push(...l); });
            });
            return basincHatYukleri;
        }

        // ---- KIRIS USTU TEKIL YUK ----
        // elem.pointLoads = [{ P (kN, + = asagi), pos (0..1, n1'den kesir),
        //                      direction: 'global'|'localZ'|'localY', case }]
        // Cozucuye L/1000 genisliginde esdeger serit yuk olarak verilir:
        // siddet P / (eps*L). Kismi yayili yuk zinciri (montaj, mafsal, geri
        // kazanim, Mmax taramasi) hic degismeden calisir; moment ve tepki
        // sapmasi %0.05 (PL/4 - P*eps*L/8), kesme sicramasi L/1000 boyunca
        // rampa olur. Uca (pos 0 / 1) dusen yuk dogrudan dugume gider.
        const NOKTA_SERIT = 1 / 1000;
        function noktaYukleriniHatYukuYap(elem) {
            const liste = elem.pointLoads || [];
            if (!liste.length) return [];
            const a = model.nodes[elem.n1], b = model.nodes[elem.n2];
            if (!a || !b) return [];
            const L = Math.hypot(b.x - a.x, b.y - a.y, (b.z || 0) - (a.z || 0));
            if (L < 1e-9) return [];
            return liste.filter(p => isFinite(p.P) && p.P !== 0).map(p => {
                const pos = Math.max(0, Math.min(1, +p.pos || 0));
                const s = Math.max(0, pos - NOKTA_SERIT / 2), e = Math.min(1, pos + NOKTA_SERIT / 2);
                const q = p.P / ((e - s) * L);
                return { value: q, q: q, startPct: s * 100, endPct: e * 100, start: s, end: e,
                         direction: p.direction || 'global', angle: 90, case: p.case, kaynak: 'point', P: p.P, pos: pos };
            });
        }

        // Cozucunun gordugu hat yukleri: kirisin kendi yukleri + basinctan
        // gelenler + tekil yuklerin serit karsiligi
        function etkinHatYukleri(elem, elemId) {
            let liste = elem.lineLoads || [];
            const id = (elemId !== undefined) ? elemId : Object.keys(model.elements).find(k => model.elements[k] === elem);
            const b = basincHatYukleri[id];
            if (b && b.length) liste = liste.concat(b);
            if (elem.pointLoads && elem.pointLoads.length) liste = liste.concat(noktaYukleriniHatYukuYap(elem));
            return liste;
        }

        // ---- duzenleme: kiris paneli ----
        function kirisNoktaYukuEkle(elemId, P, posMm, durum, direction) {
            const e = model.elements[elemId];
            if (!e) return false;
            const a = model.nodes[e.n1], b = model.nodes[e.n2];
            const L = Math.hypot(b.x - a.x, b.y - a.y, (b.z || 0) - (a.z || 0));
            if (!(isFinite(P) && P !== 0)) { showToast('Enter a non-zero load (kN)', 'warning'); return false; }
            if (!(isFinite(posMm) && posMm >= 0 && posMm / 1000 <= L + 1e-6)) { showToast('Position must be 0…' + Math.round(L * 1000) + ' mm from node ' + e.n1, 'warning'); return false; }
            saveState();
            e.pointLoads = e.pointLoads || [];
            e.pointLoads.push({ P: P, pos: Math.min(1, posMm / 1000 / L), direction: direction || 'global', case: durum || etkinYukDurumu() });
            results = null;
            return true;
        }
        function kirisNoktaYukuSil(elemId, idx) {
            const e = model.elements[elemId];
            if (!e || !e.pointLoads || !e.pointLoads[idx]) return;
            saveState();
            e.pointLoads.splice(idx, 1);
            if (!e.pointLoads.length) delete e.pointLoads;
            results = null;
        }

        // ---- duzenleme (Loads sekmesi) ----
        function basincEkle(p) {
            saveState();
            model.pressure = model.pressure || [];
            const n = model.pressure.length + 1;
            model.pressure.push({
                ad: p.ad || ('P' + n),
                x1: Math.min(p.x1, p.x2), x2: Math.max(p.x1, p.x2), y1: Math.min(p.y1, p.y2), y2: Math.max(p.y1, p.y2),
                z: (typeof p.z === 'number' && isFinite(p.z)) ? p.z : undefined,
                value: p.value, tasima: p.tasima || 'auto', case: p.case || etkinYukDurumu()
            });
            results = null;
            if (typeof updateBCLoadsTable === 'function') updateBCLoadsTable();
            if (typeof updateModelSummary === 'function') updateModelSummary();
            if (currentViewMode === '3d') update3DScene(); else draw();
        }
        function basincSil(i) {
            if (!model.pressure || !model.pressure[i]) return;
            saveState();
            model.pressure.splice(i, 1);
            results = null;
            if (typeof updateBCLoadsTable === 'function') updateBCLoadsTable();
            if (typeof updateModelSummary === 'function') updateModelSummary();
            if (currentViewMode === '3d') update3DScene(); else draw();
        }
        // Secili kirislerin / tum modelin sinirlarini forma yazar
        function basincSinirlariSecimden() {
            const ids = (typeof selectedElements !== 'undefined' && selectedElements.size) ? [...selectedElements] : Object.keys(model.elements);
            const xs = [], ys = [], zs = [];
            ids.forEach(id => { const e = model.elements[id]; if (!e) return; [model.nodes[e.n1], model.nodes[e.n2]].forEach(n => { if (n) { xs.push(n.x); ys.push(n.y); zs.push(n.z || 0); } }); });
            if (!xs.length) { showToast('No beams to take bounds from', 'warning'); return; }
            const yaz = (id, v) => { const el = document.getElementById(id); if (el) el.value = Math.round(v * 1000); };
            yaz('basincX1', Math.min(...xs)); yaz('basincX2', Math.max(...xs)); yaz('basincY1', Math.min(...ys)); yaz('basincY2', Math.max(...ys));
            const zTek = [...new Set(zs.map(z => Math.round(z * 1000)))];
            const zEl = document.getElementById('basincZ'); if (zEl) zEl.value = zTek.length === 1 ? zTek[0] : '';
        }
        function basincFormdanEkle() {
            const oku = id => parseFloat(document.getElementById(id)?.value);
            const p = { value: oku('basincDeger'), x1: oku('basincX1') / 1000, x2: oku('basincX2') / 1000, y1: oku('basincY1') / 1000, y2: oku('basincY2') / 1000,
                        z: oku('basincZ') / 1000, tasima: document.getElementById('basincTasima')?.value || 'auto',
                        case: document.getElementById('basincDurum')?.value || etkinYukDurumu() };
            if (!isFinite(p.value) || p.value === 0) { showToast('Enter a non-zero pressure (kN/m²)', 'warning'); return; }
            if (![p.x1, p.x2, p.y1, p.y2].every(isFinite) || Math.abs(p.x2 - p.x1) < 1e-6 || Math.abs(p.y2 - p.y1) < 1e-6) { showToast('Patch needs X1<X2 and Y1<Y2 (mm)', 'warning'); return; }
            const uy = [];
            const deneme = basinciHatYukunaCevir(Object.assign({ ad: 'P' }, p), uy);
            if (!Object.keys(deneme).length) { showToast(uy[0] || 'No beam inside the patch', 'warning'); return; }
            basincEkle(p);
            showToast('Pressure ' + p.value + ' kN/m² on ' + Object.keys(deneme).length + ' beam(s)');
        }
        // Yamanin kirislere dagilimi (tablo/ipucu): [{id, q, serit}]
        function basincDagilimi(p) {
            const y = basinciHatYukunaCevir(p, null);
            return Object.entries(y).map(([id, l]) => ({ id: parseInt(id, 10), q: l.reduce((s, x) => s + x.value, 0), serit: l[0].serit }));
        }
