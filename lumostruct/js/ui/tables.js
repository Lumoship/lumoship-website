        // ============== ALT PANEL TABLOLARI ==============
        //
        // Alt panelde yalnizca iki sekme vardi (Beams / Nodes) ve ikisi de
        // cozumden SONRA bir ise yariyordu: modeli olusturan veriler - hangi
        // kiris hangi dugumler arasinda, hangi profil, hangi yuk - hicbir
        // yerde liste halinde gorunmuyordu.
        //
        // Burasi modeli ve sonuclari ayni yerde, sira sira listeler:
        //   Output | Beams | Nodes | Profiles | Beam loads | Node loads |
        //   Beam responses | Node responses | Stresses | Combined stresses | Notes
        //
        // Tablolar TEK bir tanim listesinden uretilir. Sutunlari elle HTML
        // yazmak yerine burada tarif etmek, siralama ve CSV disa aktarmanin da
        // tek koddan gelmesini sagliyor: eskiden CSV ile tablo ayri ayri
        // yaziliyordu ve ikisi birlikte yanlisti.
        //
        // BIRIM: geometri mm (sag paneldeki ve DNV 3D Beam ciktisindaki gibi),
        // kuvvet kN, moment kNm, gerilme MPa, sehim mm. Her basligin yaninda
        // birim yazar.

        // Kesit alanindan metre basina kutle. Celik yogunlugu cozucudekiyle
        // ayni olmali, yoksa tablo ile oz agirlik yuku celisir.
        const TABLO_CELIK_YOGUNLUK = 7850;      // kg/m3

        function tabloSayi(v, ondalik) {
            if (v === null || v === undefined || !isFinite(v)) return '-';
            return v.toFixed(ondalik === undefined ? 2 : ondalik);
        }

        function tabloKesit(elem) {
            return (typeof SECTIONS !== 'undefined' && elem && elem.section)
                ? SECTIONS[elem.section] : null;
        }

        function tabloKirisBoyu(elem) {
            const n1 = model.nodes[elem.n1], n2 = model.nodes[elem.n2];
            if (!n1 || !n2) return 0;
            return Math.sqrt(Math.pow(n2.x - n1.x, 2) + Math.pow(n2.y - n1.y, 2) +
                             Math.pow((n2.z || 0) - (n1.z || 0), 2));
        }

        // Mesnet kosullari iki bicimde saklanabiliyor: eski modellerde
        // 'fixed' / 'pinned' / 'simply_supported' metni, yenilerde altı ayri
        // bayrak. Tablo ikisini de okumali, yoksa eski bir proje "serbest"
        // gorunur.
        function tabloMesnetBayraklari(bc) {
            const yok = { Ux: false, Uy: false, Uz: false, Rx: false, Ry: false, Rz: false };
            if (!bc) return yok;
            if (typeof bc === 'string') {
                if (bc === 'fixed') return { Ux: true, Uy: true, Uz: true, Rx: true, Ry: true, Rz: true };
                if (bc === 'pinned') return { Ux: true, Uy: true, Uz: true, Rx: false, Ry: false, Rz: false };
                if (bc === 'simply_supported') return { Ux: false, Uy: false, Uz: true, Rx: false, Ry: false, Rz: false };
                return yok;
            }
            return {
                Ux: !!bc.Ux, Uy: !!bc.Uy, Uz: !!bc.Uz,
                Rx: !!bc.Rx, Ry: !!bc.Ry, Rz: !!bc.Rz
            };
        }

        function tabloGerilmeSiniri() {
            const el = document.getElementById('sigmaLimit');
            return parseFloat(el && el.value) || 355;
        }

        // ---------------------------------------------------------------- tanimlar
        // sut: { a: anahtar, b: baslik, o: ondalik, m: metin mi }
        const ALT_TABLOLAR = [
            {
                ad: 'output', baslik: 'Output', tur: 'metin', metin: () => tabloOzetMetni()
            },
            {
                ad: 'beams', baslik: 'Beams', secim: 'kiris',
                sut: [
                    { a: 'id', b: 'Beam', o: 0 },
                    { a: 'n1', b: 'Start node', o: 0 },
                    { a: 'n2', b: 'End node', o: 0 },
                    { a: 'L', b: 'Length [mm]', o: 0 },
                    { a: 'profil', b: 'Profile', m: true },
                    { a: 'kutle', b: 'Mass [kg]', o: 1 },
                    { a: 'rijit', b: 'Rigid ends [mm]', m: true },
                    { a: 'korozyon', b: 'Corrosion w/f/p [mm]', m: true },
                    { a: 'yuk', b: 'Line loads', m: true }
                ],
                satirlar: () => Object.entries(model.elements).map(([id, e]) => {
                    const sec = tabloKesit(e);
                    const L = tabloKirisBoyu(e);
                    return {
                        id: parseInt(id, 10),
                        n1: e.n1, n2: e.n2,
                        L: L * 1000,
                        profil: e.section || '-',
                        kutle: sec && sec.A ? sec.A * L * TABLO_CELIK_YOGUNLUK : null,
                        // Rijit uclar yayili yuklu elemanda cozucu tarafindan
                        // YOK SAYILIR; tablo bunu gizlemesin diye oyle yaziliyor.
                        // Korozyon paylari: govde / flans / plaka.
                        korozyon: e.corrosion
                            ? [e.corrosion.web || 0, e.corrosion.flange || 0, e.corrosion.plate || 0]
                                  .map(v => (Math.round(v * 100) / 100)).join(' / ')
                            : '-',
                        rijit: (e.rigidStart || e.rigidEnd)
                            ? (Math.round((e.rigidStart || 0) * 1000) + ' / ' +
                               Math.round((e.rigidEnd || 0) * 1000) +
                               ((e.lineLoads && e.lineLoads.length) ? ' (ignored)' : ''))
                            : '-',
                        yuk: (e.lineLoads && e.lineLoads.length)
                            ? e.lineLoads.map(l => (l.value ?? l.q ?? 0) + ' kN/m').join(', ')
                            : '-'
                    };
                })
            },
            {
                ad: 'nodes', baslik: 'Nodes', secim: 'dugum',
                sut: [
                    { a: 'id', b: 'Node', o: 0 },
                    { a: 'x', b: 'X [mm]', o: 0 },
                    { a: 'y', b: 'Y [mm]', o: 0 },
                    { a: 'z', b: 'Z [mm]', o: 0 },
                    { a: 'Ux', b: 'X trans.', m: true }, { a: 'Uy', b: 'Y trans.', m: true },
                    { a: 'Uz', b: 'Z trans.', m: true },
                    { a: 'Rx', b: 'X rot.', m: true }, { a: 'Ry', b: 'Y rot.', m: true },
                    { a: 'Rz', b: 'Z rot.', m: true }
                ],
                satirlar: () => Object.entries(model.nodes).map(([id, n]) => {
                    const bc = model.constraints[id];
                    const b = tabloMesnetBayraklari(bc);
                    // Zorlanmis yer degistirme varsa tutulu yonun yaninda yazar:
                    // "Fixed" ile "Fixed 4 mm" ayni sey degil ve tabloda
                    // ayirt edilemezse model yanlis okunur.
                    const z = (bc && typeof bc === 'object' && bc.prescribed) ? bc.prescribed : null;
                    const ad = k => {
                        if (!b[k]) return 'Free';
                        const v = z ? z[k] : null;
                        if (typeof v !== 'number' || v === 0) return 'Fixed';
                        const birim = k[0] === 'U' ? ' mm' : ' deg';
                        const olcek = k[0] === 'U' ? 1000 : 180 / Math.PI;
                        return 'Fixed ' + (v * olcek).toFixed(k[0] === 'U' ? 1 : 3) + birim;
                    };
                    return {
                        id: parseInt(id, 10),
                        x: n.x * 1000, y: n.y * 1000, z: (n.z || 0) * 1000,
                        Ux: ad('Ux'), Uy: ad('Uy'), Uz: ad('Uz'),
                        Rx: ad('Rx'), Ry: ad('Ry'), Rz: ad('Rz')
                    };
                })
            },
            {
                ad: 'profiles', baslik: 'Profiles',
                sut: [
                    { a: 'ad', b: 'Profile', m: true },
                    { a: 'kullanim', b: 'Used by', o: 0 },
                    { a: 'h', b: 'h [mm]', o: 1 },
                    { a: 'A', b: 'A [cm2]', o: 2 },
                    { a: 'Iy', b: 'Iy [cm4]', o: 0 },
                    { a: 'Iz', b: 'Iz [cm4]', o: 0 },
                    { a: 'J', b: 'J [cm4]', o: 1 },
                    { a: 'Wtop', b: 'Wy,top [cm3]', o: 1 },
                    { a: 'Wbot', b: 'Wy,bot [cm3]', o: 1 },
                    { a: 'kutle', b: 'Mass [kg/m]', o: 2 }
                ],
                satirlar: () => {
                    if (typeof SECTIONS === 'undefined') return [];
                    const sayim = {};
                    Object.values(model.elements).forEach(e => {
                        if (e.section) sayim[e.section] = (sayim[e.section] || 0) + 1;
                    });
                    // YALNIZCA modelde kullanilan profiller: kutuphanedeki
                    // 30 profilin arasinda kullanilan ikisini bulmak kafa
                    // karistiriyordu. Rijit kiris varsa o da bir satir.
                    const satirlar = Object.entries(SECTIONS).filter(([ad]) => sayim[ad] > 0).map(([ad, s]) => ({
                        ad: ad,
                        kullanim: sayim[ad] || 0,
                        h: s.h ? s.h * 1000 : null,
                        A: s.A ? s.A * 1e4 : null,
                        Iy: s.Iy ? s.Iy * 1e8 : null,
                        Iz: s.Iz ? s.Iz * 1e8 : null,
                        J: s.J ? s.J * 1e8 : null,
                        Wtop: (s.WyTop || s.Wy) ? (s.WyTop || s.Wy) * 1e6 : null,
                        Wbot: (s.WyBot || s.Wy) ? (s.WyBot || s.Wy) * 1e6 : null,
                        kutle: s.A ? s.A * TABLO_CELIK_YOGUNLUK : null
                    }));
                    const rijit = Object.values(model.elements).filter(e => typeof kesitRijitMi === 'function' && kesitRijitMi(e.section)).length;
                    if (rijit > 0) satirlar.push({ ad: 'RIGID (no profile)', kullanim: rijit, h: null, A: null, Iy: null, Iz: null, J: null, Wtop: null, Wbot: null, kutle: null });
                    return satirlar;
                }
            },
            {
                ad: 'beamloads', baslik: 'Beam loads', secim: 'kiris',
                sut: [
                    { a: 'id', b: 'Beam', o: 0 },
                    { a: 'q', b: 'q [kN/m]', o: 3 },
                    { a: 'aci', b: 'Angle [deg]', o: 1 },
                    { a: 'bas', b: 'From [%]', o: 0 },
                    { a: 'son', b: 'To [%]', o: 0 },
                    { a: 'yon', b: 'Direction', m: true }
                ],
                satirlar: () => {
                    const r = [];
                    Object.entries(model.elements).forEach(([id, e]) => {
                        (e.lineLoads || []).forEach(l => {
                            const aci = (l.angle !== undefined) ? l.angle : 90;
                            r.push({
                                id: parseInt(id, 10),
                                q: (l.value ?? l.q ?? 0),
                                aci: aci,
                                bas: (l.startPct !== undefined) ? l.startPct : (l.start !== undefined ? l.start * 100 : 0),
                                son: (l.endPct !== undefined) ? l.endPct : (l.end !== undefined ? l.end * 100 : 100),
                                // 90 derece tam asagi, 0 derece kirise dik yanal.
                                yon: Math.abs(aci - 90) < 1e-9 ? 'vertical'
                                   : (Math.abs(aci) < 1e-9 ? 'lateral' : 'skew')
                            });
                        });
                    });
                    return r;
                }
            },
            {
                ad: 'nodeloads', baslik: 'Node loads', secim: 'dugum',
                sut: [
                    { a: 'id', b: 'Node', o: 0 },
                    { a: 'Px', b: 'Px [kN]', o: 3 }, { a: 'Py', b: 'Py [kN]', o: 3 },
                    { a: 'Pz', b: 'Pz [kN]', o: 3 },
                    { a: 'Mx', b: 'Mx [kNm]', o: 3 }, { a: 'My', b: 'My [kNm]', o: 3 },
                    { a: 'Mz', b: 'Mz [kNm]', o: 3 }
                ],
                satirlar: () => (model.loads || []).map(l => ({
                    id: parseInt(l.nodeId, 10),
                    Px: l.Fx || 0, Py: l.Fy || 0, Pz: l.Fz || 0,
                    Mx: l.Mx || 0, My: l.My || 0, Mz: l.Mz || 0
                }))
            },
            {
                ad: 'beamresp', baslik: 'Beam responses', secim: 'kiris', sonuc: true,
                sut: [
                    { a: 'id', b: 'Beam', o: 0 },
                    { a: 'Nx', b: 'Nx [kN]', o: 3 },
                    { a: 'Qy', b: 'Qy [kN]', o: 3 },
                    { a: 'Qz', b: 'Qz [kN]', o: 3 },
                    { a: 'Mx', b: 'Mx [kNm]', o: 4 },
                    { a: 'My1', b: 'My start [kNm]', o: 3 },
                    { a: 'My2', b: 'My end [kNm]', o: 3 },
                    { a: 'Mymax', b: 'My max [kNm]', o: 3 },
                    { a: 'Mzmax', b: 'Mz max [kNm]', o: 3 },
                    { a: 'd', b: 'd max [mm]', o: 4 }
                ],
                satirlar: () => Object.entries(results.elementResults || {}).map(([id, e]) => ({
                    id: parseInt(id, 10),
                    Nx: e.N || 0,
                    Qy: e.Vz || 0,
                    Qz: e.V || 0,
                    Mx: e.T || 0,
                    My1: e.M1 || 0, My2: e.M2 || 0,
                    Mymax: e.Mmax || 0,
                    Mzmax: e.Mz || 0,
                    d: e.dmax || 0
                }))
            },
            {
                ad: 'noderesp', baslik: 'Node responses', secim: 'dugum', sonuc: true,
                sut: [
                    { a: 'id', b: 'Node', o: 0 },
                    { a: 'dX', b: 'dX [mm]', o: 4 }, { a: 'dY', b: 'dY [mm]', o: 4 },
                    { a: 'dZ', b: 'dZ [mm]', o: 4 },
                    { a: 'rX', b: 'rX [deg]', o: 5 }, { a: 'rY', b: 'rY [deg]', o: 5 },
                    { a: 'rZ', b: 'rZ [deg]', o: 5 },
                    { a: 'Px', b: 'Px [kN]', o: 3 }, { a: 'Py', b: 'Py [kN]', o: 3 },
                    { a: 'Pz', b: 'Pz [kN]', o: 3 },
                    { a: 'Mx', b: 'Mx [kNm]', o: 4 }, { a: 'My', b: 'My [kNm]', o: 4 },
                    { a: 'Mz', b: 'Mz [kNm]', o: 4 }
                ],
                satirlar: () => {
                    const DER = 180 / Math.PI;
                    return Object.keys(model.nodes).map(id => {
                        const d = (results.displacements || {})[id] || {};
                        const t = (results.reactions || {})[id];
                        return {
                            id: parseInt(id, 10),
                            dX: (d.Ux || 0) * 1000, dY: (d.Uy || 0) * 1000, dZ: (d.Uz || 0) * 1000,
                            rX: (d.Rx || 0) * DER, rY: (d.Ry || 0) * DER, rZ: (d.Rz || 0) * DER,
                            // Tepki yalnizca mesnetli dugumde vardir; serbest
                            // dugumde 0 yazmak "olctuk, sifir cikti" demek olur.
                            Px: t ? (t.Fx || 0) : null, Py: t ? (t.Fy || 0) : null,
                            Pz: t ? (t.Fz || 0) : null,
                            Mx: t ? (t.Mx || 0) : null, My: t ? (t.My || 0) : null,
                            Mz: t ? (t.Mz || 0) : null
                        };
                    });
                }
            },
            {
                // Her kiris icin UC ISTASYON: sol uc, orta, sag uc. Referans
                // ciktida (DNV 3D Beam) gerilmeler par = 0 / 0.5 / 1 icin
                // veriliyor; tek bir "maksimum" satiri momentin isaret
                // degistirdigi yeri gizliyordu - ankastre kiriste uctaki ve
                // ortadaki gerilme ters isaretli ve farkli buyukluktedir.
                ad: 'stresses', baslik: 'Stresses', secim: 'kiris', sonuc: true,
                sut: [
                    { a: 'id', b: 'Beam', o: 0 },
                    { a: 'pos', b: 'x/L', m: true },
                    { a: 'profil', b: 'Profile', m: true },
                    { a: 'M', b: 'My [kNm]', o: 3 },
                    { a: 'Mz', b: 'Mz [kNm]', o: 3 },
                    { a: 'sigN', b: 'sigma_Nx [MPa]', o: 3 },
                    { a: 'sigMz', b: 'sigma_Mz [MPa]', o: 3 },
                    { a: 'sigTop', b: 'sigma_top [MPa]', o: 3 },
                    { a: 'sigBot', b: 'sigma_bot [MPa]', o: 3 },
                    { a: 'tauV', b: 'tau_Qz [MPa]', o: 3 },
                    { a: 'tauT', b: 'tau_Mx [MPa]', o: 3 },
                    { a: 'tau', b: 'tau [MPa]', o: 3 }
                ],
                satirlar: () => {
                    const r = [];
                    Object.entries(results.elementResults || {}).forEach(([id, e]) => {
                        const elem = model.elements[id] || {};
                        const sec = tabloKesit(elem);
                        // Cozucunun diyagram formulunun AYNISI:
                        //   sigma_top = sigma_N - M/Wtop,  sigma_bot = sigma_N + M/Wbot
                        // Burada baska bir isaret kurali kullanmak, tablo ile
                        // gerilme diyagramini birbirine dusurur.
                        const A = sec && sec.A ? sec.A : null;
                        const Wt = sec ? (sec.WyTop || sec.Wy) : null;
                        const Wb = sec ? (sec.WyBot || sec.Wy) : null;
                        const Wzk = sec ? sec.Wz : null;
                        const sigN = A ? (e.N || 0) * 1000 / A / 1e6 : null;
                        [['0', e.M1, e.Mz1], ['0.5', e.Mmid, e.Mzmid], ['1', e.M2, e.Mz2]].forEach(([pos, Mk, Mzk]) => {
                            const M = (Mk || 0) * 1000;          // kNm -> Nm
                            const Mz = (Mzk || 0) * 1000;
                            // Yanal egilme katkisi cozucudeki kuralla AYNI:
                            // lifi sifirdan uzaklastiracak yonde eklenir
                            // (kesit kosesindeki en kotu hal). Tablo ile
                            // kullanim orani ayni sayiyi gostermeli.
                            const sMz = (Wzk && Wzk > 0) ? Math.abs(Mz) / Wzk / 1e6 : 0;
                            const uzaklastir = (v, ek) => v + (v < 0 ? -ek : ek);
                            r.push({
                                id: parseInt(id, 10),
                                pos: pos,
                                profil: elem.section || '-',
                                M: Mk || 0,
                                Mz: Mzk || 0,
                                sigN: sigN,
                                sigMz: sMz,
                                sigTop: (sigN !== null && Wt) ? uzaklastir(sigN - M / Wt / 1e6, sMz) : null,
                                sigBot: (sigN !== null && Wb) ? uzaklastir(sigN + M / Wb / 1e6, sMz) : null,
                                // Kesme gerilmesi aciklik boyunca degisir; cozucu
                                // yalnizca en buyugunu tutuyor, uc istasyon icin
                                // ayri deger YOK - bu yuzden her satirda ayni
                                // maksimum yazar. Burulma zaten aciklik boyunca
                                // sabit.
                                tauV: e.tauV || 0,
                                tauT: e.tauT || 0,
                                tau: e.tau || 0
                            });
                        });
                    });
                    return r;
                }
            },
            {
                ad: 'combined', baslik: 'Combined stresses', secim: 'kiris', sonuc: true,
                sut: [
                    { a: 'id', b: 'Beam', o: 0 },
                    { a: 'sig', b: 'sigma [MPa]', o: 2 },
                    { a: 'tauV', b: 'tau_Qz [MPa]', o: 2 },
                    { a: 'tauT', b: 'tau_Mx [MPa]', o: 2 },
                    { a: 'tau', b: 'tau [MPa]', o: 2 },
                    { a: 'vm', b: 'sigma_vm [MPa]', o: 2 },
                    { a: 'sinir', b: 'Limit [MPa]', o: 0 },
                    { a: 'oran', b: 'Utilisation [%]', o: 1 },
                    { a: 'durum', b: 'Status', m: true }
                ],
                satirlar: () => {
                    const sinir = tabloGerilmeSiniri();
                    return Object.entries(results.elementResults || {}).map(([id, e]) => {
                        const oran = (e.vonMises || 0) / sinir * 100;
                        return {
                            id: parseInt(id, 10),
                            sig: e.sigma || 0,
                            tauV: e.tauV || 0,
                            tauT: e.tauT || 0,
                            tau: e.tau || 0,
                            vm: e.vonMises || 0,
                            sinir: sinir,
                            oran: oran,
                            // Rijit kiriste gerilme hesaplanmaz; "ok" yazmak yanlis guven verir.
                            durum: e.rigid ? 'rigid' : (oran > 100 ? 'OVER' : (oran > 80 ? 'check' : 'ok')),
                            _vurgu: e.rigid ? '' : (oran > 100 ? 'stress-fail' : (oran > 80 ? 'stress-warn' : 'stress-ok'))
                        };
                    });
                }
            },
            {
                ad: 'notes', baslik: 'Notes', tur: 'not'
            }
        ];

        let altTabloEtkin = 'beams';
        let altTabloSiraSutun = 'id';
        let altTabloSiraArtan = true;

        function altTabloTanim(ad) {
            return ALT_TABLOLAR.find(t => t.ad === ad) || ALT_TABLOLAR[1];
        }

        // ---------------------------------------------------------------- ozet metni
        // ELEMAN NARINLIGI L/h. LumoStruct bir KIRIS cozucusu: duzlem kesitler
        // duz kalir varsayimi, boyu yuksekliginin birkac kati olan elemanlar
        // icin gecerli. Yaygin kabul L/h >= 3; altinda kayma ve kesit carpilmasi
        // baskin hale gelir ve kiris teorisi - kayma deformasyonu eklenmis olsa
        // bile - dogru cevabi vermez.
        //
        // Bu, akademik bir uyari degil. Steel 4.4.4 ile karsilastirmada tam da
        // L/h'si kucuk eleman gruplarinda ayrildik: CCL311 model 5'te bp19
        // (ortanca L/h 0,90) ve bp21 (2,26) hem mukavemet momentinde hem yanal
        // rijitlikte %16-29 fark verdi, oysa bp4 (L/h 5,55) %0,6 ile tutuyor.
        // Ayni sey BV 2091/2094 modellerinde de olmustu.
        //
        // Kullanici bunu GORMELI: modelinin ne kadari cozucunun gecerlilik
        // alaninin disinda, ve hangi profiller.
        function tabloNarinlik() {
            const d = { toplam: 0, k3: 0, k2: 0, k1: 0, enKucuk: Infinity, enKucukKiris: null, profil: {} };
            Object.entries(model.elements).forEach(([id, e]) => {
                const sec = tabloKesit(e);
                const L = tabloKirisBoyu(e);
                const h = (sec && sec.h > 0) ? sec.h : 0;
                if (!(h > 0) || !(L > 0)) return;
                const r = L / h;
                d.toplam++;
                if (r < 3) d.k3++;
                if (r < 2) d.k2++;
                if (r < 1) d.k1++;
                if (r < d.enKucuk) { d.enKucuk = r; d.enKucukKiris = id; }
                if (r < 3) {
                    const ad = e.section || '-';
                    d.profil[ad] = (d.profil[ad] || 0) + 1;
                }
            });
            return d;
        }

        function tabloOzetMetni() {
            const dugum = Object.keys(model.nodes).length;
            const kiris = Object.keys(model.elements).length;
            const mesnet = Object.keys(model.constraints || {}).length;
            const yuk = (model.loads || []).length;
            let yayili = 0, boy = 0, kutle = 0;
            Object.values(model.elements).forEach(e => {
                yayili += (e.lineLoads || []).length;
                const L = tabloKirisBoyu(e);
                const sec = tabloKesit(e);
                boy += L;
                if (sec && sec.A) kutle += sec.A * L * TABLO_CELIK_YOGUNLUK;
            });

            const s = [];
            s.push('MODEL');
            s.push('  Nodes                ' + dugum);
            s.push('  Beams                ' + kiris);
            s.push('  Total beam length    ' + (boy * 1000).toFixed(0) + ' mm');
            s.push('  Steel mass           ' + kutle.toFixed(1) + ' kg');
            s.push('  Profiles in model    ' + (typeof SECTIONS !== 'undefined' ? Object.keys(SECTIONS).length : 0));
            s.push('  Supported nodes      ' + mesnet);
            s.push('  Point loads          ' + yuk);
            s.push('  Line loads           ' + yayili);
            s.push('');

            // Gecerlilik alani. Sessiz kalmak, kullaniciya cozucunun ne zaman
            // guvenilir oldugunu soylememek olurdu.
            const nar = tabloNarinlik();
            if (nar.toplam) {
                s.push('BEAM THEORY VALIDITY  (L/h)');
                s.push('  Members measured     ' + nar.toplam);
                s.push('  L/h < 3              ' + nar.k3 +
                       '  (' + (100 * nar.k3 / nar.toplam).toFixed(0) + ' %)  outside usual beam range');
                s.push('  L/h < 1              ' + nar.k1 +
                       '  (' + (100 * nar.k1 / nar.toplam).toFixed(0) + ' %)  deeper than long');
                s.push('  Shortest member      L/h = ' + nar.enKucuk.toFixed(2) +
                       '  (beam ' + nar.enKucukKiris + ')');
                if (nar.k3) {
                    const liste = Object.entries(nar.profil).sort((a, b) => b[1] - a[1]).slice(0, 4);
                    s.push('  Mostly              ' + liste.map(x => x[0] + ' x' + x[1]).join(', '));
                    s.push('  NOTE  Below L/h = 3 plane sections no longer stay plane. Shear');
                    s.push('        deformation is included, but results for those members are');
                    s.push('        an idealisation - two beam programs can differ by 20 % there.');
                }
                s.push('');
            }

            if (!results) {
                s.push('ANALYSIS');
                s.push('  Not solved yet. Press Solve to fill the response tabs.');
                return s.join('\n');
            }

            const d = results.maxDeflection;
            s.push('ANALYSIS');
            s.push('  Max deflection       ' + ((d || 0) * 1000).toFixed(3) + ' mm');
            s.push('  Max bending moment   ' + (results.maxMoment || 0).toFixed(3) + ' kNm');
            s.push('  Max shear force      ' + (results.maxShear || 0).toFixed(3) + ' kN');
            s.push('  Max normal stress    ' + (results.maxSigma || 0).toFixed(2) + ' MPa');
            s.push('  Max shear stress     ' + (results.maxTau || 0).toFixed(2) + ' MPa');
            s.push('  Max von Mises        ' + (results.maxVonMises || 0).toFixed(2) + ' MPa');
            s.push('  Stress limit         ' + tabloGerilmeSiniri().toFixed(0) + ' MPa');
            s.push('  Utilisation          ' +
                   ((results.maxVonMises || 0) / tabloGerilmeSiniri() * 100).toFixed(1) + ' %');

            // Denge kontrolu cozucuden geliyor: uygulanan yuk ile tepkilerin
            // farki. Sifirdan uzaklasmasi modelin degil cozumun sorunudur,
            // bu yuzden ozetin en gorunur yerinde durur.
            // Cozucunun denge kontrolu: alanlari appliedFz / reactionFz / error.
            // Once Fx/Fy/Fz ariyordum, hicbiri yoktu ve ozet BOS bir
            // "EQUILIBRIUM CHECK" basligi basiyordu - bakan kisi kontrolun
            // yapilmadigini degil, sifir ciktigini sanirdi.
            const eq = results.equilibrium;
            if (eq && eq.appliedFz !== undefined) {
                s.push('');
                s.push('EQUILIBRIUM CHECK');
                s.push('  Applied Fz           ' + Number(eq.appliedFz).toFixed(4) + ' kN');
                s.push('  Sum of reactions     ' + Number(eq.reactionFz).toFixed(4) + ' kN');
                s.push('  Residual             ' + Number(eq.error || 0).toExponential(3) + ' kN   ' +
                       (eq.ok ? '(balanced)' : '(NOT BALANCED)'));
            }

            if (typeof modelChangedAfterSolve !== 'undefined' && modelChangedAfterSolve) {
                s.push('');
                s.push('WARNING: the model changed after this analysis. Re-solve before using these numbers.');
            }
            return s.join('\n');
        }

        // ---------------------------------------------------------------- cizim
        function altTabloSatirlari(tanim) {
            if (!tanim.satirlar) return [];
            if (tanim.sonuc && !results) return [];
            try {
                return tanim.satirlar() || [];
            } catch (e) {
                console.error('Table rows failed for ' + tanim.ad, e);
                return [];
            }
        }

        function altTabloCiz() {
            const kap = document.getElementById('resultsBottomContent');
            if (!kap) return;
            const tanim = altTabloTanim(altTabloEtkin);

            if (tanim.tur === 'metin') {
                kap.innerHTML = '<pre class="results-output-text"></pre>';
                kap.querySelector('pre').textContent = tanim.metin();
                return;
            }

            if (tanim.tur === 'not') {
                // Notlar modelin icinde durur: proje ile birlikte kaydedilir.
                const mevcut = (model.notes || '');
                kap.innerHTML = '<textarea class="results-notes" spellcheck="false" ' +
                    'placeholder="Notes are saved with the model."></textarea>';
                const ta = kap.querySelector('textarea');
                ta.value = mevcut;
                ta.addEventListener('input', () => {
                    model.notes = ta.value;
                    if (typeof autoSaveModel === 'function') autoSaveModel();
                });
                return;
            }

            if (tanim.sonuc && !results) {
                kap.innerHTML = '<div class="results-empty-note">Run <b>Solve</b> to fill this tab.</div>';
                return;
            }

            const satirlar = altTabloSatirlari(tanim);
            if (!satirlar.length) {
                kap.innerHTML = '<div class="results-empty-note">Nothing to list yet.</div>';
                return;
            }

            // Siralama: sutun tabloda yoksa ilk sutuna don, yoksa sessizce
            // siralanmamis bir tablo gosteririz.
            const anahtarlar = tanim.sut.map(c => c.a);
            const sutun = anahtarlar.includes(altTabloSiraSutun) ? altTabloSiraSutun : anahtarlar[0];
            const yon = altTabloSiraArtan ? 1 : -1;
            satirlar.sort((a, b) => {
                const x = a[sutun], y = b[sutun];
                if (typeof x === 'string' || typeof y === 'string') {
                    return yon * String(x).localeCompare(String(y));
                }
                return yon * ((x === null ? -Infinity : x) - (y === null ? -Infinity : y));
            });

            const ok = '<span class="icon" style="width:12px;height:12px;"><svg viewBox="0 0 24 24">' +
                       '<path d="M7 15l5 5 5-5"/><path d="M7 9l5-5 5 5"/></svg></span>';
            const bas = tanim.sut.map(c =>
                '<th onclick="altTabloSirala(\'' + c.a + '\')"' +
                (c.a === sutun ? ' class="sorted"' : '') + '>' + c.b + ' ' + ok + '</th>').join('');

            const govde = satirlar.map(s => {
                const secili = (tanim.secim === 'kiris' && typeof selectedElements !== 'undefined' && selectedElements.has(s.id)) ||
                               (tanim.secim === 'dugum' && typeof selectedNodes !== 'undefined' && selectedNodes.has(s.id));
                let tik = '';
                if (tanim.secim === 'kiris') tik = ' onclick="selectBeamFromTable(' + s.id + ')" ondblclick="openBeamDetailModal(' + s.id + ')"';
                else if (tanim.secim === 'dugum') tik = ' onclick="selectNodeFromTable(' + s.id + ')"';
                const hucre = tanim.sut.map((c, i) => {
                    const v = s[c.a];
                    const metin = c.m ? (v === null || v === undefined ? '-' : String(v)) : tabloSayi(v, c.o);
                    let stil = '';
                    if (i === 0 && tanim.secim) stil = ' style="color:var(--accent-info); font-weight:600;"';
                    const sinif = (s._vurgu && !c.m && c.a !== 'id' && c.a !== 'sinir') ? ' class="' + s._vurgu + '"' : '';
                    return '<td' + sinif + stil + '>' + metin + '</td>';
                }).join('');
                return '<tr class="' + (secili ? 'selected' : '') + '"' + tik + '>' + hucre + '</tr>';
            }).join('');

            kap.innerHTML = '<table class="results-data-table"><thead><tr>' + bas +
                            '</tr></thead><tbody>' + govde + '</tbody></table>';
        }

        function altTabloSeritleriniKur() {
            const kap = document.getElementById('resultsBottomTabs');
            if (!kap) return;
            kap.innerHTML = ALT_TABLOLAR.map(t =>
                '<button class="results-bottom-tab' + (t.ad === altTabloEtkin ? ' active' : '') +
                '" data-tab="' + t.ad + '" onclick="switchResultsBottomTab(\'' + t.ad + '\')">' +
                t.baslik + '</button>').join('');
        }

        // ---------------------------------------------------------------- disari acilan
        function switchResultsBottomTab(ad) {
            // Serit JS ile uretiliyor; panel hic cizilmeden bu fonksiyon
            // cagrilirsa (kisayol, geri yukleme, test) ortada dugme olmaz ve
            // "aktif sekme" hicbir zaman isaretlenmezdi. Once seridi kur.
            const serit = document.getElementById('resultsBottomTabs');
            if (serit && !(serit.children && serit.children.length)) altTabloSeritleriniKur();
            altTabloEtkin = ad;
            altTabloSiraSutun = 'id';
            altTabloSiraArtan = true;
            document.querySelectorAll('.results-bottom-tab').forEach(b =>
                b.classList.toggle('active', b.dataset.tab === ad));
            altTabloCiz();
        }

        // ---- Secim -> tablo ----
        // Kullanici: "sonuc sayfasinda noda tiklayinca Node responses'ta onun
        // satiri koyu gorunsun; kirise tiklayinca Beam responses." Sahnede
        // yapilan secim burada karsilanir: Results sekmesindeyken uygun
        // sekmeye gecilir, tablo yeniden cizilir, secili satir gorunur yere
        // kaydirilir. Tablodan yapilan secim (selectBeamFromTable) sekme
        // DEGISTIRMEZ - kullanici zaten o tabloya bakiyor; altTabloIcSecim
        // bayragi bunu ayirir.
        let altTabloIcSecim = false;
        function altTabloSecimiIzle() {
            const panel = document.getElementById('resultsBottomPanel');
            if (!panel || panel.style.display === 'none') return;
            const nK = (typeof selectedElements !== 'undefined') ? selectedElements.size : 0;
            const nD = (typeof selectedNodes !== 'undefined') ? selectedNodes.size : 0;
            const tanim = altTabloTanim(altTabloEtkin);
            let hedef = altTabloEtkin;
            if (!altTabloIcSecim) {
                if (nK > 0 && nD === 0 && tanim.secim !== 'kiris') hedef = results ? 'beamresp' : 'beams';
                else if (nD > 0 && nK === 0 && tanim.secim !== 'dugum') hedef = results ? 'noderesp' : 'nodes';
            }
            if (hedef !== altTabloEtkin) switchResultsBottomTab(hedef);
            else altTabloCiz();
            // Secili ilk satiri gorunur alana getir.
            const kap = document.getElementById('resultsBottomContent');
            const satir = kap && kap.querySelector('tr.selected');
            if (satir && typeof satir.scrollIntoView === 'function') {
                try { satir.scrollIntoView({ block: 'nearest' }); } catch (e) { /* eski tarayici */ }
            }
        }

        // Etkin sekme. Sekme dugmeleri JS ile uretildigi icin DOM'a bakarak
        // sinamak mumkun degil; durum buradan okunur.
        function altTabloEtkinSekme() {
            return altTabloEtkin;
        }

        function altTabloSirala(sutun) {
            if (altTabloSiraSutun === sutun) altTabloSiraArtan = !altTabloSiraArtan;
            else { altTabloSiraSutun = sutun; altTabloSiraArtan = true; }
            altTabloCiz();
        }

        // Eski ad korunuyor: HTML'de ve baska dosyalarda cagriliyor.
        function sortResultsTable(tabloTuru, sutun) {
            altTabloSirala(sutun);
        }

        function updateResultsBottomPanel() {
            altTabloSeritleriniKur();
            altTabloCiz();
        }

        function exportResultsTable() {
            const tanim = altTabloTanim(altTabloEtkin);
            if (tanim.tur === 'metin' || tanim.tur === 'not') {
                const metin = tanim.tur === 'metin' ? tanim.metin() : (model.notes || '');
                tabloDosyaIndir(metin, tanim.ad + '_' + new Date().toISOString().slice(0, 10) + '.txt', 'text/plain');
                if (typeof showToast === 'function') showToast('Exported ' + tanim.baslik);
                return;
            }
            const satirlar = altTabloSatirlari(tanim);
            if (!satirlar.length) {
                if (typeof showToast === 'function') showToast('Nothing to export on this tab', 'info');
                return;
            }
            // CSV tablo ile AYNI kaynaktan uretiliyor; ikisi ayri yazildiginda
            // birlikte yanlis olabiliyorlardi.
            const kacir = v => {
                const t = String(v === null || v === undefined ? '' : v);
                return /[",\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
            };
            const bas = tanim.sut.map(c => kacir(c.b)).join(',');
            const govde = satirlar.map(s => tanim.sut.map(c =>
                kacir(c.m ? s[c.a] : tabloSayi(s[c.a], c.o))).join(',')).join('\n');
            tabloDosyaIndir(bas + '\n' + govde + '\n',
                tanim.ad + '_' + new Date().toISOString().slice(0, 10) + '.csv', 'text/csv');
            if (typeof showToast === 'function') showToast('Exported ' + tanim.baslik + ' to CSV');
        }

        function tabloDosyaIndir(icerik, adi, tur) {
            const blob = new Blob([icerik], { type: tur });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = adi;
            a.click();
            URL.revokeObjectURL(url);
        }
