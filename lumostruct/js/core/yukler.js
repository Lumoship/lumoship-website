        // ============== YUK DURUMLARI VE KOMBINASYONLAR ==============
        //
        // Her yuk (dugum yuku, hat yuku, basinc) bir DURUM etiketi tasir:
        // load.case = 'D' | 'L' | kullanicinin actigi baska bir kimlik. Oz
        // agirlik her zaman 'D'. Kombinasyon = durum basina katsayi.
        //
        // Eskiden: yuk paneli hic 'case' yazmiyordu, cozucu tanimsiz durumu
        // L sayiyordu; "LC2: 1.2D + 1.5L" secince HER yuk 1.5 ile carpiliyordu
        // ve D/L ayrimi yalnizca oz agirlikta calisiyordu. Ayrica state.js'te
        // yukleri durum basina ayri saklayip modele takas eden ikinci bir
        // "load case" sistemi vardi (kaydedilmiyor, geri alinmiyor, "Solve
        // Combined" ile hile). Ikisi de gitti; tek kaynak bu dosya.
        //
        // Veri MODELIN ICINDE tasinir (kaydet/ac, geri al, .clb ice aktarma
        // hepsi ayni yoldan):
        //   model.loadCases    = [{ id:'D', ad:'Dead' }, { id:'L', ad:'Live' }, ...]
        //   model.combinations = [{ id:'LC1', ad:'Service', katsayi:{ D:1, L:1 } }, ...]
        //   model.activeLoadCase (yeni yuk hangi duruma yazilir)
        //   model.activeCombination (cozum hangi kombinasyonla)
        // Kombinasyonda gecmeyen durumun katsayisi 0'dir (yuk dahil edilmez).
        // Durumu tanimsiz eski yukler 'L' sayilir (geriye uyum).

        const YUK_DURUMU_VARSAYILAN = [
            { id: 'D', ad: 'Dead (incl. self weight)' },
            { id: 'L', ad: 'Live' }
        ];
        const KOMBINASYON_VARSAYILAN = [
            { id: 'LC1', ad: 'Service',   katsayi: { D: 1.0, L: 1.0 } },
            { id: 'LC2', ad: 'Factored',  katsayi: { D: 1.2, L: 1.5 } },
            { id: 'LC3', ad: 'Dead only', katsayi: { D: 1.0, L: 0.0 } }
        ];
        const YUK_DURUMU_VARSAYILAN_ID = 'L';   // ZARF: bkz. js/core/zarf.js

        const yukKopya = v => JSON.parse(JSON.stringify(v));

        function yukDurumlari() {
            if (typeof model === 'undefined' || !model) return yukKopya(YUK_DURUMU_VARSAYILAN);
            if (!Array.isArray(model.loadCases) || !model.loadCases.length) model.loadCases = yukKopya(YUK_DURUMU_VARSAYILAN);
            if (!model.loadCases.some(d => d.id === 'D')) model.loadCases.unshift({ id: 'D', ad: 'Dead (incl. self weight)' });
            return model.loadCases;
        }

        function kombinasyonlar() {
            if (typeof model === 'undefined' || !model) return yukKopya(KOMBINASYON_VARSAYILAN);
            if (!Array.isArray(model.combinations) || !model.combinations.length) model.combinations = yukKopya(KOMBINASYON_VARSAYILAN);
            model.combinations.forEach(k => { if (!k.katsayi) k.katsayi = {}; });
            return model.combinations;
        }

        // Yeni yuklerin yazilacagi durum. Arayuzdeki secici varsa o, yoksa
        // modeldeki kayit, o da yoksa 'L'.
        function etkinYukDurumu() {
            const el = (typeof document !== 'undefined') ? document.getElementById('etkinYukDurumu') : null;
            const aday = (el && el.value) || (model && model.activeLoadCase) || YUK_DURUMU_VARSAYILAN_ID;
            const var_ = yukDurumlari().some(d => d.id === aday);
            if (var_) return aday;
            const ilkD = yukDurumlari().find(d => d.id !== 'D');
            return ilkD ? ilkD.id : 'D';
        }
        function etkinYukDurumuAyarla(id) {
            if (!model) return;
            model.activeLoadCase = id;
            const el = document.getElementById('etkinYukDurumu');
            if (el) el.value = id;
        }

        function etkinKombinasyonId() {
            const el = (typeof document !== 'undefined') ? document.getElementById('loadCombSelect') : null;
            const aday = (el && el.value) || (model && model.activeCombination) || null;
            if (aday === 'ENV') return 'ENV';                // zarf: butun kombinasyonlar (js/core/zarf.js)
            const ks = kombinasyonlar();
            return ks.some(k => k.id === aday) ? aday : ks[0].id;
        }
        // Rapor ve ozet icin etiket; zarfta kombinasyon listesi
        function etkinKombinasyonEtiketi() {
            if (etkinKombinasyonId() === 'ENV') return 'ENV: Envelope of ' + kombinasyonlar().map(k => k.id).join(', ');
            return kombinasyonEtiketi(etkinKombinasyon());
        }
        function etkinKombinasyon() {
            const id = etkinKombinasyonId();
            return kombinasyonlar().find(k => k.id === id) || kombinasyonlar()[0];
        }

        // Cozucunun kullandigi katsayi haritasi: her tanimli durum icin bir
        // sayi (kombinasyonda gecmeyen -> 0). Tanimsiz durumlu yuk icin
        // cozucu yukKatsayisi() ile 'L'ye duser.
        function kombinasyonKatsayilari(id) {
            const k = kombinasyonlar().find(x => x.id === id) || kombinasyonlar()[0];
            const out = {};
            yukDurumlari().forEach(d => {
                const v = parseFloat(k.katsayi[d.id]);
                out[d.id] = isFinite(v) ? v : 0;
            });
            if (out.L === undefined) out.L = 0;
            return out;
        }
        function yukKatsayisi(katsayilar, durum) {
            if (durum !== undefined && durum !== null && katsayilar[durum] !== undefined) return katsayilar[durum];
            return (katsayilar[YUK_DURUMU_VARSAYILAN_ID] !== undefined) ? katsayilar[YUK_DURUMU_VARSAYILAN_ID] : 0;
        }

        function kombinasyonEtiketi(k) {
            const terim = Object.entries(k.katsayi || {})
                .filter(([, v]) => parseFloat(v) !== 0 && isFinite(parseFloat(v)))
                .map(([d, v]) => (+parseFloat(v).toFixed(2)) + d);
            return k.id + ': ' + (k.ad || '') + (terim.length ? ' (' + terim.join(' + ') + ')' : ' (no loads)');
        }

        // Her durumda kac yuk var (dugum + hat + basinc)
        function yukDurumuSayilari() {
            const say = {};
            yukDurumlari().forEach(d => { say[d.id] = 0; });
            const ekle = c => { const id = (c === undefined || c === null) ? YUK_DURUMU_VARSAYILAN_ID : c; say[id] = (say[id] || 0) + 1; };
            (model.loads || []).forEach(l => ekle(l.case));
            Object.values(model.elements || {}).forEach(e => (e.lineLoads || []).forEach(l => ekle(l.case)));
            (model.pressure || []).forEach(p => ekle(p.case));
            return say;
        }

        // ---- duzenleme ----
        function yukDurumuEkle(id, ad) {
            id = String(id || '').trim().toUpperCase().replace(/[^A-Z0-9_]/g, '').slice(0, 6);
            if (!id) { showToast('Load case needs a short ID (e.g. W, P, T)', 'warning'); return null; }
            if (yukDurumlari().some(d => d.id === id)) { showToast('Load case ' + id + ' already exists', 'warning'); return null; }
            saveState();
            const d = { id: id, ad: (ad || '').trim() || id };
            yukDurumlari().push(d);
            kombinasyonlar().forEach(k => { if (k.katsayi[id] === undefined) k.katsayi[id] = 0; });
            yukSecicileriniTazele();
            return d;
        }
        function yukDurumuSil(id) {
            if (id === 'D') { showToast('Dead load case cannot be removed (self weight)', 'warning'); return false; }
            const say = yukDurumuSayilari()[id] || 0;
            if (say > 0) { showToast(say + ' load(s) still use case ' + id + ' - reassign them first', 'warning'); return false; }
            saveState();
            model.loadCases = yukDurumlari().filter(d => d.id !== id);
            kombinasyonlar().forEach(k => { delete k.katsayi[id]; });
            if (model.activeLoadCase === id) model.activeLoadCase = etkinYukDurumu();
            yukSecicileriniTazele();
            return true;
        }
        function yukDurumuAdlandir(id, ad) {
            const d = yukDurumlari().find(x => x.id === id);
            if (d && ad && ad.trim()) { d.ad = ad.trim(); yukSecicileriniTazele(); }
        }
        function kombinasyonEkle() {
            saveState();
            const ks = kombinasyonlar();
            let n = ks.length + 1;
            while (ks.some(k => k.id === 'LC' + n)) n++;
            const k = { id: 'LC' + n, ad: 'Combination ' + n, katsayi: {} };
            yukDurumlari().forEach(d => { k.katsayi[d.id] = 1.0; });
            ks.push(k);
            yukSecicileriniTazele();
            return k;
        }
        function kombinasyonSil(id) {
            const ks = kombinasyonlar();
            if (ks.length <= 1) { showToast('At least one combination is needed', 'warning'); return false; }
            saveState();
            model.combinations = ks.filter(k => k.id !== id);
            if (model.activeCombination === id) model.activeCombination = model.combinations[0].id;
            results = null;
            yukSecicileriniTazele();
            return true;
        }
        function kombinasyonKatsayiAyarla(kid, did, deger) {
            const k = kombinasyonlar().find(x => x.id === kid);
            if (!k) return;
            const v = parseFloat(deger);
            k.katsayi[did] = isFinite(v) ? v : 0;
            results = null;
            if (typeof modelChangedAfterSolve !== 'undefined') modelChangedAfterSolve = true;
            yukSecicileriniTazele();
        }
        function kombinasyonAdlandir(kid, ad) {
            const k = kombinasyonlar().find(x => x.id === kid);
            if (k && ad && ad.trim()) { k.ad = ad.trim(); yukSecicileriniTazele(); }
        }

        // Var olan bir yukun durumunu degistir. tur: 'node' | 'line' | 'pressure'
        function yukDurumuAta(tur, a, b, durum) {
            if (!yukDurumlari().some(d => d.id === durum)) return;
            saveState();
            if (tur === 'node' && model.loads[a]) model.loads[a].case = durum;
            else if (tur === 'line' && model.elements[a] && model.elements[a].lineLoads && model.elements[a].lineLoads[b]) model.elements[a].lineLoads[b].case = durum;
            else if (tur === 'pressure' && model.pressure[a]) model.pressure[a].case = durum;
            results = null;
            if (typeof updateBCLoadsTable === 'function') updateBCLoadsTable();
            if (typeof updateEntityInfoPanel === 'function') updateEntityInfoPanel();
            if (typeof modelTablolariniTazele === 'function') modelTablolariniTazele();
        }

        // ---- arayuz ----
        // Butun durum secicilerini (class="yuk-durumu-secici") ve kombinasyon
        // listesini modelden doldurur. Secim korunur.
        function yukSecicileriniTazele() {
            if (typeof document === 'undefined') return;
            const durumlar = yukDurumlari();
            document.querySelectorAll('select.yuk-durumu-secici').forEach(sel => {
                const eski = sel.value;
                sel.innerHTML = durumlar.map(d => '<option value="' + d.id + '">' + d.id + ' - ' + d.ad + '</option>').join('');
                const hedef = (sel.id === 'etkinYukDurumu') ? etkinYukDurumu() : (durumlar.some(d => d.id === eski) ? eski : etkinYukDurumu());
                sel.value = hedef;
            });
            const lc = document.getElementById('loadCombSelect');
            if (lc) {
                const secili = etkinKombinasyonId();
                lc.innerHTML = kombinasyonlar().map(k => '<option value="' + k.id + '">' + kombinasyonEtiketi(k) + '</option>').join('') +
                    (kombinasyonlar().length > 1 ? '<option value="ENV">ENV: Envelope (worst of all ' + kombinasyonlar().length + ')</option>' : '');
                lc.value = secili;
                model.activeCombination = secili;
            }
            const cur = document.getElementById('currentLC'), curF = document.getElementById('currentLCFactor');
            if (cur) cur.textContent = etkinKombinasyonId();
            if (curF) curF.textContent = (etkinKombinasyonId() === 'ENV') ? 'worst of all combinations' : kombinasyonEtiketi(etkinKombinasyon()).replace(/^[^(]*\(|\)$/g, '');
            const etkinAd = document.getElementById('activeLoadCaseName');
            if (etkinAd) { const d = durumlar.find(x => x.id === etkinYukDurumu()); etkinAd.textContent = d ? (d.id + ' - ' + d.ad) : '-'; }
            if (document.getElementById('loadCasesModal')) yukKombPenceresiniDoldur();
        }
        // app.js acilista bunu cagiriyor (eski ad)
        function updateLoadCasesUI() { yukSecicileriniTazele(); }

        function loadCombSecildi() {
            model.activeCombination = etkinKombinasyonId();
            results = null;
            if (typeof modelChangedAfterSolve !== 'undefined') modelChangedAfterSolve = true;
            yukSecicileriniTazele();
        }

        // Yuk durumlari + kombinasyon tablosu penceresi
        function showLoadCasesModal() {
            const eski = document.getElementById('loadCasesModal');
            if (eski) eski.remove();
            const modal = document.createElement('div');
            modal.id = 'loadCasesModal';
            modal.innerHTML =
                '<div style="position:fixed; inset:0; background:rgba(0,0,0,0.7); z-index:10000; display:flex; align-items:center; justify-content:center;" onclick="if(event.target===this)this.parentElement.remove()">' +
                '  <div style="background:var(--bg-elev); border-radius:var(--r-ovl); width:92%; max-width:720px; max-height:86vh; display:flex; flex-direction:column; overflow:hidden;">' +
                '    <div style="display:flex; justify-content:space-between; align-items:center; padding:12px 16px; border-bottom:1px solid var(--border);">' +
                '      <h3 style="margin:0; color:var(--text); font-size:var(--fs-md);">Load cases &amp; combinations</h3>' +
                '      <button onclick="document.getElementById(\'loadCasesModal\').remove()" style="background:none; border:none; color:var(--text-2); cursor:pointer; font-size:var(--fs-lg);">&times;</button>' +
                '    </div>' +
                '    <div id="yukKombGovde" style="padding:12px 16px; overflow-y:auto;"></div>' +
                '    <div style="padding:10px 16px; border-top:1px solid var(--border); display:flex; justify-content:flex-end; gap:8px;">' +
                '      <button class="btn-primary" onclick="document.getElementById(\'loadCasesModal\').remove()">Done</button>' +
                '    </div>' +
                '  </div>' +
                '</div>';
            document.body.appendChild(modal);
            yukKombPenceresiniDoldur();
        }

        function yukKombPenceresiniDoldur() {
            const g = document.getElementById('yukKombGovde');
            if (!g) return;
            const durumlar = yukDurumlari(), ks = kombinasyonlar(), say = yukDurumuSayilari();
            const inp = 'style="background:var(--bg-main); border:1px solid var(--border); color:var(--text); border-radius:var(--r-ctl); padding:3px 5px; font-size:var(--fs-sm);"';
            let h = '<div style="font-size:var(--fs-xs); color:var(--text-3); margin-bottom:6px;">Every load carries a case. A combination multiplies each case by its factor; a case with factor 0 is left out. Self weight is always D.</div>';
            h += '<table class="tablo-kompakt" style="width:100%; margin-bottom:12px;"><thead><tr><th>Case</th><th>Name</th><th style="text-align:right;">Loads</th><th></th></tr></thead><tbody>';
            durumlar.forEach(d => {
                h += '<tr><td style="font-weight:600; color:var(--accent-info);">' + d.id + '</td>' +
                     '<td><input type="text" value="' + (d.ad || '').replace(/"/g, '&quot;') + '" ' + inp + ' style="width:100%;" onchange="yukDurumuAdlandir(\'' + d.id + '\', this.value)"></td>' +
                     '<td style="text-align:right;">' + (say[d.id] || 0) + (d.id === 'D' ? ' + self wt' : '') + '</td>' +
                     '<td style="text-align:right;">' + (d.id === 'D' ? '' : '<button class="btn-small" title="Remove case" onclick="yukDurumuSil(\'' + d.id + '\')">&times;</button>') + '</td></tr>';
            });
            h += '</tbody></table>';
            h += '<div style="display:flex; gap:6px; align-items:center; margin-bottom:16px;">' +
                 '<input type="text" id="yeniDurumId" placeholder="ID (W, P, T…)" maxlength="6" ' + inp + ' style="width:90px;">' +
                 '<input type="text" id="yeniDurumAd" placeholder="Name (Wind, Tank pressure…)" ' + inp + ' style="flex:1;">' +
                 '<button class="btn-secondary" onclick="yukDurumuEkle(document.getElementById(\'yeniDurumId\').value, document.getElementById(\'yeniDurumAd\').value)">+ Add case</button></div>';

            h += '<table class="tablo-kompakt" style="width:100%;"><thead><tr><th>Combination</th><th>Name</th>';
            durumlar.forEach(d => { h += '<th style="text-align:center;">' + d.id + '</th>'; });
            h += '<th></th></tr></thead><tbody>';
            ks.forEach(k => {
                h += '<tr><td style="font-weight:600; color:var(--accent-info);">' + k.id + '</td>' +
                     '<td><input type="text" value="' + (k.ad || '').replace(/"/g, '&quot;') + '" ' + inp + ' style="width:100%; min-width:90px;" onchange="kombinasyonAdlandir(\'' + k.id + '\', this.value)"></td>';
                durumlar.forEach(d => {
                    const v = (k.katsayi[d.id] !== undefined) ? k.katsayi[d.id] : 0;
                    h += '<td style="text-align:center;"><input type="number" step="0.05" value="' + v + '" ' + inp + ' style="width:58px; text-align:center;" onchange="kombinasyonKatsayiAyarla(\'' + k.id + '\', \'' + d.id + '\', this.value)"></td>';
                });
                h += '<td style="text-align:right;">' + (ks.length > 1 ? '<button class="btn-small" title="Remove combination" onclick="kombinasyonSil(\'' + k.id + '\')">&times;</button>' : '') + '</td></tr>';
            });
            h += '</tbody></table>';
            h += '<div style="margin-top:8px;"><button class="btn-secondary" onclick="kombinasyonEkle()">+ Add combination</button></div>';
            g.innerHTML = h;
        }
