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
        //
        // BV NR467 (Jul 2026) Pt.B Ch.7 Sec.6 [5.1.4] izgara (grillage) analizi:
        //   sigma_eq <= chi * Kcorr * Ccomb * ReH   (von Mises)
        //   tek kiris: sigma <= chi Kcorr Cs ReH,  tau <= chi Kcorr Ct tau_eH
        //   Tab 2 (butun sinirlar, guverte/flat dahil): AC-1 0.70, AC-2 0.85,
        //   AC-3 0.90 (Cs = Ct = Ccomb). Tab 23: AC-1 liman, AC-2 seyir,
        //   AC-3 tank testi / su almis durum.
        //   chi (Ch.7 Sec.4): saglam 1.00; kaza durumu su gecirmez sinir 1.15
        //   (carpisma perdesi 1.00). Kcorr: genel 1.0; insaatta tank testi 1.2.
        //   model.kontrol.chi = 'intact' | 'accidental', .kcorr = 'general' | 'tanktest'

        const GERILME_TABANLARI = {
            'manual':  { ad: 'Manual (enter limits)' },
            'yield':   { ad: 'Yield stress (σy, σy/√3)' },
            'dnv-ac1': { ad: 'DNV RU-SHIP Ch.6 Sec.6 AC-I (static)', hgli: { beta: 0.85, alpha: 1, csMax: 0.70 }, hgsiz: { beta: 0.70, alpha: 0, csMax: 0.70 }, ct: 0.70 },
            'dnv-ac2': { ad: 'DNV RU-SHIP Ch.6 Sec.6 AC-II/III (static + dynamic)', hgli: { beta: 0.95, alpha: 1, csMax: 0.85 }, hgsiz: { beta: 0.85, alpha: 0, csMax: 0.85 }, ct: 0.85 },
            'bv-ac1':  { ad: 'BV NR467 Ch.7 Sec.6 AC-1 (harbour)',            bv: true, cs: 0.70, ct: 0.70, ccomb: 0.70 },
            'bv-ac2':  { ad: 'BV NR467 Ch.7 Sec.6 AC-2 (seagoing)',           bv: true, cs: 0.85, ct: 0.85, ccomb: 0.85 },
            'bv-ac3':  { ad: 'BV NR467 Ch.7 Sec.6 AC-3 (tank test / flooded)', bv: true, cs: 0.90, ct: 0.90, ccomb: 0.90 }
        };
        const BV_CHI = { intact: 1.00, accidental: 1.15 };
        const BV_KCORR = { general: 1.0, tanktest: 1.2 };
        function tabanDnvMi(taban) { return taban === 'dnv-ac1' || taban === 'dnv-ac2'; }
        function tabanBvMi(taban) { return !!(GERILME_TABANLARI[taban] && GERILME_TABANLARI[taban].bv); }

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
            if (t.bv) {
                // Izgara analizi: von Mises sinir chi*Kcorr*Ccomb*ReH; kayma chi*Kcorr*Ct*tau_eH
                const chi = BV_CHI[k.chi] || 1.0, kc = BV_KCORR[k.kcorr] || 1.0;
                const Cs = chi * kc * t.ccomb, Ct = chi * kc * t.ct;
                return {
                    sigma: Cs * fy, tau: Ct * fy / Math.sqrt(3), Cs: Cs, Ct: Ct, chi: chi, kcorr: kc,
                    aciklama: 'σeq ≤ χ·Kcorr·Ccomb·ReH = ' + chi.toFixed(2) + '·' + kc.toFixed(1) + '·' + t.ccomb.toFixed(2) + '·' + fy.toFixed(0) + ' = ' + (Cs * fy).toFixed(0) + ' MPa;  τ ≤ χ·Kcorr·Ct·τeH = ' + (Ct * fy / Math.sqrt(3)).toFixed(0) + ' MPa  (Pt.B Ch.7 Sec.6 [5.1.4], Tab 2)'
                };
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
            const hgKutu = document.getElementById('hgKutusu'); if (hgKutu) hgKutu.style.display = tabanDnvMi(k.taban) ? '' : 'none';
            const bvKutu = document.getElementById('bvKutusu'); if (bvKutu) bvKutu.style.display = tabanBvMi(k.taban) ? '' : 'none';
            const chiEl = document.getElementById('bvChi'); if (chiEl) chiEl.value = BV_CHI[k.chi] ? k.chi : 'intact';
            const kcEl = document.getElementById('bvKcorr'); if (kcEl) kcEl.value = BV_KCORR[k.kcorr] ? k.kcorr : 'general';
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
            if (oku('bvChi')) k.chi = oku('bvChi').value;
            if (oku('bvKcorr')) k.kcorr = oku('bvKcorr').value;
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
        // ---- Acikliklar ----
        // Sehim ACIKLIK bazinda olculur: ayni adli (elem.ad), dogrusal ve
        // birbirine bagli kirisler bir uye sayilir; uye, dusey mesnetli
        // dugumlerde acikliklara bolunur. Her acikligin sehimi, uclarini
        // birlestiren KIRISE GORE bagil en buyuk sapmadir (uclar mesnetse
        // mutlak sehimle ayni). Eskiden 600 mm'lik bir tasiyici parcasi 11 mm
        // inince "L/53 FAIL" cikiyordu; tasiyici aslinda 6 m'de L/534.
        // Adsiz kiris tek basina bir acikliktir (kendi kirisine gore bagil).
        function sehimAcikliklari(r) {
            const z = n => n.z || 0;
            const yon = e => { const a = model.nodes[e.n1], b = model.nodes[e.n2]; const L = kirisBoyu3B(e); return L > 1e-9 ? [(b.x - a.x) / L, (b.y - a.y) / L, (z(b) - z(a)) / L] : [0, 0, 0]; };
            const paralel = (u, v) => Math.abs(u[0] * v[0] + u[1] * v[1] + u[2] * v[2]) > 0.9999;
            const mesnetli = id => { const c = model.constraints && model.constraints[id]; return !!(c && (c === 'fixed' || c === 'pinned' || c === 'simply_supported' || c.Uz)); };
            const ids = Object.keys(model.elements).filter(id => r.elementResults[id] && !r.elementResults[id].rigid);
            const kullanildi = new Set();
            const acikliklar = [];
            // dugum -> ayni adli komsu kirisler
            const komsu = {};
            ids.forEach(id => { const e = model.elements[id]; [e.n1, e.n2].forEach(n => { (komsu[n] = komsu[n] || []).push(id); }); });
            ids.forEach(id => {
                if (kullanildi.has(id)) return;
                const e0 = model.elements[id];
                const u0 = yon(e0);
                // zinciri iki yone dogru uzat
                const zincir = [id]; kullanildi.add(id);
                const uzat = (ucId, ileri) => {
                    let ucNode = ucId;
                    for (;;) {
                        if (mesnetli(ucNode)) break;
                        const son = zincir[ileri ? zincir.length - 1 : 0];
                        const aday = (komsu[ucNode] || []).find(k => !kullanildi.has(k) && (model.elements[k].ad || '') === (e0.ad || '') && (e0.ad || '') !== '' && paralel(yon(model.elements[k]), u0) && (model.elements[k].n1 === ucNode || model.elements[k].n2 === ucNode));
                        if (aday === undefined) break;
                        kullanildi.add(aday);
                        if (ileri) zincir.push(aday); else zincir.unshift(aday);
                        const ea = model.elements[aday];
                        ucNode = (ea.n1 === ucNode) ? ea.n2 : ea.n1;
                    }
                    return ucNode;
                };
                // e0'in n2 yonune, sonra n1 yonune
                const sonNode = uzat(e0.n2, true);
                const basNode = uzat(e0.n1, false);
                acikliklar.push({ kirisler: zincir, bas: basNode, son: sonNode, ad: e0.ad || '' });
            });
            return acikliklar;
        }

        // Her kiris: acikligin L, bagil sehim d (mm), L/d, sinir, durum.
        function sehimKontrolu(r) {
            const k = kontrolAyarlari();
            const out = {};
            if (!r || !r.elementResults) return out;
            const z = n => n.z || 0;
            sehimAcikliklari(r).forEach(ac => {
                const A = model.nodes[ac.bas], B = model.nodes[ac.son];
                if (!A || !B) return;
                const L = Math.hypot(B.x - A.x, B.y - A.y, z(B) - z(A));
                let dA = ((r.displacements[ac.bas] || {}).Uz || 0) * 1000, dB = ((r.displacements[ac.son] || {}).Uz || 0) * 1000;
                // Konsol: yalniz bir uc mesnetliyse sehim o uca gore olculur
                // (uc sehimi), kirise gore degil - kirise gore bagil sapma konsolun
                // gercek sehiminin bestebiri kadar cikardi.
                const mesnetliUc = id => { const c = model.constraints && model.constraints[id]; return !!(c && (c === 'fixed' || c === 'pinned' || c === 'simply_supported' || c.Uz)); };
                const basM = mesnetliUc(ac.bas), sonM = mesnetliUc(ac.son);
                if (basM && !sonM) dB = dA; else if (sonM && !basM) dA = dB;
                // acikliktaki her kirisin diyagram noktalari: kirise gore bagil sapma
                let d = 0;
                ac.kirisler.forEach(id => {
                    const e = model.elements[id], er = r.elementResults[id];
                    const a = model.nodes[e.n1];
                    const dg = er && er.diagram;
                    if (!dg || !dg.d) { d = Math.max(d, Math.abs(er.dmax || 0)); return; }
                    dg.x.forEach((x, i) => {
                        // noktanin aciklik basindan uzakligi (kiris n1'den x kadar; n1'in aciklik basina uzakligi)
                        const s0 = Math.hypot(a.x - A.x, a.y - A.y, z(a) - z(A));
                        const ters = (Math.hypot(model.nodes[e.n2].x - A.x, model.nodes[e.n2].y - A.y, z(model.nodes[e.n2]) - z(A)) < s0);
                        const s = ters ? s0 - x : s0 + x;
                        const kiris = L > 1e-9 ? dA + (dB - dA) * s / L : dA;
                        d = Math.max(d, Math.abs(dg.d[i] - kiris));
                    });
                });
                const oran = d > 1e-9 ? (L * 1000) / d : Infinity;
                let sinirMm = null;
                if (k.sehimOran > 0) sinirMm = L * 1000 / k.sehimOran;
                if (k.sehimMm > 0) sinirMm = (sinirMm === null) ? k.sehimMm : Math.min(sinirMm, k.sehimMm);
                const kullanim = (sinirMm && sinirMm > 0) ? d / sinirMm : null;
                const kayit = { L: L, d: d, oran: oran, sinirMm: sinirMm, kullanim: kullanim, aciklik: ac.kirisler.length > 1 ? (ac.ad + ': ' + ac.kirisler.length + ' beams, ' + (L * 1000).toFixed(0) + ' mm') : '',
                                durum: kullanim === null ? 'no limit' : (kullanim > 1 ? 'OVER' : (kullanim > 0.9 ? 'check' : 'ok')) };
                ac.kirisler.forEach(id => { out[id] = kayit; });
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
                metin: 'Limit ' + sinirYazi + '. Worst Beam #' + id + (v.aciklik ? ' (span ' + v.aciklik + ')' : '') + ': ' + v.d.toFixed(2) + ' mm = L/' + (isFinite(v.oran) ? v.oran.toFixed(0) : '∞') +
                       ' (' + (v.kullanim * 100).toFixed(0) + '% of limit)' + (asan ? '; ' + asan + ' beam(s) OVER' : '') + '. Spans: same-named collinear beams between supports; deflection relative to the span chord.'
            };
        }
