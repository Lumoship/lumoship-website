        // ============== ZARF COZUMU (butun kombinasyonlar) ==============
        //
        // Kombinasyon listesi tek tek secilip cozulmek zorundaydi. Zarf:
        // her kombinasyon icin solve() kosar, sonra kiris kiris ve dugum
        // dugum EN KOTU deger secilir; hangi kombinasyonun verdigi yanina
        // yazilir ("governing LC"). Sonuc nesnesi solve() ile ayni sekli
        // tasir - butun tablolar, sahne ve rapor degismeden calisir.
        //
        // Kiris kaydi: von Mises'i en buyuk olan kombinasyonun KAYDI oldugu
        // gibi alinir (tutarli bir kuvvet takimi: M, V, N, diyagram ayni
        // durumdan). Buna ek olarak buyukluk basina zarf da tutulur
        // (e.zarf.dmax, e.zarf.Mmax ...): sehim baska bir kombinasyonda
        // buyuk olabilir. Dugum sehimleri ve tepkiler bilesen basina
        // mutlak en buyuk (isaretiyle).
        //
        // Secici: loadCombSelect'te 'ENV' sanal secenegi. Cozum yolu
        // solveModel -> zarfCoz() (solver-ui.js).

        const ZARF_ID = 'ENV';

        function zarfSecildiMi() {
            const el = (typeof document !== 'undefined') ? document.getElementById('loadCombSelect') : null;
            return ((el && el.value) || (model && model.activeCombination)) === ZARF_ID;
        }

        // Belirli bir kombinasyonla coz (secici ve model gecici degistirilir)
        function kombinasyonlaCoz(id) {
            const el = (typeof document !== 'undefined') ? document.getElementById('loadCombSelect') : null;
            const eskiEl = el ? el.value : null, eskiModel = model.activeCombination;
            try {
                model.activeCombination = id;
                if (el) {
                    if (![...el.options].some(o => o.value === id)) { const o = document.createElement('option'); o.value = id; o.textContent = id; el.appendChild(o); }
                    el.value = id;
                }
                return solve();
            } finally {
                model.activeCombination = eskiModel;
                if (el) el.value = eskiEl;
            }
        }

        function zarfCoz() {
            const ks = kombinasyonlar();
            const tekil = {};
            ks.forEach(k => { tekil[k.id] = kombinasyonlaCoz(k.id); });
            return zarfBirlestir(tekil, ks.map(k => k.id));
        }

        // Kombinasyon sonuclarini tek sonuca indirger.
        function zarfBirlestir(tekil, sira) {
            const ids = sira.filter(id => tekil[id]);
            if (!ids.length) return null;
            const ilk = tekil[ids[0]];
            const out = {
                zarf: { kombinasyonlar: ids, tekil: tekil },
                displacements: {}, elementResults: {}, reactions: {},
                equilibrium: { ok: ids.every(id => tekil[id].equilibrium && tekil[id].equilibrium.ok), error: Math.max(...ids.map(id => Math.abs((tekil[id].equilibrium || {}).error || 0))),
                               appliedFz: null, reactionFz: null },
                maxDeflection: 0, maxMoment: 0, maxShear: 0, maxSigma: 0, maxTau: 0, maxVonMises: 0
            };
            const mutlakEnBuyuk = (alan, sec) => {
                let enIyi = null, enIyiId = null;
                ids.forEach(id => { const v = sec(tekil[id]); if (v === undefined || v === null || !isFinite(v)) return; if (enIyi === null || Math.abs(v) > Math.abs(enIyi)) { enIyi = v; enIyiId = id; } });
                return { deger: enIyi === null ? 0 : enIyi, lc: enIyiId };
            };

            // Kirisler
            Object.keys(ilk.elementResults || {}).forEach(eid => {
                const secim = mutlakEnBuyuk('vm', r => (r.elementResults[eid] || {}).vonMises);
                const kaynak = tekil[secim.lc] || ilk;
                const e = JSON.parse(JSON.stringify(kaynak.elementResults[eid]));
                e.lc = secim.lc;
                e.zarf = {};
                ['vonMises', 'sigma', 'tau', 'Mmax', 'M1', 'M2', 'Mz', 'V', 'N', 'T', 'dmax'].forEach(alan => {
                    e.zarf[alan] = mutlakEnBuyuk(alan, r => (r.elementResults[eid] || {})[alan]);
                });
                // Buyukluk zarflari: sehim ve momentin en kotusu ayri kombinasyondan gelebilir
                e.dmaxZarf = e.zarf.dmax.deger; e.dmaxLc = e.zarf.dmax.lc;
                out.elementResults[eid] = e;
            });
            // Dugum sehimleri: bilesen basina mutlak en buyuk
            Object.keys(ilk.displacements || {}).forEach(nid => {
                const d = {};
                ['Ux', 'Uy', 'Uz', 'Rx', 'Ry', 'Rz'].forEach(b => { const m = mutlakEnBuyuk(b, r => (r.displacements[nid] || {})[b]); d[b] = m.deger; d[b + 'Lc'] = m.lc; });
                out.displacements[nid] = d;
            });
            // Tepkiler
            Object.keys(ilk.reactions || {}).forEach(nid => {
                const t = {};
                ['Fx', 'Fy', 'Fz', 'Mx', 'My', 'Mz'].forEach(b => { const m = mutlakEnBuyuk(b, r => (r.reactions[nid] || {})[b]); t[b] = m.deger; t[b + 'Lc'] = m.lc; });
                out.reactions[nid] = t;
            });
            // Ozet
            ['maxDeflection', 'maxMoment', 'maxShear', 'maxSigma', 'maxTau', 'maxVonMises'].forEach(a => {
                const m = mutlakEnBuyuk(a, r => r[a]); out[a] = m.deger; out[a + 'Lc'] = m.lc;
            });
            // Denge: en buyuk uygulanan yuklu kombinasyon bilgi olarak
            const uyg = mutlakEnBuyuk('appliedFz', r => (r.equilibrium || {}).appliedFz);
            out.equilibrium.appliedFz = uyg.deger; out.equilibrium.reactionFz = (tekil[uyg.lc] && tekil[uyg.lc].equilibrium) ? tekil[uyg.lc].equilibrium.reactionFz : null;
            out.equilibrium.lc = uyg.lc;
            return out;
        }

        // Sonuc zarf mi? Tablolarda "LC" sutunu icin
        function sonucZarfMi(r) { return !!(r && r.zarf && r.zarf.kombinasyonlar); }
