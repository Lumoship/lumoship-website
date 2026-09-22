        // ============== TEK PANEL DUZENI ==============
        //
        // Kullanici: "Sol taraftaki pencereleri neredeyse hic kullanmiyorum;
        // sag pencereden her sey yapilabilsin, modele daha cok yer kalsin;
        // minimal, tekrar eden sey olmasin."
        //
        // Sol panel ve alti sekme KALKAR. Sag panel tek kaydirilir sutun:
        //   Selection  (bagLam: dugum / kiris / coklu - mevcut kartlar)
        //   Model      (ozet, Grillage generator, Purge, Check, profil listesi, New profile...)
        //   Loads      (yeni yuklerin durumu, kombinasyon + Edit..., basinc yamasi, oz agirlik)
        //   Checks     (celik sinifi, gerilme tabani, sehim siniri, gammaM1)
        //   Results    (ozet degerler, kontroller, tepkiler - cozumden sonra)
        // Nadir ayarlar (arayuz olcegi, tema, grid, goruntu boyutlari, birimler,
        // proje, cozucu sinamasi, malzeme kutuphanesi) Preferences penceresine;
        // profil olusturucu New profile penceresine. Yuk / dugum / kiris
        // TABLOLARI alt panelde (her zaman acik).
        //
        // YONTEM: index.html'deki bloklar YENIDEN YAZILMAZ, TASINIR. Kimlikler,
        // onclick'ler, testlerin aradigi elemanlar aynen durur; yalnizca
        // ebeveynleri degisir. Boylece 9 500 satirlik JS dokunulmadan kalir.
        // Kaldirilan cift kayitlar (kullanici baska yerde zaten yapabiliyor):
        //   - Boundary sekmesi: kisit tablosu = alt panel Nodes; presetler = dugum karti
        //   - Loads sekmesindeki "seciliye yuk ekle" formlari = dugum/kiris karti
        //   - Model sekmesindeki dugum/kiris tablolari = alt panel
        //   - Settings > Material (salt okunur gosterim) = Checks karti
        //   - Sag paneldeki "Properties" basligi ve "Nothing selected" bos durumu

        const DUZEN_BILGI = { kartlar: [], tasinan: 0, gizlenen: [] };

        function duzenBaslikMetni(el) {
            return (el.textContent || '').replace(/\s+/g, ' ').trim();
        }
        // kok icindeki h3.panel-title'i metinle bulur; basligi ve bir sonraki
        // h3.panel-title'a kadar olan kardesleri dondurur
        function duzenH3Blogu(kok, metin) {
            if (!kok) return null;
            const h3 = [...kok.querySelectorAll('h3.panel-title')].find(h => duzenBaslikMetni(h) === metin);
            if (!h3) return null;
            const parca = [h3];
            let k = h3.nextSibling;
            while (k && !(k.nodeType === 1 && k.matches('h3.panel-title'))) { parca.push(k); k = k.nextSibling; }
            return parca;
        }
        function duzenTasi(hedef, dugumler) {
            (dugumler || []).forEach(d => { if (d) { hedef.appendChild(d); DUZEN_BILGI.tasinan++; } });
        }
        function duzenKart(id, baslik) {
            const d = document.createElement('div');
            d.className = 'entity-section duzen-kart';
            d.id = id;
            const b = document.createElement('div');
            b.className = 'entity-section-title';
            b.textContent = baslik;
            d.appendChild(b);
            DUZEN_BILGI.kartlar.push(id);
            return d;
        }
        function duzenGizle(el, neden) {
            if (!el) return;
            el.hidden = true;
            el.style.display = 'none';
            DUZEN_BILGI.gizlenen.push(neden);
        }
        // Basit pencere (mevcut .modal-overlay/.modal bicimi)
        function duzenPencere(id, baslik, genislik) {
            const ov = document.createElement('div');
            ov.className = 'modal-overlay';
            ov.id = id;
            ov.addEventListener('click', e => { if (e.target === ov) duzenPencereKapat(id); });
            const m = document.createElement('div');
            m.className = 'modal';
            m.style.maxWidth = genislik || '720px';
            m.innerHTML = '<div class="modal-header"><h2>' + baslik + '</h2><button class="modal-close" onclick="duzenPencereKapat(\'' + id + '\')">&times;</button></div>' +
                          '<div class="modal-body" id="' + id + 'Body"></div>';
            ov.appendChild(m);
            document.body.appendChild(ov);
            return document.getElementById(id + 'Body');
        }
        function duzenPencereAc(id) {
            const ov = document.getElementById(id);
            if (!ov) return;
            ov.classList.add('active');
            document.body.style.overflow = 'hidden';
        }
        function duzenPencereKapat(id) {
            const ov = document.getElementById(id);
            if (!ov) return;
            ov.classList.remove('active');
            document.body.style.overflow = '';
        }
        function showPreferences() { duzenPencereAc('preferencesModal'); }
        function showProfileBuilder() { duzenPencereAc('profileModal'); }

        function tekPanelDuzeniKur() {
            const sag = document.getElementById('rightPanel');
            const sol = document.getElementById('leftPanel');
            if (!sag || !sol || document.body.classList.contains('tek-panel')) { document.body.classList.remove('duzen-bekle'); return DUZEN_BILGI; }
            const G = document.getElementById('tabContentGeneral');
            const M = document.getElementById('tabContentModel');
            const B = document.getElementById('tabContentBoundary');
            const L = document.getElementById('tabContentLoads');
            const S = document.getElementById('tabContentSettings');
            const R = document.getElementById('tabContentResults');
            const ic = (kok, sec) => kok ? kok.querySelector(sec) : null;
            const kapsayan = (el, sec) => el ? el.closest(sec) : null;

            // ---- pencereler
            const tercihGovde = duzenPencere('preferencesModal', 'Preferences', '760px');
            const profilGovde = duzenPencere('profileModal', 'Profiles', '560px');

            // ---- Model karti
            const kModel = duzenKart('kartModel', 'Model');
            const ozet = document.getElementById('entityInfoSummary');
            if (ozet) { duzenTasi(kModel, [ozet]); ozet.style.display = 'block'; ozet.style.marginTop = '0'; const t = ozet.querySelector('.entity-section-title'); if (t) t.remove(); }
            // Generate + maintenance (Model sekmesinin ilk iki h3 blogu)
            const uret = duzenH3Blogu(M, 'Generate'), bakim = duzenH3Blogu(M, 'Model maintenance');
            const dugmeSatiri = document.createElement('div');
            dugmeSatiri.style.cssText = 'display:flex; gap:6px; margin:8px 0;';
            // yalnizca basligin HEMEN ardindaki div'in dugmeleri (blok, bir sonraki
            // h3'e kadar uzayip Nodes panelinin "+ Add" dugmelerini de kapsiyordu)
            const ilkDiv = bl => bl ? bl.slice(1).find(x => x.nodeType === 1 && x.tagName === 'DIV') : null;
            const uretDugme = ilkDiv(uret) ? ilkDiv(uret).querySelector('button') : null;
            const bakimDugmeler = ilkDiv(bakim) ? [...ilkDiv(bakim).querySelectorAll('button')] : [];
            if (uretDugme) { uretDugme.style.flex = '1'; dugmeSatiri.appendChild(uretDugme); }
            bakimDugmeler.forEach(b => { b.style.flex = '1'; dugmeSatiri.appendChild(b); });
            kModel.appendChild(dugmeSatiri);
            [uret, bakim].forEach(bl => { if (!bl) return; bl[0].remove(); const d = ilkDiv(bl); if (d) d.remove(); });
            // Profil listesi (Sections paneli) + New profile...
            const kesitPanel = kapsayan(document.getElementById('sectionsCount'), '.collapsible-panel');
            if (kesitPanel) {
                duzenTasi(kModel, [kesitPanel]);
                const ust = kesitPanel.querySelector('.collapsible-header');
                if (ust && !ust.classList.contains('open')) ust.classList.add('open');
                const icerik = kesitPanel.querySelector('.collapsible-content');
                if (icerik) icerik.classList.add('open');
                const yeni = document.createElement('button');
                yeni.className = 'btn-secondary btn-small btn-block';
                yeni.textContent = '+ New profile…';
                yeni.title = 'Create a profile (HP, FB, T, L, pipe) with or without attached plate';
                yeni.onclick = showProfileBuilder;
                yeni.style.marginTop = '6px';
                kModel.appendChild(yeni);
            }
            // Dogrulama ozeti (Check ciktisi)
            const dogrulama = kapsayan(document.getElementById('validationSummary'), '.collapsible');
            if (dogrulama) duzenTasi(kModel, [dogrulama]);

            // ---- Loads karti
            const kLoads = duzenKart('kartLoads', 'Loads');
            const durumKart = kapsayan(document.getElementById('etkinYukDurumu'), '.panel-card');
            if (durumKart) { duzenTasi(kLoads, [durumKart]); durumKart.classList.remove('panel-card'); durumKart.style.marginBottom = '8px'; }
            // Kombinasyon secici + Solve/Edit (Results sekmesinden) - Loads kartina
            const komb = kapsayan(document.getElementById('loadCombSelect'), 'div[style*="border-top"]');
            if (komb) { duzenTasi(kLoads, [komb]); komb.style.marginTop = '0'; komb.style.borderTop = 'none'; komb.style.paddingTop = '0'; }
            const ozAg = kapsayan(document.getElementById('includeSelfWeight'), 'div[style*="border-top"]');
            if (ozAg) { duzenTasi(kLoads, [ozAg]); ozAg.style.marginTop = '4px'; ozAg.style.borderTop = 'none'; ozAg.style.paddingTop = '0'; }
            const basincKart = kapsayan(document.getElementById('basincTablo'), '.panel-card');
            if (basincKart) { duzenTasi(kLoads, [basincKart]); basincKart.classList.remove('panel-card'); }

            // ---- Checks karti
            const kChecks = duzenKart('kartChecks', 'Checks');
            const malzeme = kapsayan(document.getElementById('steelGrade'), '.collapsible-panel');
            if (malzeme) {
                // "Material: Structural Steel" sabit bir satir - bilgi degil, gurultu
                const sabit = malzeme.querySelector('.readonly-field');
                if (sabit) { const alan = sabit.closest('.field'); if (alan) alan.remove(); }
                const icerik = malzeme.querySelector('.collapsible-content');
                duzenTasi(kChecks, icerik ? [...icerik.childNodes] : [malzeme]);
                if (icerik) malzeme.remove();
            }
            ['Stress Limits', 'Deflection Limit'].forEach(ad => {
                const bl = duzenH3Blogu(S, ad);
                if (bl) { bl[0].classList.add('duzen-altbaslik'); duzenTasi(kChecks, bl); }
            });

            // ---- Results karti
            const kResults = duzenKart('kartResults', 'Results');
            if (R) {
                const h2 = R.querySelector(':scope > h2'); if (h2) h2.remove();
                // karttaki renk olcegi tuval ustundeki "Von Mises Stress" lejantiyla cift
                const olcek = kapsayan(document.getElementById('scaleMidLeft'), 'div[style*="margin-bottom"]');
                if (olcek) duzenGizle(olcek, 'kart renk olcegi (lejant tuvalde)');
                // "Deformed" arac cubugunda (Animate'in yani) zaten var
                duzenGizle(document.getElementById('btnDeformedViz'), 'kart Deformed anahtari (arac cubugunda)');
                duzenTasi(kResults, [...R.childNodes]);
            }

            // ---- Preferences penceresi: Settings'in geri kalani
            ['Interface', 'Solver Validation', 'Units', 'Material Library', 'Grid Settings', 'Color Theme', 'Display Sizes'].forEach(ad => {
                const bl = duzenH3Blogu(S, ad);
                if (bl) duzenTasi(tercihGovde, bl);
            });
            // ---- Bulb profil ailesi secici (Preferences)
            // Ayni "HP 200x10" her tabloda ayni kesit degil: AFNOR ailesi EN'e
            // gore alanda %4-6,5 buyuk (BV MARS2000 tablolariyla olculdu).
            // Cizim hangi standartsa o secilir; secim raporda da yazilir.
            if (typeof HP_AILELERI !== 'undefined' && typeof hpAilesiSec === 'function') {
                const aileBlok = document.createElement('div');
                aileBlok.className = 'form-group';
                aileBlok.style.marginTop = '10px';
                const etiket = document.createElement('label');
                etiket.textContent = 'Bulb profile standard';
                const sec = document.createElement('select');
                sec.id = 'hpAileSec';
                sec.className = 'form-control';
                hpAilesiListesi().forEach(a => {
                    const o = document.createElement('option');
                    o.value = a.kod;
                    o.textContent = a.ad + '  (' + a.olcu + ' sizes)';
                    sec.appendChild(o);
                });
                sec.value = hpAktifAile().kod;
                const not = document.createElement('small');
                not.style.cssText = 'display:block; color:var(--text-3, #64748b); font-size:var(--fs-xs, 0.72rem); margin-top:4px;';
                const notYaz = () => {
                    const a = HP_AILELERI[sec.value] || {};
                    not.textContent = a.kaynak || '';
                };
                notYaz();
                sec.onchange = () => {
                    if (!hpAilesiSec(sec.value)) return;
                    notYaz();
                    if (typeof showToast === 'function') showToast('Bulb standard: ' + hpAktifAile().ad, 'info');
                    // Kesit ozellikleri degisti: sonuclar bayatladi
                    if (typeof sonuclariTazele === 'function') { try { sonuclariTazele(); } catch (e) { } }
                };
                aileBlok.appendChild(etiket); aileBlok.appendChild(sec); aileBlok.appendChild(not);
                tercihGovde.appendChild(aileBlok);
            }

            // Izgara sonsuz (kamerayi izler): boyut alanlari anlamsiz, gizlenir
            ['gridSizeX', 'gridSizeY'].forEach(id => { const el = document.getElementById(id); const fg = el && el.closest('.form-group'); if (fg) duzenGizle(fg, 'izgara boyutu (sonsuz izgara)'); });
            // Proje bilgisi modeli tanimlar (ad, no, revizyon; raporun basligi) -> Model karti sonu
            const proje = duzenH3Blogu(S, 'Project');
            if (proje) { proje[0].classList.add('duzen-altbaslik'); duzenTasi(kModel, proje); }
            // ---- Profil penceresi: General'in profil olusturucusu
            const profil = kapsayan(document.getElementById('profilesCount'), '.collapsible-panel');
            if (profil) {
                // baslik (Beam Profiles + sayac) pencere basligiyla cift; icerik
                // dogrudan pencere govdesine, kendi kaydirma kutusu olmadan
                const icerik = profil.querySelector('.collapsible-content');
                duzenTasi(profilGovde, icerik ? [...icerik.childNodes] : [profil]);
                if (icerik) profil.remove();
            }

            // ---- kiris karti: profil secici "Edit Section" kutusundan (varsayilan
            // kapaliydi, kullanici bulamadi) Section kutusuna; ayri kutu kalkar
            const sec = document.getElementById('infoEditSection');
            const secKutu = document.getElementById('beamEditSectionSection');
            const bolum = kapsayan(document.getElementById('infoBeamSection'), '.entity-section');
            if (sec && secKutu && bolum) {
                const uygula = secKutu.querySelector('button');
                const satir = document.createElement('div');
                satir.style.cssText = 'display:flex; gap:6px; margin-top:8px;';
                sec.style.marginBottom = '0'; sec.style.flex = '1'; sec.style.fontSize = 'var(--fs-sm)';
                satir.appendChild(sec);
                if (uygula) { uygula.classList.remove('btn-block'); uygula.style.flexShrink = '0'; satir.appendChild(uygula); }
                bolum.appendChild(satir);
                secKutu.remove();
                DUZEN_BILGI.gizlenen.push('Edit Section kutusu (secici Section kutusunda)');
            }

            // ---- sag panele yerlestir: bagLam kartlari ustte kalir, sonra kartlar
            const baslik = sag.querySelector('.entity-info-header');
            if (baslik) duzenGizle(baslik, 'Properties basligi');
            duzenGizle(document.getElementById('sonucKipiNotu'), 'salt okunur notu');
            const bos = document.getElementById('entityInfoEmpty');
            if (bos) bos.classList.add('duzen-bos');
            // kartlar mevcut bagLam kartlariyla ayni govdeye (ayni ic bosluk, ayni kenar)
            const govde = sag.querySelector('.entity-info-body') || sag;
            [kModel, kLoads, kChecks, kResults].forEach(k => govde.appendChild(k));

            // ---- sol panel, sekme dugmeleri, Boundary: kalkar
            duzenGizle(sol, 'sol panel');
            duzenGizle(document.getElementById('leftPanelResizeHandle'), 'sol tutamac');
            document.querySelectorAll('.main-tab').forEach(b => duzenGizle(b, 'sekme ' + b.id));
            duzenGizle(B, 'Boundary sekmesi (kisit tablosu alt panelde, presetler dugum kartinda)');
            duzenGizle(G, 'General sekmesi (kalan: bos)');
            duzenGizle(M, 'Model sekmesi (dugum/kiris tablolari alt panelde)');
            duzenGizle(L, 'Loads sekmesi (formlar kartlarda, tablolar alt panelde)');
            duzenGizle(S, 'Settings sekmesi (Preferences penceresi)');

            // ---- ust cubuk: Preferences dugmesi
            const eylemler = document.querySelector('.header-actions');
            if (eylemler) {
                const d = document.createElement('button');
                d.className = 'btn-secondary btn-small';
                d.id = 'preferencesBtn';
                d.title = 'Preferences (interface, theme, grid, units, project)';
                d.innerHTML = '<span class="icon"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg></span>';
                d.onclick = showPreferences;
                const tema = document.getElementById('themeToggle');
                if (tema && tema.parentNode === eylemler) eylemler.insertBefore(d, tema); else eylemler.appendChild(d);
            }

            // ---- Solve dugmesi eylem cubuguna (sekme grubu bos kaldi)
            const solve = document.getElementById('solveBtn');
            if (solve && eylemler) { eylemler.insertBefore(solve, eylemler.firstChild); solve.style.marginRight = '8px'; }
            const grup = document.querySelector('.main-tab-group');
            if (grup && !grup.querySelector('button:not([hidden])')) duzenGizle(grup, 'sekme grubu');

            // ---- sag panel genisligi: 340 px (280 dar kaliyor; hafizadaki deger de yukseltilir)
            if (typeof readLayout === 'function' && typeof writeLayout === 'function') {
                const d = readLayout();
                if (!(d.rightW >= 340)) { d.rightW = 340; writeLayout(d); }
                if (!d.rightOff) sag.style.width = d.rightW + 'px';
            } else if (sag.offsetWidth < 340) sag.style.width = '340px';

            // ---- alt tablo paneli her zaman acik (cozumden once model tablolari)
            const alt = document.getElementById('resultsBottomPanel');
            if (alt) {
                alt.style.display = 'flex';
                if (!alt.style.height) alt.style.height = '220px';
                if (typeof updateResultsBottomPanel === 'function') updateResultsBottomPanel();
                if (typeof syncResultsPanelSpace === 'function') syncResultsPanelSpace();
            }

            document.body.classList.add('tek-panel');
            document.body.classList.remove('duzen-bekle');
            if (typeof syncPanelLayout === 'function') syncPanelLayout();
            return DUZEN_BILGI;
        }

        // Kartlardan birini acip gorunur yap (eski switchMainTab'in karsiligi)
        function duzenKartaGit(ad) {
            const id = { model: 'kartModel', loads: 'kartLoads', checks: 'kartChecks', results: 'kartResults', general: 'kartModel', boundary: null, settings: 'kartChecks' }[ad];
            if (!id) return;
            const k = document.getElementById(id);
            if (!k) return;
            const icerik = k.querySelector(':scope > .katlama-icerik');
            if (icerik && icerik.style.display === 'none') { const b = k.querySelector(':scope > .entity-section-title'); if (b) b.click(); }
            try { k.scrollIntoView({ block: 'start', behavior: 'smooth' }); } catch (e) { k.scrollIntoView(); }
        }
