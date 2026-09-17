        // ============== IZIN VERILEBILIR GERILME VE SEHIM SINIRI ==============
        //
        // Gerilme sinirlari (sigmaLimit / tauLimit) eskiden sinif secilince
        // akma degerine esitleniyor, kullanici elle degistirebiliyordu.
        // Kural tabani yoktu; sinif, sinirlar ve sehim siniri modelle
        // kaydedilmiyordu (dosya acilinca Grade A / 355'e donuyordu).
        //
        // model.kontrol = { taban, hg, sigmaHg, sigma, tau, sehimOran, sehimMm }
        //   taban : 'manual' | 'yield' | 'dnv-ac1' | 'dnv-ac2'
        //   hg    : eleman gemi kirisi (hull girder) yuku tasiyor mu
        //   sigmaHg: o kesitteki gemi kirisi gerilmesi (MPa)
        //   sigma, tau: manual tabanda kullanicinin girdigi (MPa)
        //   sehimOran: L / x siniri (x), sehimMm: mutlak sinir (mm) - bos: yok
        // model.grade = genel celik sinifi (steelGrade secicisi)
        //
        // DNV RU-SHIP Pt.3 Ch.6 Sec.6 [2.2.2] Tablo 2 (PSM, dogrudan hesap):
        //   sigma_perm = Cs * R_eH,  Cs = beta - alpha*|sigma_hg|/R_eH <= Cs-max
        //   tau_perm   = Ct * tau_eH,  tau_eH = R_eH / sqrt(3)
        //   AC-I  (S)      : HG yuklu beta 0.85 alpha 1 Cs-max 0.70 Ct 0.70
        //                    HG yuksuz beta 0.70 alpha 0
        //   AC-II/III (S+D): HG yuklu beta 0.95 alpha 1 Cs-max 0.85 Ct 0.85
        //                    HG yuksuz beta 0.85 alpha 0
        // Sehim: DNV'de PSM icin genel bir L/x yok (ambar kapagi 0.0056 lg);
        // gemi uygulamasinda L/250-L/300 yaygin - kullanici girer.

        const GERILME_TABANLARI = {
            'manual':  { ad: 'Manual (enter limits)' },
            'yield':   { ad: 'Yield stress (σy, σy/√3)' },
            'dnv-ac1': { ad: 'DNV RU-SHIP Ch.6 Sec.6 AC-I (static)', hgli: { beta: 0.85, alpha: 1, csMax: 0.70 }, hgsiz: { beta: 0.70, alpha: 0, csMax: 0.70 }, ct: 0.70 },
            'dnv-ac2': { ad: 'DNV RU-SHIP Ch.6 Sec.6 AC-II/III (static + dynamic)', hgli: { beta: 0.95, alpha: 1, csMax: 0.85 }, hgsiz: { beta: 0.85, alpha: 0, csMax: 0.85 }, ct: 0.85 }
        };

        function kontrolAyarlari() {
            if (typeof model === 'undefined' || !model) return { taban: 'yield' };
            if (!model.kontrol || typeof model.kontrol !== 'object') model.kontrol = { taban: 'yield' };
            if (!GERILME_TABANLARI[model.kontrol.taban]) model.kontrol.taban = 'yield';
            return model.kontrol;
        }

        function genelAkma() {
            const g = (typeof document !== 'undefined' && document.getElementById('steelGrade')) ? document.getElementById('steelGrade').value : (model && model.grade) || 'A';
            const m = (typeof MATERIALS !== 'undefined' && MATERIALS[g]) ? MATERIALS[g] : null;
            return m ? m.yield / 1e6 : 235;
        }

        // Secili tabana gore sinirlar (MPa) ve aciklama
        function gerilmeSinirlariniHesapla() {
            const k = kontrolAyarlari();
            const fy = genelAkma();
            const t = GERILME_TABANLARI[k.taban];
            if (k.taban === 'manual') {
                const s = parseFloat(k.sigma), ta = parseFloat(k.tau);
                return { sigma: isFinite(s) && s > 0 ? s : fy, tau: isFinite(ta) && ta > 0 ? ta : fy / Math.sqrt(3), aciklama: 'manual', Cs: null, Ct: null };
            }
            if (k.taban === 'yield') {
                return { sigma: fy, tau: fy / Math.sqrt(3), aciklama: 'σy = ' + fy.toFixed(0) + ' MPa, τ = σy/√3', Cs: 1, Ct: 1 };
            }
            const p = k.hg ? t.hgli : t.hgsiz;
            const shg = k.hg ? Math.abs(parseFloat(k.sigmaHg) || 0) : 0;
            const Cs = Math.min(p.csMax, p.beta - p.alpha * shg / fy);
            return {
                sigma: Cs * fy, tau: t.ct * fy / Math.sqrt(3), Cs: Cs, Ct: t.ct,
                aciklama: 'Cs = ' + (k.hg ? (p.beta + ' − |' + shg.toFixed(0) + '|/' + fy.toFixed(0) + ' ≤ ' + p.csMax) : p.beta) + ' → ' + Cs.toFixed(3) + '·σy;  Ct = ' + t.ct + '·τeH'
            };
        }

        // Sinirlari arayuze yazar (sigmaLimit/tauLimit girisleri her yerde okunur)
        function gerilmeSinirlariniUygula() {
            if (typeof document === 'undefined') return;
            const k = kontrolAyarlari();
            const s = gerilmeSinirlariniHesapla();
            const sEl = document.getElementById('sigmaLimit'), tEl = document.getElementById('tauLimit');
            const manuel = k.taban === 'manual';
            if (sEl) { if (!manuel) sEl.value = s.sigma.toFixed(0); sEl.readOnly = !manuel; sEl.style.opacity = manuel ? '' : '0.7'; }
            if (tEl) { if (!manuel) tEl.value = s.tau.toFixed(0); tEl.readOnly = !manuel; tEl.style.opacity = manuel ? '' : '0.7'; }
            const taban = document.getElementById('gerilmeTabani'); if (taban && taban.value !== k.taban) taban.value = k.taban;
            const hg = document.getElementById('hgYuklu'); if (hg) hg.checked = !!k.hg;
            const shg = document.getElementById('sigmaHg'); if (shg && k.sigmaHg !== undefined && document.activeElement !== shg) shg.value = k.sigmaHg;
            const hgKutu = document.getElementById('hgKutusu'); if (hgKutu) hgKutu.style.display = (k.taban === 'dnv-ac1' || k.taban === 'dnv-ac2') ? '' : 'none';
            const ac = document.getElementById('gerilmeTabaniAciklama'); if (ac) ac.textContent = s.aciklama;
            const so = document.getElementById('sehimOran'); if (so && document.activeElement !== so) so.value = (k.sehimOran > 0) ? k.sehimOran : '';
            const sm = document.getElementById('sehimMm'); if (sm && document.activeElement !== sm) sm.value = (k.sehimMm > 0) ? k.sehimMm : '';
        }

        // Ayar degisti (Settings sekmesi)
        function kontrolAyariDegisti() {
            const k = kontrolAyarlari();
            const oku = id => document.getElementById(id);
            if (oku('gerilmeTabani')) k.taban = oku('gerilmeTabani').value;
            if (oku('hgYuklu')) k.hg = !!oku('hgYuklu').checked;
            if (oku('sigmaHg')) k.sigmaHg = parseFloat(oku('sigmaHg').value) || 0;
            if (k.taban === 'manual') {
                k.sigma = parseFloat(oku('sigmaLimit')?.value) || genelAkma();
                k.tau = parseFloat(oku('tauLimit')?.value) || genelAkma() / Math.sqrt(3);
            }
            const so = parseFloat(oku('sehimOran')?.value); k.sehimOran = (isFinite(so) && so > 0) ? so : null;
            const sm = parseFloat(oku('sehimMm')?.value); k.sehimMm = (isFinite(sm) && sm > 0) ? sm : null;
            gerilmeSinirlariniUygula();
            if (typeof modelChangedAfterSolve !== 'undefined' && results) { modelChangedAfterSolve = true; if (typeof updateResultsWarning === 'function') updateResultsWarning(); }
            if (typeof autoSaveModel === 'function') autoSaveModel();
        }

        // ---- sehim kontrolu ----
        function kirisBoyu3B(e) {
            const a = model.nodes[e.n1], b = model.nodes[e.n2];
            return (a && b) ? Math.hypot(b.x - a.x, b.y - a.y, (b.z || 0) - (a.z || 0)) : 0;
        }
        // Her kiris: sehim (mm), boy, L/d orani, sinir, durum. results.elementResults[id].dmax mm.
        function sehimKontrolu(r) {
            const k = kontrolAyarlari();
            const out = {};
            if (!r || !r.elementResults) return out;
            Object.entries(model.elements).forEach(([id, e]) => {
                const er = r.elementResults[id];
                if (!er || er.rigid) return;
                const L = kirisBoyu3B(e);
                const d = Math.abs(er.dmax || 0);                // mm (kirise gore bagil sehim)
                const oran = d > 1e-9 ? (L * 1000) / d : Infinity;
                let sinirMm = null;
                if (k.sehimOran > 0) sinirMm = L * 1000 / k.sehimOran;
                if (k.sehimMm > 0) sinirMm = (sinirMm === null) ? k.sehimMm : Math.min(sinirMm, k.sehimMm);
                const kullanim = (sinirMm && sinirMm > 0) ? d / sinirMm : null;
                out[id] = { L: L, d: d, oran: oran, sinirMm: sinirMm, kullanim: kullanim,
                            durum: kullanim === null ? 'no limit' : (kullanim > 1 ? 'OVER' : (kullanim > 0.9 ? 'check' : 'ok')) };
            });
            return out;
        }
        function sehimOzeti(r) {
            const k = kontrolAyarlari();
            if (!(k.sehimOran > 0) && !(k.sehimMm > 0)) return { var_: false, metin: 'No deflection limit set (Settings → L/x).' };
            const s = sehimKontrolu(r);
            const liste = Object.entries(s).filter(([, v]) => v.kullanim !== null);
            if (!liste.length) return { var_: true, ok: true, metin: 'No beams to check.' };
            const enKotu = liste.reduce((a, b) => (b[1].kullanim > a[1].kullanim ? b : a));
            const [id, v] = enKotu;
            const sinirYazi = [(k.sehimOran > 0) ? 'L/' + k.sehimOran : null, (k.sehimMm > 0) ? k.sehimMm + ' mm' : null].filter(Boolean).join(', ');
            const asan = liste.filter(([, x]) => x.kullanim > 1).length;
            return {
                var_: true, ok: asan === 0, enKotuId: id, kullanim: v.kullanim, asan: asan,
                metin: 'Limit ' + sinirYazi + '. Worst Beam #' + id + ': ' + v.d.toFixed(2) + ' mm = L/' + (isFinite(v.oran) ? v.oran.toFixed(0) : '∞') +
                       ' (' + (v.kullanim * 100).toFixed(0) + '% of limit)' + (asan ? '; ' + asan + ' beam(s) OVER' : '')
            };
        }
