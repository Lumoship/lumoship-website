        // ============== ELEMAN (PILAR) BURKULMA KONTROLU ==============
        //
        // DNV 3D Beam'de "Code" ve "Pillar buckling" sekmeleri var: burkulma
        // boyu carpanlari, akma, malzeme faktoru, kullanim orani. LumoStruct
        // yalnizca LEVHA narinligini (hw/tw) kontrol ediyor, elemanin kendisinin
        // burkulmasina bakmiyordu; sonuc panelinde "member buckling is NOT
        // checked" yaziyordu. Bu dosya o boslugu kapatir.
        //
        // Yontem: EN 1993-1-1 madde 6.3.1, egilmeli (fleksural) burkulma.
        //   Ncr    = pi^2 E I / Lcr^2           (Lcr = K L, iki eksen icin ayri)
        //   lambda = sqrt(A fy / Ncr)
        //   Phi    = 0.5 [1 + alpha (lambda - 0.2) + lambda^2]
        //   chi    = 1 / (Phi + sqrt(Phi^2 - lambda^2))  <= 1
        //   Nb,Rd  = chi A fy / gammaM1
        //   UF     = |N| / Nb,Rd                 (yalnizca BASINC; cekmede 0)
        // DNV RU-SHIP Pt.3 Ch.8 pilar kontrolu de ayni Euler + egri
        // mantigiyla yurur; kullanici "Pillar" sekmesindeki alanlarin
        // karsiligini burada bulur.
        //
        // EKSENEL + EGILME ETKILESIMI - EN 1993-1-1 6.3.3, denklem (6.61)/(6.62),
        // etkilesim katsayilari Ek B (Yontem 2), Tablo B.2 (sinif 3 - elastik):
        //   UF_y = n_y + k_yy My/(My,Rk/gM1) + k_yz Mz/(Mz,Rk/gM1)
        //   UF_z = n_z + k_zy My/(My,Rk/gM1) + k_zz Mz/(Mz,Rk/gM1)
        //   n_y = N/(chi_y A fy/gM1), n_z = N/(chi_z A fy/gM1)
        //   k_yy = Cmy (1 + 0.6 lambda_y n_y) <= Cmy (1 + 0.6 n_y)
        //   k_zz = Cmz (1 + 0.6 lambda_z n_z) <= Cmz (1 + 0.6 n_z)
        //   k_yz = k_zz,  k_zy = 0.8 k_yy   (burulmaya duyarsiz eleman)
        //   Cm (Tablo B.3): dogrusal moment psi = M_kucuk/M_buyuk ->
        //     Cm = 0.6 + 0.4 psi >= 0.4; tepe aciklik icindeyse (enine yuk)
        //     Cm = 1.0 alinir (tablonun ust siniri, guvenli taraf).
        //   My,Rk = Wel,y fy (kucuk lif), Mz,Rk = Wel,z fy. chi_LT = 1
        //   (yanal burkulma AYRI; gemi izgarasinda flans plakaya bagli).
        // Eskiden yalnizca N/Nb,Rd bakiliyordu: egilmeli kolonda (portal
        // ayak, yuklu payanda) kullanim orani oldugundan KUCUK cikiyordu.
        // UF artik etkilesim orani; UFN saf eksenel oran olarak ayrica verilir.
        //
        // YANAL BURULMALI BURKULMA (LTB) - EN 1993-1-1 6.3.2 (genel hal 6.3.2.2):
        //   Mcr = C1 pi^2 E Iz / Lcr^2 * sqrt(Iw/Iz + Lcr^2 G It / (pi^2 E Iz))
        //   lambda_LT = sqrt(Wy fy / Mcr); Phi_LT = 0.5[1 + a_LT(lambda_LT - 0.2) + lambda_LT^2]
        //   chi_LT = 1/(Phi + sqrt(Phi^2 - lambda^2)) <= 1;  Mb,Rd = chi_LT Wy fy / gM1
        //   lambda_LT <= 0.2 ya da M/Mcr <= 0.04 ise kontrol gerekmez (6.3.2.2(4)).
        //   C1 (dogrusal moment): 1.88 - 1.40 psi + 0.52 psi^2 <= 2.70; tepe
        //   aciklik icindeyse 1.0 (guvenli taraf). Iw: T/L/FB/HP acik kesitte 0;
        //   kesit Iw tasiyorsa o. a_LT Tablo 6.4: kaynakli I h/b <= 2 -> c,
        //   > 2 -> d; diger kesitler d (gemi yapisi kaynaklidir).
        //   Lcr = kLT * L (elem.kLT, varsayilan 1 = uclari yanal tutulu).
        // UYGULANMAZ: plakali kesit (isComposite / plateWidth - basinc flansi
        // plakaya bagli), kapali kesit (PIPE/BOX), rijit, Iz/J yok. Kullanici
        // elem.yanalTutulu = false ile plakali kirise de zorlayabilir, true ile
        // serbest kirisi tutulu sayabilir (tripping braketleri vb.).
        // Etkilesimde (6.3.3) My,Rd = chi_LT Wy fy / gM1 ve burulmaya duyarli
        // eleman icin k_zy = 1 - 0.1 lambda_z n_z / (C_mLT - 0.25) (Tablo B.2),
        // C_mLT = C_my.
        //
        // Kusur katsayisi alpha: kesit turune gore EN 1993-1-1 tablo 6.2.
        //   boru (sicak) a = 0.21; lama/bulb/T/L (kaynakli, kalin) c = 0.49.
        //   Kullanici isterse elemana kendi egrisini verir (elem.burkulmaEgrisi).
        // Burkulma boyu carpanlari elem.kY / elem.kZ (varsayilan 1: iki ucu
        // mafsalli). Malzeme faktoru gammaM1 Settings'ten (varsayilan 1.0;
        // DNV "material factor" 1.15 ister, kullanici secer).

        const BURKULMA_EGRILERI = { a0: 0.13, a: 0.21, b: 0.34, c: 0.49, d: 0.76 };

        function burkulmaEgrisi(elem, sec) {
            if (elem && elem.burkulmaEgrisi && BURKULMA_EGRILERI[elem.burkulmaEgrisi] !== undefined) return elem.burkulmaEgrisi;
            const tur = (typeof kesitTuru === 'function') ? kesitTuru(elem && elem.section) : (sec && sec.type) || 'default';
            return tur === 'PIPE' ? 'a' : 'c';
        }

        function burkulmaKi(lambda, alpha) {
            if (lambda <= 0.2) return 1;
            const Phi = 0.5 * (1 + alpha * (lambda - 0.2) + lambda * lambda);
            const kok = Math.sqrt(Math.max(Phi * Phi - lambda * lambda, 0));
            return Math.min(1, 1 / (Phi + kok));
        }

        function yanalTutuluMu(elem, sec) {
            if (elem && typeof elem.yanalTutulu === 'boolean') return elem.yanalTutulu;
            return !!(sec && (sec.isComposite || sec.plateWidth > 0));
        }
        // C1 (Mcr moment dagilimi katsayisi). Dogrusal: 1.88 - 1.40 psi + 0.52 psi^2 <= 2.7
        function c1Katsayisi(M1, M2, Mmax) {
            const a = Math.abs(M1 || 0), b = Math.abs(M2 || 0), m = Math.abs(Mmax || 0);
            const buyuk = Math.max(a, b);
            if (buyuk < 1e-9) return 1;
            if (m > buyuk * 1.001 + 1e-9) return 1;             // tepe aciklik icinde
            const psi = Math.max(-1, Math.min(1, (a >= b) ? (M2 || 0) / (M1 || 1e-12) : (M1 || 0) / (M2 || 1e-12)));
            return Math.min(2.7, 1.88 - 1.40 * psi + 0.52 * psi * psi);
        }
        // Tek eleman LTB. momentler {M1, M2, Mmax} kNm. Donus: { uygulanir, neden, ... }
        function yanalBurkulma(elem, sec, mat, L, momentler, gammaM1) {
            const yok = neden => ({ uygulanir: false, neden: neden, chiLT: 1, UFLT: 0 });
            if (!sec || sec.rigid) return yok('rigid');
            const tur = (typeof kesitTuru === 'function') ? kesitTuru(elem && elem.section) : (sec.type || 'default');
            if (tur === 'PIPE' || sec.type === 'BOX' || sec.type === 'PIPE') return yok('closed section');
            if (yanalTutuluMu(elem, sec)) return yok((elem && typeof elem.yanalTutulu === 'boolean') ? 'restrained (user)' : 'restrained by plating');
            if (!(sec.Iz > 0) || !(sec.J > 0) || !(L > 0)) return yok('no Iz / It');
            const m = momentler || {};
            const My = Math.max(Math.abs(m.M1 || 0), Math.abs(m.M2 || 0), Math.abs(m.Mmax || 0)) * 1e3;   // N·m
            if (!(My > 0)) return yok('no moment');
            const WyT = (sec.WyTop > 0) ? sec.WyTop : sec.Wy, WyB = (sec.WyBot > 0) ? sec.WyBot : sec.Wy;
            const Wy = (WyT > 0 && WyB > 0) ? Math.min(WyT, WyB) : (sec.Wy > 0 ? sec.Wy : 0);
            if (!(Wy > 0)) return yok('no Wy');
            const E = mat.E, G = (mat.G > 0) ? mat.G : E / 2.6, fy = mat.yield;
            const g = (gammaM1 > 0) ? gammaM1 : 1;
            const kLT = (elem && elem.kLT > 0) ? elem.kLT : 1;
            const Lcr = kLT * L;
            const Iw = (sec.Iw > 0) ? sec.Iw : 0;
            const C1 = c1Katsayisi(m.M1, m.M2, m.Mmax);
            const p2 = Math.PI * Math.PI;
            const Mcr = C1 * p2 * E * sec.Iz / (Lcr * Lcr) * Math.sqrt(Iw / sec.Iz + Lcr * Lcr * G * sec.J / (p2 * E * sec.Iz));
            const lambdaLT = Math.sqrt(Wy * fy / Mcr);
            const hb = (sec.h > 0 && sec.bf > 0) ? sec.h / sec.bf : Infinity;
            const egri = (sec.type === 'I') ? (hb <= 2 ? 'c' : 'd') : 'd';
            const alpha = BURKULMA_EGRILERI[egri];
            let chiLT = 1;
            const gereksiz = lambdaLT <= 0.2 || My / Mcr <= 0.04;
            if (!gereksiz) {
                const Phi = 0.5 * (1 + alpha * (lambdaLT - 0.2) + lambdaLT * lambdaLT);
                chiLT = Math.min(1, 1 / (Phi + Math.sqrt(Math.max(Phi * Phi - lambdaLT * lambdaLT, 0))));
            }
            const MbRd = chiLT * Wy * fy / g;
            return { uygulanir: true, neden: gereksiz ? 'slender check not required (λ̄LT ≤ 0.2)' : '', kLT: kLT, Lcr: Lcr, C1: C1, Mcr: Mcr / 1e3, lambdaLT: lambdaLT,
                     egri: egri, alpha: alpha, chiLT: chiLT, MbRd: MbRd / 1e3, My: My / 1e3, UFLT: My / MbRd };
        }

        // Tablo B.3 esdegeri uniform moment katsayisi. M1, M2 uc momentleri
        // (isaretli, kNm), Mmax aciklik boyunca en buyuk mutlak deger.
        function cmKatsayisi(M1, M2, Mmax) {
            const a = Math.abs(M1 || 0), b = Math.abs(M2 || 0), m = Math.abs(Mmax || 0);
            const buyuk = Math.max(a, b);
            if (m < 1e-9 && buyuk < 1e-9) return 1;
            if (m > buyuk * 1.001 + 1e-9) return 1;             // tepe aciklik icinde: enine yuk
            if (buyuk < 1e-9) return 1;
            const psi = (a >= b) ? (M2 || 0) / (M1 || 1e-12) : (M1 || 0) / (M2 || 1e-12);
            return Math.max(0.4, 0.6 + 0.4 * Math.max(-1, Math.min(1, psi)));
        }

        // Tek eleman. N_kN: eksenel kuvvet (kN, cekme +). Donus null: kontrol
        // yapilamadi (rijit, kesitsiz, sifir boy). momentler (istege bagli):
        // { M1, M2, Mmax, Mz1, Mz2, Mz } kNm - verilirse 6.3.3 etkilesimi eklenir.
        function elemanBurkulma(elem, sec, mat, L, N_kN, gammaM1, momentler) {
            if (!sec || sec.rigid || !(sec.A > 0) || !(sec.Iy > 0) || !(sec.Iz > 0) || !(L > 0)) return null;
            const E = mat.E, fy = mat.yield;
            const g = (gammaM1 > 0) ? gammaM1 : 1;
            const kY = (elem.kY > 0) ? elem.kY : 1, kZ = (elem.kZ > 0) ? elem.kZ : 1;
            const egri = burkulmaEgrisi(elem, sec);
            const alpha = BURKULMA_EGRILERI[egri];
            const eksen = (I, K) => {
                const Lcr = K * L;
                const Ncr = Math.PI * Math.PI * E * I / (Lcr * Lcr);
                const lambda = Math.sqrt(sec.A * fy / Ncr);
                const chi = burkulmaKi(lambda, alpha);
                return { Lcr: Lcr, Ncr: Ncr, lambda: lambda, chi: chi, NbRd: chi * sec.A * fy / g };
            };
            const y = eksen(sec.Iy, kY), z = eksen(sec.Iz, kZ);
            const kritik = (y.NbRd <= z.NbRd) ? y : z;
            // Yalnizca basinc; A*fy'nin %0.5'inden kucuk eksenel kuvvet "basinc
            // altinda uye" sayilmaz (izgarada -0.0 kN'lik sayisal artiklar 12
            // kirisi burkulma listesine sokuyordu; egilme zaten gerilme kontrolunde).
            let basinc = Math.max(0, -N_kN) * 1e3;             // N
            if (basinc <= 0.005 * sec.A * fy) basinc = 0;
            const UFN = basinc / kritik.NbRd;
            const lt = yanalBurkulma(elem, sec, mat, L, momentler, g);
            const chiLT = lt.uygulanir ? lt.chiLT : 1;
            // --- 6.3.3 etkilesimi ---
            const m = momentler || {};
            const My = Math.max(Math.abs(m.M1 || 0), Math.abs(m.M2 || 0), Math.abs(m.Mmax || 0)) * 1e3;   // N·m
            const Mz = Math.max(Math.abs(m.Mz1 || 0), Math.abs(m.Mz2 || 0), Math.abs(m.Mz || 0)) * 1e3;
            const WyT = (sec.WyTop > 0) ? sec.WyTop : sec.Wy, WyB = (sec.WyBot > 0) ? sec.WyBot : sec.Wy;
            const Wy = (WyT > 0 && WyB > 0) ? Math.min(WyT, WyB) : (sec.Wy > 0 ? sec.Wy : 0);
            const Wz = (sec.Wz > 0) ? sec.Wz : 0;
            let etk = null;
            if (basinc > 0 && (My > 0 || Mz > 0) && (Wy > 0 || My === 0) && (Wz > 0 || Mz === 0)) {
                const ny = basinc / y.NbRd, nz = basinc / z.NbRd;
                const Cmy = cmKatsayisi(m.M1, m.M2, m.Mmax), Cmz = cmKatsayisi(m.Mz1, m.Mz2, m.Mz);
                const kyy = Math.min(Cmy * (1 + 0.6 * y.lambda * ny), Cmy * (1 + 0.6 * ny));
                const kzz = Math.min(Cmz * (1 + 0.6 * z.lambda * nz), Cmz * (1 + 0.6 * nz));
                const kyz = kzz;
                // burulmaya duyarli eleman (LTB uygulanir): Tablo B.2 ikinci blok
                const CmLT = Cmy;
                const kzy = lt.uygulanir
                    ? Math.max(1 - 0.1 * z.lambda * nz / (CmLT - 0.25), 1 - 0.1 * nz / (CmLT - 0.25))
                    : 0.8 * kyy;
                const MyRd = Wy > 0 ? chiLT * Wy * fy / g : Infinity, MzRd = Wz > 0 ? Wz * fy / g : Infinity;
                const my = My / MyRd, mz = Mz / MzRd;
                etk = { My: My / 1e3, Mz: Mz / 1e3, MyRd: MyRd / 1e3, MzRd: MzRd / 1e3, Cmy: Cmy, Cmz: Cmz,
                        kyy: kyy, kzz: kzz, kyz: kyz, kzy: kzy, ny: ny, nz: nz,
                        UFy: ny + kyy * my + kyz * mz, UFz: nz + kzy * my + kzz * mz };
            }
            const UFetk = etk ? Math.max(etk.UFy, etk.UFz) : UFN;
            const UF = Math.max(UFetk, lt.uygulanir ? lt.UFLT : 0);
            return {
                N: N_kN, basinc: basinc / 1e3,
                UFN: UFN, etkilesim: etk, lt: lt,
                kY: kY, kZ: kZ, LcrY: y.Lcr, LcrZ: z.Lcr,
                lambdaY: y.lambda, lambdaZ: z.lambda, chiY: y.chi, chiZ: z.chi,
                NcrY: y.Ncr / 1e3, NcrZ: z.Ncr / 1e3,
                NbRd: kritik.NbRd / 1e3, eksenKritik: (kritik === y) ? 'y' : 'z',
                egri: egri, alpha: alpha, gammaM1: g, UF: UF,
                durum: (basinc === 0 && !(lt.uygulanir && lt.UFLT > 0)) ? 'tension/none' : (UF > 1 ? 'FAIL' : (UF > 0.9 ? 'check' : 'ok'))
            };
        }

        // Butun model. results.elementResults[id].N okunur (kN, cekme +).
        //
        // BURKULMA BOYU = ACIKLIK ZINCIRI. Kesisimlerde bolunmus bir kiris
        // (600 mm'lik parcalar) parca boyuyla kontrol edilince Nb,Rd ve Mcr
        // gercekte olmayan bir yanal tutulmaya dayaniyordu - guvenli tarafta
        // degil. Sehim kontrolundeki ayni zincir (sehimAcikliklari: ayni adli
        // dogrusal parcalar, dusey mesnetli dugumlerde bolunur) burada da
        // "uye"dir: L zincir boyu, N zincirdeki en buyuk basinc, momentler
        // zincirin uc ve tepe degerleri; zincirdeki her parca ayni kaydi alir.
        // K carpanlari (kY/kZ/kLT) zincirin ILK parcasindan okunur.
        function burkulmaUyeleri(results) {
            const uyeler = [];
            const acikliklar = (typeof sehimAcikliklari === 'function') ? sehimAcikliklari(results) : null;
            if (acikliklar) acikliklar.forEach(ac => uyeler.push(ac.kirisler.map(String)));
            const gorulen = new Set(uyeler.flat());
            Object.keys(model.elements).forEach(id => { if (!gorulen.has(String(id))) uyeler.push([String(id)]); });
            return uyeler;
        }
        function modelBurkulma(results) {
            const out = {};
            if (!results || !results.elementResults) return out;
            const grade = document.getElementById('steelGrade') ? document.getElementById('steelGrade').value : 'AH36';
            const genelMat = MATERIALS[grade] || MATERIALS['AH36'];
            const gEl = document.getElementById('gammaM1');
            const gammaM1 = gEl ? (parseFloat(gEl.value) || 1) : 1;
            const boy = e => { const a = model.nodes[e.n1], b = model.nodes[e.n2]; return (a && b) ? Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2 + ((b.z || 0) - (a.z || 0)) ** 2) : 0; };
            burkulmaUyeleri(results).forEach(ids => {
                const parcalar = ids.map(id => ({ id: id, elem: model.elements[id], r: results.elementResults[id] })).filter(p => p.elem && p.r);
                if (!parcalar.length) return;
                const ilk = parcalar[0].elem;
                const L = parcalar.reduce((s, p) => s + boy(p.elem), 0);
                const sec = (typeof kesitBul === 'function') ? kesitBul(ilk.section) : SECTIONS[ilk.section];
                const mat = (typeof elemanMalzemesi === 'function') ? elemanMalzemesi(ilk, genelMat) : genelMat;
                // uye kuvvetleri: en buyuk basinc, uc momentleri, tepe
                const N = Math.min(...parcalar.map(p => p.r.N || 0));
                const enB = alan => parcalar.reduce((m, p) => Math.max(m, Math.abs(p.r[alan] || 0)), 0);
                const momentler = {
                    M1: parcalar[0].r.M1, M2: parcalar[parcalar.length - 1].r.M2, Mmax: enB('Mmax'),
                    Mz1: parcalar[0].r.Mz1, Mz2: parcalar[parcalar.length - 1].r.Mz2, Mz: enB('Mz')
                };
                const b = elemanBurkulma(ilk, sec, mat, L, N, gammaM1, momentler);
                if (!b) return;
                b.zincir = { n: parcalar.length, L: L, ad: ilk.ad || '', kirisler: parcalar.map(p => parseInt(p.id, 10)) };
                parcalar.forEach(p => { out[p.id] = b; });
            });
            return out;
        }
