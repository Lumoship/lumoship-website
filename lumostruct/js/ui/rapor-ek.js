        // ============== RAPOR EKLERI: proje bilgisi, kiris adi, diyagramlar, gorunum ==============
        //
        // report.js'teki buildReportHtml tablolari kuruyor; burada raporun bir
        // sinif/gozetmen dosyasi olmasi icin eksik olanlar:
        //   - proje bilgisi (model.proje: ad, no, revizyon, muhendis, kontrol, notlar)
        //   - kiris adi (elem.ad: "DL-3", "GRD-2")  - tablolarda ve raporda
        //   - yukler bolumu (durumlar, kombinasyonlar, dugum/hat/tekil/basinc)
        //   - kritik kirislerin M / V / sehim diyagramlari (SVG, satir ici)
        //   - model gorunumu (3B ya da 2B kanvasin goruntusu)
        // Hepsi modelle kaydedilir; rapor HTML'i tek dosya (SVG/PNG gomulu).

        function projeBilgisi() {
            if (typeof model === 'undefined' || !model) return {};
            if (!model.proje || typeof model.proje !== 'object') model.proje = {};
            return model.proje;
        }
        const PROJE_ALANLARI = [['ad', 'projeAd'], ['no', 'projeNo'], ['revizyon', 'projeRev'], ['muhendis', 'projeMuhendis'], ['kontrol', 'projeKontrol'], ['notlar', 'projeNotlar']];
        function projeFormunuDoldur() {
            const p = projeBilgisi();
            PROJE_ALANLARI.forEach(([k, id]) => { const el = document.getElementById(id); if (el && document.activeElement !== el) el.value = p[k] || ''; });
        }
        function projeDegisti() {
            const p = projeBilgisi();
            PROJE_ALANLARI.forEach(([k, id]) => { const el = document.getElementById(id); if (el) p[k] = el.value; });
            if (typeof autoSaveModel === 'function') autoSaveModel();
        }

        // Kiris adi: tablolar ve rapor "12 (DL-3)" yazar
        function kirisEtiketi(id) {
            const e = model.elements[id];
            return (e && e.ad) ? id + ' (' + e.ad + ')' : String(id);
        }
        function kirisAdiAyarla(id, ad) {
            const e = model.elements[id];
            if (!e) return;
            saveState();
            ad = String(ad || '').trim();
            if (ad) e.ad = ad; else delete e.ad;
            if (typeof modelTablolariniTazele === 'function') modelTablolariniTazele();
            if (currentViewMode === '3d') update3DScene(); else draw();
        }

        // ---- Diyagram SVG ----
        // diagram: { x[] m, M[] kNm, V[] kN, d[] mm }. Uc serit: M, V, d.
        function kirisDiyagramSvg(id, genislik) {
            const r = results && results.elementResults && results.elementResults[id];
            if (!r || !r.diagram || !r.diagram.x || r.diagram.x.length < 2) return '';
            const W = genislik || 640, seritH = 74, solPay = 46, sagPay = 12, ustPay = 14;
            const dg = r.diagram;
            const L = dg.x[dg.x.length - 1];
            // diagram.M ic moment isaretiyle (sarkma eksi); tablolar sarkmayi arti
            // yazar (Mmid, M1). Rapor tablolarla ayni isareti yazsin, egri ise
            // cekme tarafina (sarkma asagi) cizilsin: M serisi ters cevrilir ve
            // ters yonde cizilir.
            const seriler = [['M [kNm]', Array.isArray(dg.M) ? dg.M.map(v => -v) : null, '#1d4ed8', -1], ['V [kN]', dg.V, '#b45309', 1], ['δ [mm]', dg.d, '#047857', 1]].filter(s => Array.isArray(s[1]) && s[1].length === dg.x.length);
            const H = ustPay + seriler.length * (seritH + 18) + 14;
            const esc = v => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;');
            const px = x => solPay + (x / L) * (W - solPay - sagPay);
            let s = '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" style="font:10px Arial,sans-serif;">';
            seriler.forEach(([ad, veri, renk, yon], k) => {
                const y0 = ustPay + k * (seritH + 18);
                const enB = Math.max(...veri.map(v => Math.abs(v)), 1e-9);
                const py = v => y0 + seritH / 2 - yon * (v / enB) * (seritH / 2 - 4);
                // sifir cizgisi ve eksen
                s += '<line x1="' + solPay + '" y1="' + py(0) + '" x2="' + (W - sagPay) + '" y2="' + py(0) + '" stroke="#999" stroke-width="0.8"/>';
                // dolgu
                let d = 'M' + px(dg.x[0]) + ',' + py(0);
                dg.x.forEach((x, i) => { d += ' L' + px(x).toFixed(1) + ',' + py(veri[i]).toFixed(1); });
                d += ' L' + px(L) + ',' + py(0) + ' Z';
                s += '<path d="' + d + '" fill="' + renk + '" fill-opacity="0.18" stroke="' + renk + '" stroke-width="1.4"/>';
                // etiketler: ad, uc degerler, en buyuk
                let iEn = 0; veri.forEach((v, i) => { if (Math.abs(v) > Math.abs(veri[iEn])) iEn = i; });
                s += '<text x="2" y="' + (y0 + 10) + '" fill="' + renk + '" font-weight="bold">' + ad + '</text>';
                s += '<text x="' + solPay + '" y="' + (y0 + seritH + 12) + '" fill="#555">' + veri[0].toFixed(2) + '</text>';
                s += '<text x="' + (W - sagPay) + '" y="' + (y0 + seritH + 12) + '" fill="#555" text-anchor="end">' + veri[veri.length - 1].toFixed(2) + '</text>';
                const ex = px(dg.x[iEn]);
                s += '<circle cx="' + ex.toFixed(1) + '" cy="' + py(veri[iEn]).toFixed(1) + '" r="2.5" fill="' + renk + '"/>';
                // Tepe uclardaysa uc etiketi zaten yaziyor; ortadaysa ayri yaz
                if (iEn > 0 && iEn < veri.length - 1) {
                    s += '<text x="' + Math.min(Math.max(ex, solPay + 60), W - sagPay - 60).toFixed(1) + '" y="' + (y0 + seritH + 12) + '" fill="' + renk + '" text-anchor="middle" font-weight="bold">' +
                         veri[iEn].toFixed(2) + ' @ ' + (dg.x[iEn] * 1000).toFixed(0) + ' mm</text>';
                }
            });
            // x ekseni (ayri satir)
            s += '<text x="' + ((solPay + W - sagPay) / 2) + '" y="' + (H - 2) + '" fill="#777" text-anchor="middle">x from node ' + esc(model.elements[id] ? model.elements[id].n1 : '') + ' — L = ' + (L * 1000).toFixed(0) + ' mm &middot; M drawn on the tension side (sagging +)</text>';
            s += '</svg>';
            return s;
        }

        // ---- Model gorunumu ----
        function modelGorunumuPng() {
            try {
                if (currentViewMode === '3d' && typeof threeRenderer !== 'undefined' && threeRenderer && threeScene && threeCamera) {
                    threeRenderer.render(threeScene, threeCamera);
                    return threeRenderer.domElement.toDataURL('image/png');
                }
                const c = document.getElementById('mainCanvas');
                if (c && typeof draw === 'function') { draw(); return c.toDataURL('image/png'); }
            } catch (e) { /* WebGL tamponu korunmuyorsa bos donebilir */ }
            return null;
        }

        // ---- Rapor bolumleri (HTML parcalari) ----
        function raporProjeBolumu(esc) {
            const p = projeBilgisi();
            const satir = (a, v) => v ? '<tr><td>' + a + '</td><td>' + esc(v) + '</td></tr>' : '';
            const govde = satir('Project', p.ad) + satir('Project no.', p.no) + satir('Revision', p.revizyon) + satir('Prepared by', p.muhendis) + satir('Checked by', p.kontrol) + satir('Notes', p.notlar);
            return govde ? '<h2>Project</h2><table class="kv">' + govde + '</table>' : '';
        }

        function raporYuklerBolumu(esc, num) {
            let h = '<h2>Loads</h2>';
            // durumlar ve kombinasyonlar
            if (typeof yukDurumlari === 'function') {
                const ds = yukDurumlari(), ks = kombinasyonlar();
                h += '<table><thead><tr><th>Combination</th><th>Name</th>' + ds.map(d => '<th>' + esc(d.id) + '</th>').join('') + '</tr></thead><tbody>' +
                     ks.map(k => '<tr><td>' + esc(k.id) + '</td><td>' + esc(k.ad || '') + '</td>' + ds.map(d => '<td>' + num(k.katsayi[d.id] || 0, 2) + '</td>').join('') + '</tr>').join('') +
                     '</tbody></table><div style="color:#666; margin:-4px 0 10px;">Cases: ' + ds.map(d => esc(d.id) + ' = ' + esc(d.ad || '')).join('; ') + '</div>';
            }
            const dugum = (model.loads || []);
            if (dugum.length) h += '<table><thead><tr><th>Node</th><th>Case</th><th>F<sub>x</sub></th><th>F<sub>y</sub></th><th>F<sub>z</sub> (kN)</th><th>M<sub>x</sub></th><th>M<sub>y</sub></th><th>M<sub>z</sub> (kNm)</th></tr></thead><tbody>' +
                dugum.map(l => '<tr><td>' + esc(l.nodeId) + '</td><td>' + esc(l.case || 'L') + '</td><td>' + num(l.Fx || 0, 2) + '</td><td>' + num(l.Fy || 0, 2) + '</td><td>' + num(l.Fz || 0, 2) + '</td><td>' + num(l.Mx || 0, 2) + '</td><td>' + num(l.My || 0, 2) + '</td><td>' + num(l.Mz || 0, 2) + '</td></tr>').join('') + '</tbody></table>';
            const hat = [];
            Object.entries(model.elements).forEach(([id, e]) => {
                (e.lineLoads || []).forEach(l => hat.push('<tr><td>' + esc(kirisEtiketi(id)) + '</td><td>' + esc(l.case || 'L') + '</td><td>line load</td><td>' + num(l.value ?? l.q ?? 0, 2) + (typeof l.value2 === 'number' ? ' → ' + num(l.value2, 2) : '') + ' kN/m</td><td>' + num(l.startPct !== undefined ? l.startPct : (l.start || 0) * 100, 0) + '–' + num(l.endPct !== undefined ? l.endPct : (l.end === undefined ? 100 : l.end * 100), 0) + ' %</td></tr>'));
                (e.pointLoads || []).forEach(p => {
                    const a = model.nodes[e.n1], b = model.nodes[e.n2]; const L = (a && b) ? Math.hypot(b.x - a.x, b.y - a.y, (b.z || 0) - (a.z || 0)) : 0;
                    hat.push('<tr><td>' + esc(kirisEtiketi(id)) + '</td><td>' + esc(p.case || 'L') + '</td><td>point load</td><td>' + num(p.P, 2) + ' kN</td><td>x = ' + num((p.pos || 0) * L * 1000, 0) + ' mm</td></tr>');
                });
            });
            if (hat.length) h += '<table><thead><tr><th>Beam</th><th>Case</th><th>Type</th><th>Value</th><th>Range / position</th></tr></thead><tbody>' + hat.join('') + '</tbody></table>';
            const ps = model.pressure || [];
            if (ps.length) h += '<table><thead><tr><th>Pressure</th><th>Case</th><th>p (kN/m²)</th><th>Patch x (m)</th><th>Patch y (m)</th><th>Carried by</th></tr></thead><tbody>' +
                ps.map((p, i) => { const dag = (typeof basincDagilimi === 'function') ? basincDagilimi(p) : []; return '<tr><td>' + esc(p.ad || 'P' + (i + 1)) + '</td><td>' + esc(p.case || 'L') + '</td><td>' + num(p.value, 2) + '</td><td>' + num(p.x1, 2) + ' – ' + num(p.x2, 2) + '</td><td>' + num(p.y1, 2) + ' – ' + num(p.y2, 2) + '</td><td>' + esc(p.tasima || 'auto') + ' → ' + dag.length + ' beams' + (dag.length ? ' (' + dag.map(d => 'E' + d.id + ': ' + d.q.toFixed(1)).join(', ') + ' kN/m)' : '') + '</td></tr>'; }).join('') + '</tbody></table>';
            if (!dugum.length && !hat.length && !ps.length) h += '<p style="color:#666;">No loads other than self weight.</p>';
            return h;
        }

        // Kritik kirislerin diyagramlari: kullanim oranina gore ilk N (varsayilan 8)
        function raporDiyagramBolumu(esc, num, siraliSatirlar, adet) {
            const n = adet || 8;
            const secim = siraliSatirlar.slice(0, n);
            if (!secim.length) return '';
            let h = '<h2>Critical beams — moment, shear and deflection diagrams <span style="font-weight:400; color:#666;">(top ' + secim.length + ' by utilisation)</span></h2>';
            secim.forEach(b => {
                const e = model.elements[b.id]; if (!e) return;
                const r = results.elementResults[b.id] || {};
                const lc = r.lc ? ' &middot; governing ' + esc(r.lc) : '';
                h += '<div style="page-break-inside:avoid; margin:6px 0 14px;"><div style="font-weight:600; margin-bottom:2px;">Beam ' + esc(kirisEtiketi(b.id)) + ' &middot; ' + esc(e.section || '-') +
                     ' &middot; L = ' + num(b.length * 1000, 0) + ' mm &middot; nodes ' + esc(e.n1) + ' → ' + esc(e.n2) + ' &middot; util ' + num(b.util, 1) + ' %' + lc + '</div>' + kirisDiyagramSvg(b.id, 680) + '</div>';
            });
            return h;
        }

        function raporGorunumBolumu() {
            const png = modelGorunumuPng();
            if (!png || png.length < 200) return '';
            return '<h2>Model view</h2><img src="' + png + '" style="max-width:100%; border:1px solid #ddd;">';
        }
