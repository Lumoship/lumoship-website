        // ============== KATLANABILIR BOLUMLER ==============
        //
        // panel-yogunluk olcumu: Settings 2 000 px, Loads 415 px, sag panel
        // (kiris secili + sonuc) 509 px tasiyordu. Basliklar tiklanabilir;
        // icerik gizlenince yer acilir, durum localStorage'da kalir.
        //
        //   - Settings: h3.panel-title basliklari; sonraki kardesler bir sonraki
        //     h3'e kadar icerik sayilir (bir sarmalayiciya alinir).
        //   - Loads: .subpanel-title basliklari, ayni kural.
        //   - Sag panel: .entity-section kutusu; baslik ilk cocuk, gerisi icerik.
        // Denetimler (ui-audit) gizli icerige bakmaz: kapali bolum display:none.

        const KATLAMA_ANAHTAR = 'lumostruct_katlama';
        const KATLAMA_VARSAYILAN_KAPALI = new Set([
            // Settings
            'Interface', 'Solver Validation', 'Material Library', 'Grid Settings', 'Color Theme', 'Display Sizes',
            // Loads
            'Add pressure patch',
            // Sag panel
            'Buckling length factors', 'Hinges (moment release)', 'Edit Section', 'Orientation', 'Diagrams'
        ]);

        function katlamaDurumu() {
            try { return JSON.parse(localStorage.getItem(KATLAMA_ANAHTAR) || '{}') || {}; } catch (e) { return {}; }
        }
        function katlamaKaydet(durum) {
            try { localStorage.setItem(KATLAMA_ANAHTAR, JSON.stringify(durum)); } catch (e) { /* gizli pencere */ }
        }
        function katlamaAdi(baslik) {
            return (baslik.textContent || '').replace(/\s+/g, ' ').trim().replace(/\s*[▾▴]$/, '');
        }

        // baslik: tiklanan eleman; icerik: gizlenecek kutu
        function katlamaBagla(baslik, icerik, ad) {
            if (!baslik || !icerik || baslik.dataset.katlama) return;
            baslik.dataset.katlama = ad;
            const durum = katlamaDurumu();
            const acik = (durum[ad] !== undefined) ? !!durum[ad] : !KATLAMA_VARSAYILAN_KAPALI.has(ad);
            const ok = document.createElement('span');
            ok.className = 'katlama-ok';
            ok.setAttribute('aria-hidden', 'true');
            baslik.appendChild(ok);
            baslik.style.cursor = 'pointer';
            baslik.style.userSelect = 'none';
            const uygula = a => {
                icerik.style.display = a ? '' : 'none';
                ok.textContent = a ? ' ▾' : ' ▸';
                baslik.setAttribute('aria-expanded', a ? 'true' : 'false');
            };
            uygula(acik);
            baslik.addEventListener('click', e => {
                // basligin icindeki dugme/girdi tiklamalari katlamaz
                if (e.target.closest('button, input, select, a, label')) return;
                const d = katlamaDurumu();
                const simdi = icerik.style.display === 'none';
                d[ad] = simdi;
                katlamaKaydet(d);
                uygula(simdi);
            });
        }

        // Ayni ebeveyn altindaki basliklari sarmalayip katlar.
        function basliklariKatla(kok, baslikSecici) {
            if (!kok) return 0;
            const basliklar = [...kok.querySelectorAll(baslikSecici)].filter(h => !h.dataset.katlama);
            let n = 0;
            basliklar.forEach(h => {
                const ebeveyn = h.parentNode;
                const icerik = document.createElement('div');
                icerik.className = 'katlama-icerik';
                let k = h.nextSibling;
                while (k && !(k.nodeType === 1 && k.matches(baslikSecici))) { const sonraki = k.nextSibling; icerik.appendChild(k); k = sonraki; }
                if (!icerik.childNodes.length) return;
                ebeveyn.insertBefore(icerik, k);
                katlamaBagla(h, icerik, katlamaAdi(h));
                n++;
            });
            return n;
        }

        // Sag panel: .entity-section kutulari (baslik ilk cocuk, gerisi icerik)
        function kutulariKatla(kok) {
            if (!kok) return 0;
            let n = 0;
            kok.querySelectorAll('.entity-section').forEach(kutu => {
                const baslik = kutu.querySelector(':scope > .entity-section-title');
                if (!baslik || baslik.dataset.katlama) return;
                const icerik = document.createElement('div');
                icerik.className = 'katlama-icerik';
                let k = baslik.nextSibling;
                while (k) { const sonraki = k.nextSibling; icerik.appendChild(k); k = sonraki; }
                if (!icerik.childNodes.length) return;
                kutu.appendChild(icerik);
                katlamaBagla(baslik, icerik, katlamaAdi(baslik));
                n++;
            });
            return n;
        }

        function katlamalariKur() {
            const say = {
                settings: basliklariKatla(document.getElementById('tabContentSettings'), 'h3.panel-title'),
                loads: basliklariKatla(document.getElementById('tabContentLoads'), '.subpanel-title'),
                sag: kutulariKatla(document.getElementById('rightPanel'))
            };
            return say;
        }
