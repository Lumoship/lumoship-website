        // ============== KURAL KESIT MODULU / KAYMA ALANI (PRESCRIPTIVE) ==============
        //
        // Dogrudan hesabin (izgara cozumu) yaninda kuralin "formulle" istedigi
        // asgari net kesit modulu ve kayma alani. Kaynaklar:
        //   DNV RU-SHIP Pt.3 Ch.6 Sec.6 [2.1.1]/[2.1.2] (PSM, yanal basinc):
        //     Z    = 1000 |P| S l_bdg^2 / (f_bdg Cs ReH)         [cm3]
        //     Ashr = 10 f_shr |P| S l_shr / (Ct tau_eH)          [cm2]
        //     Cs = Ct = 0.70 (AC-I), 0.85 (AC-II / AC-III); Tablo 1 f_bdg, f_shr
        //   BV NR467 Pt.B Ch.7 Sec.6 [2.1.1]/[2.1.2]:
        //     Zn50 = 1000 P S l_bdg^2 / (chi f_bdg Cs ReH),  Ashr = 10 f_shr P S l_shr / (chi Ct tau_eH)
        //     Cs, Ct Tab 2 (AC-1 0.70, AC-2 0.85, AC-3 0.90); chi Ch.7 Sec.4; Tab 3 = DNV Tablo 1
        //
        // P*S bir HAT YUKUDUR (kN/m): formule giren tek sey q = P*S. Bu yuzden
        // uye uzerindeki etkin hat yuku (basinc yamalari + hat yukleri, etkin
        // kombinasyonun katsayilariyla, dusey bilesen) dogrudan q olarak alinir;
        // ayri "P" ve "S" girmek gerekmez. Rapor ve tablo q'yu yazar.
        //
        // Yuk modeli (Tablo 1 / Tab 3, sekiller img'den okundu):
        //   A sabit-sabit, duzgun yayili        f_bdg 12 / 24 / 12,  f_shr 0.50 / 0.50
        //   B mafsal(1)-sabit(3), duzgun        f_bdg  - / 14.2 / 8, f_shr 0.38 / 0.63
        //   C mafsal-mafsal, duzgun             f_bdg  - / 8 / -,    f_shr 0.50 / 0.50
        //   D sabit-sabit, ucgen (tepe 3'te)    f_bdg 15 / 23.3 / 10, f_shr 0.30 / 0.70
        //   E mafsal(1)-sabit(3), ucgen         f_bdg  - / 16.8 / 7.5, f_shr 0.20 / 0.80
        //   F konsol (3 sabit), duzgun          f_bdg  - / - / 2,    f_shr - / 1.0
        //   Not 3: mesnet bolgesinde f_bdg <= 12; aciklikta f_bdg = 24 ya da tablodaki
        //   kucuk olan; uc baglantida f_shr = max(0.5, f_shr1, f_shr3).
        // Uye = burkulma/sehimdeki aciklik zinciri; uc sabitligi ucun donme
        // tutulmasindan ya da sureklilikten (ayni dogrultuda devam eden kiris)
        // okunur; elem.kuralModel = 'A'..'F' ile zorlanir. Yuk dagilimi
        // duzgun varsayilir (D/E yalnizca elle).

        const KURAL_YUK_MODELLERI = {
            A: { ad: 'fixed-fixed, uniform',      bdg1: 12.0, bdg2: 24.0, bdg3: 12.0, shr1: 0.50, shr3: 0.50 },
            B: { ad: 'pinned-fixed, uniform',     bdg1: null, bdg2: 14.2, bdg3: 8.0,  shr1: 0.38, shr3: 0.63 },
            C: { ad: 'pinned-pinned, uniform',    bdg1: null, bdg2: 8.0,  bdg3: null, shr1: 0.50, shr3: 0.50 },
            D: { ad: 'fixed-fixed, triangular',   bdg1: 15.0, bdg2: 23.3, bdg3: 10.0, shr1: 0.30, shr3: 0.70 },
            E: { ad: 'pinned-fixed, triangular',  bdg1: null, bdg2: 16.8, bdg3: 7.5,  shr1: 0.20, shr3: 0.80 },
            F: { ad: 'cantilever, uniform',       bdg1: null, bdg2: null, bdg3: 2.0,  shr1: null, shr3: 1.0 }
        };

        // Kural katsayilari secili gerilme tabanindan (sinirlar.js)
        function kuralKatsayilari() {
            const k = (typeof kontrolAyarlari === 'function') ? kontrolAyarlari() : { taban: 'yield' };
            const t = GERILME_TABANLARI[k.taban] || {};
            if (k.taban === 'dnv-ac1') return { kaynak: 'DNV RU-SHIP Pt.3 Ch.6 Sec.6 [2.1] AC-I', Cs: 0.70, Ct: 0.70, chi: 1 };
            if (k.taban === 'dnv-ac2') return { kaynak: 'DNV RU-SHIP Pt.3 Ch.6 Sec.6 [2.1] AC-II/III', Cs: 0.85, Ct: 0.85, chi: 1 };
            if (t.bv) {
                const chi = (typeof BV_CHI !== 'undefined' && BV_CHI[k.chi]) ? BV_CHI[k.chi] : 1;
                return { kaynak: 'BV NR467 Pt.B Ch.7 Sec.6 [2.1] ' + t.ad.replace(/^BV NR467 Ch\.7 Sec\.6 /, ''), Cs: t.cs, Ct: t.ct, chi: chi };
            }
            // akma / manual: katsayisiz (Cs = Ct = 1) - tablo bunu yazar
            return { kaynak: 'no rule basis selected (Cs = Ct = 1.0) — choose DNV or BV in the Checks card › Basis', Cs: 1, Ct: 1, chi: 1 };
        }

        // Ucun sabitligi: dugumde egilme eksenine gore donme tutulmus mu, ya da
        // ayni dogrultuda (zincir disinda) devam eden kiris var mi (sureklilik)
        function kuralUcSabitMi(dugumId, uye, yon) {
            const c = model.constraints && model.constraints[dugumId];
            if (c && typeof c === 'object') {
                if (c.Rx && c.Ry && c.Rz) return true;
                // egilme ekseni: yerel y'nin en buyuk global bileseni
                const n1 = model.nodes[model.elements[uye[0]].n1], n2 = model.nodes[model.elements[uye[0]].n2];
                const cer = (typeof elementFrame === 'function' && n1 && n2) ? elementFrame(n1, n2, model.elements[uye[0]].orientation || 0) : null;
                if (cer) {
                    const y = cer.y.map(Math.abs);
                    const eksen = y[0] >= y[1] && y[0] >= y[2] ? 'Rx' : (y[1] >= y[2] ? 'Ry' : 'Rz');
                    if (c[eksen]) return true;
                }
            } else if (c === 'fixed') return true;
            // sureklilik: dugumde zincir disi, paralel kiris
            const uyeSet = new Set(uye.map(String));
            return Object.entries(model.elements).some(([id, e]) => {
                if (uyeSet.has(String(id))) return false;
                if (e.n1 !== dugumId && e.n2 !== dugumId) return false;
                const a = model.nodes[e.n1], b = model.nodes[e.n2];
                if (!a || !b) return false;
                const L = Math.hypot(b.x - a.x, b.y - a.y, (b.z || 0) - (a.z || 0));
                if (L < 1e-9) return false;
                const d = [(b.x - a.x) / L, (b.y - a.y) / L, ((b.z || 0) - (a.z || 0)) / L];
                return Math.abs(d[0] * yon[0] + d[1] * yon[1] + d[2] * yon[2]) > 0.9999;
            });
        }

        // Uyenin uzerindeki en buyuk dusey hat yuku q (kN/m), etkin kombinasyon
        // katsayilariyla (basinc yamalari dahil). Asagi + .
        function kuralHatYuku(uye) {
            const kats = (typeof currentLoadFactors === 'function') ? currentLoadFactors() : {};
            if (typeof basincYukleriniHazirla === 'function') basincYukleriniHazirla();
            let q = 0;
            uye.forEach(id => {
                const e = model.elements[id];
                const liste = (typeof etkinHatYukleri === 'function') ? etkinHatYukleri(e, id) : (e.lineLoads || []);
                let toplam = 0;
                liste.forEach(l => {
                    if (l.kaynak === 'point') return;                                  // tekil yuk seridi degil
                    const f = (typeof yukKatsayisiOku === 'function') ? yukKatsayisiOku(kats, l.case) : 1;
                    const v = parseFloat(l.value !== undefined ? l.value : l.q) || 0;
                    const yerel = (l.direction === 'local' || l.direction === 'localZ' || l.direction === 'localY');
                    toplam += yerel ? 0 : v * f;                                       // yalnizca global dusey (+ asagi)
                });
                q = Math.max(q, Math.abs(toplam));
            });
            return q;
        }

        // Butun uyeler. results: aciklik zinciri icin (burkulmaUyeleri). Donus:
        // { elemId: kayit } - zincirdeki her parca ayni kaydi alir.
        function kuralKesitKontrolu(results) {
            const out = {};
            if (!results || !results.elementResults || typeof burkulmaUyeleri !== 'function') return out;
            const kat = kuralKatsayilari();
            const grade = document.getElementById('steelGrade') ? document.getElementById('steelGrade').value : 'AH36';
            const genelMat = MATERIALS[grade] || MATERIALS['AH36'];
            const mesnetli = id => { const c = model.constraints && model.constraints[id]; return !!(c && (c === 'fixed' || c === 'pinned' || c === 'simply_supported' || c.Uz)); };
            burkulmaUyeleri(results).forEach(ids => {
                const uye = ids.filter(id => model.elements[id] && results.elementResults[id] && !results.elementResults[id].rigid);
                if (!uye.length) return;
                const ilk = model.elements[uye[0]], son = model.elements[uye[uye.length - 1]];
                const sec = (typeof kesitBul === 'function') ? kesitBul(ilk.section) : SECTIONS[ilk.section];
                if (!sec || sec.rigid || !(sec.A > 0)) return;
                const mat = (typeof elemanMalzemesi === 'function') ? elemanMalzemesi(ilk, genelMat) : genelMat;
                const fy = mat.yield / 1e6, tauEH = fy / Math.sqrt(3);
                // zincir uclari ve boyu
                const a = model.nodes[ilk.n1], b = model.nodes[son.n2];
                const bas = ilk.n1, sonD = son.n2;
                const L = uye.reduce((s, id) => { const e = model.elements[id]; const p = model.nodes[e.n1], r = model.nodes[e.n2]; return s + ((p && r) ? Math.hypot(r.x - p.x, r.y - p.y, (r.z || 0) - (p.z || 0)) : 0); }, 0);
                if (!(L > 0)) return;
                const yon = [(b.x - a.x) / L, (b.y - a.y) / L, ((b.z || 0) - (a.z || 0)) / L];
                // yuk modeli
                let modelAd = (ilk.kuralModel && KURAL_YUK_MODELLERI[ilk.kuralModel]) ? ilk.kuralModel : '';
                const basM = mesnetli(bas), sonM = mesnetli(sonD);
                let otomatik = '';
                if (!modelAd) {
                    if (basM !== sonM) otomatik = 'F';
                    else {
                        const f1 = kuralUcSabitMi(bas, uye, yon), f3 = kuralUcSabitMi(sonD, uye, yon);
                        otomatik = (f1 && f3) ? 'A' : ((f1 || f3) ? 'B' : 'C');
                    }
                    modelAd = otomatik;
                }
                const m = KURAL_YUK_MODELLERI[modelAd];
                const q = kuralHatYuku(uye);                                            // kN/m = P*S
                // Not 3: mesnet f_bdg <= 12, aciklik 24 ya da tablo; uc f_shr = max(0.5, f1, f3)
                const fMesnet = Math.min(12, Math.max(m.bdg1 || 0, m.bdg3 || 0)) || null;
                const fAciklik = m.bdg2 ? Math.min(24, m.bdg2) : null;
                const fShr = Math.max(0.5, m.shr1 || 0, m.shr3 || 0);
                const payda = kat.chi * kat.Cs * fy;
                const Zaciklik = fAciklik ? 1000 * q * L * L / (fAciklik * payda) : null;   // cm3
                const Zmesnet = fMesnet ? 1000 * q * L * L / (fMesnet * payda) : null;
                const Zreq = Math.max(Zaciklik || 0, Zmesnet || 0);
                const Areq = 10 * fShr * q * L / (kat.chi * kat.Ct * tauEH);            // cm2
                // gercek: en kucuk lif modulu (cm3) ve kural kayma alani (cm2)
                const WyT = (sec.WyTop > 0) ? sec.WyTop : sec.Wy, WyB = (sec.WyBot > 0) ? sec.WyBot : sec.Wy;
                const Za = ((WyT > 0 && WyB > 0) ? Math.min(WyT, WyB) : (sec.Wy || 0)) * 1e6;
                const Aa = ((sec.Aweb > 0) ? sec.Aweb : (sec.h > 0 && sec.tw > 0 ? sec.h * sec.tw : sec.A * 0.6)) * 1e4;
                const kZ = Za > 0 ? Zreq / Za : null, kA = Aa > 0 ? Areq / Aa : null;
                const kullanim = Math.max(kZ || 0, kA || 0);
                // IZGARA UYESI: aciklik icinde baska kirislerin bagLandigi (mesnetsiz)
                // dugum varsa uye capraz kirislerle tasiniyor demektir; kural formulu
                // bunu gormez ve mesnetler arasi tam acikligi alir (DNV Sec.6 [1.1.2]:
                // izgara -> dogrudan hesap). Sayilar yine yazilir ama durum
                // "grillage (direct analysis governs)" olur, FAIL sayilmaz.
                const uyeSet = new Set(uye.map(String));
                const icDugumler = new Set();
                uye.forEach(id => { const e = model.elements[id]; [e.n1, e.n2].forEach(n => { if (n !== bas && n !== sonD) icDugumler.add(n); }); });
                const izgara = [...icDugumler].some(n => !mesnetli(n) && Object.entries(model.elements).some(([id, e]) => !uyeSet.has(String(id)) && (e.n1 === n || e.n2 === n)));
                const kayit = {
                    uye: uye.map(x => parseInt(x, 10)), ad: ilk.ad || '', L: L, q: q, model: modelAd, otomatik: !ilk.kuralModel, modelAd: m.ad, izgara: izgara,
                    fBdgAciklik: fAciklik, fBdgMesnet: fMesnet, fShr: fShr, Cs: kat.Cs, Ct: kat.Ct, chi: kat.chi, fy: fy, kaynak: kat.kaynak,
                    Zaciklik: Zaciklik, Zmesnet: Zmesnet, Zreq: Zreq, Za: Za, Areq: Areq, Aa: Aa, kZ: kZ, kA: kA, kullanim: kullanim,
                    durum: q <= 0 ? 'no load' : (izgara ? 'grillage (direct analysis governs)' : (kullanim > 1 ? 'FAIL' : (kullanim > 0.9 ? 'check' : 'ok')))
                };
                uye.forEach(id => { out[id] = kayit; });
            });
            return out;
        }

        // Ozet metni (Results paneli / rapor)
        function kuralOzeti(results) {
            const k = kuralKesitKontrolu(results);
            const gor = new Set(); const uyeler = [];
            Object.values(k).forEach(x => { if (!gor.has(x)) { gor.add(x); uyeler.push(x); } });
            const yuklu = uyeler.filter(x => x.q > 0);
            const tekil = yuklu.filter(x => !x.izgara), izgara = yuklu.filter(x => x.izgara);
            if (!yuklu.length) return { var_: false, metin: 'Rule section modulus: no laterally loaded member.', uyeler: uyeler };
            if (!tekil.length) return { var_: false, uyeler: uyeler, kaynak: kuralKatsayilari().kaynak,
                metin: 'Rule Z / A_shr: all ' + izgara.length + ' loaded member(s) are grillage members (crossing beams inside the span) — the prescriptive formula does not apply, direct analysis governs (values listed for information).' };
            const enKotu = tekil.reduce((m, x) => x.kullanim > m.kullanim ? x : m, tekil[0]);
            const asan = tekil.filter(x => x.kullanim > 1).length;
            return {
                var_: true, ok: asan === 0, enKotu: enKotu, asan: asan, uyeler: uyeler, kaynak: kuralKatsayilari().kaynak,
                metin: 'Rule Z / A_shr (' + kuralKatsayilari().kaynak + '): worst member ' + (enKotu.ad ? enKotu.ad + ' ' : '') + 'beams ' + enKotu.uye.join(',') +
                       ' — Z ' + enKotu.Zreq.toFixed(0) + ' / ' + enKotu.Za.toFixed(0) + ' cm³ (' + Math.round((enKotu.kZ || 0) * 100) + ' %), A_shr ' + enKotu.Areq.toFixed(1) + ' / ' + enKotu.Aa.toFixed(1) + ' cm² (' + Math.round((enKotu.kA || 0) * 100) + ' %)' +
                       (asan ? '; ' + asan + ' member(s) below the rule minimum' : '; all ' + tekil.length + ' member(s) above the rule minimum') +
                       (izgara.length ? '; ' + izgara.length + ' grillage member(s) listed for information only' : '') + '. Load model auto from end fixity (uniform load); q = P·S from the active combination.'
            };
        }
