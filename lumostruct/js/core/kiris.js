        // ============== KIRIS OZELLIKLERI: TEK KAYNAK ==============
        //
        // Bir kiris bolununce, birlesince, kopyalaninca, aynalaninca ya da
        // dondurulunce ozellikleri de tasinmali. Eskiden bunu yapan on kusur
        // yer vardi ve HEPSI yalnizca kesit + yon tasiyordu: capraz bir kiris
        // cizince otomatik bolme, uzerindeki HAT YUKUNU sessizce siliyordu;
        // kopya rijit ucunu, mafsalini, K carpanini, celik sinifini,
        // korozyon payini kaybediyordu. Bu dosya o davranisi tek yerde
        // tanimlar; kiris ureten her yol buradan gecer.
        //
        // Uc'a bagli ozellikler (rijit uc, mafsal) bolmede DOGRU parcaya
        // gider: bastakiler ilk parcaya, sondakiler son parcaya. Hat yuklari
        // parcaya dusen araligiyla kirpilip yeniden olceklenir; trapez yukte
        // kesim noktasindaki siddet ara degerdir.

        // Kirise ait, uca bagli OLMAYAN ozellikler. Yeni ozellik eklerken
        // buraya da yazilmali - yoksa kopyada/bolmede kaybolur.
        const KIRIS_OZELLIKLERI = ['section', 'orientation', 'grade', 'corrosion',
                                   'kY', 'kZ', 'burkulmaEgrisi', 'dxfLayer'];
        const KIRIS_UC_OZELLIKLERI = { bas: ['rigidStart', 'hingeStart'], son: ['rigidEnd', 'hingeEnd'] };

        function kirisDerinKopya(v) {
            return (v === undefined || v === null) ? v : JSON.parse(JSON.stringify(v));
        }

        // Hat yukunun araligini 0..1 kesri olarak okur (startPct/endPct ya
        // da start/end; ikisi de yoksa tam boy).
        function hatYukuAraligi(l) {
            const s = (l.startPct !== undefined) ? l.startPct / 100 : (l.start !== undefined ? l.start : 0);
            const e = (l.endPct !== undefined) ? l.endPct / 100 : (l.end !== undefined ? l.end : 1);
            return { s: Math.max(0, Math.min(1, s)), e: Math.max(0, Math.min(1, e)) };
        }

        // Kaynak kirisin [a0,b0] kesrindeki yukleri alir, hedef kirisin
        // [a1,b1] kesrine yerlestirir. Bolme: (0,t)->(0,1). Birlestirme:
        // (0,1)->(0,L1/L). Trapez siddet kesim yerinde dogrusal ara deger.
        function hatYukleriniYenidenOlcekle(yukler, a0, b0, a1, b1) {
            const out = [];
            if (!Array.isArray(yukler) || b0 - a0 <= 1e-12) return out;
            yukler.forEach(l => {
                const { s, e } = hatYukuAraligi(l);
                const lo = Math.max(s, a0), hi = Math.min(e, b0);
                if (hi - lo <= 1e-9) return;                        // bu parcaya dusmuyor
                const v1 = (l.value ?? l.q ?? 0);
                const v2 = (typeof l.value2 === 'number' && isFinite(l.value2)) ? l.value2 : v1;
                const siddet = t => (e - s > 1e-12) ? v1 + (v2 - v1) * (t - s) / (e - s) : v1;
                const y = kirisDerinKopya(l);
                const ks = (lo - a0) / (b0 - a0), ke = (hi - a0) / (b0 - a0);   // parca icindeki kesir
                const ys = a1 + ks * (b1 - a1), ye = a1 + ke * (b1 - a1);       // hedefteki kesir
                y.startPct = ys * 100; y.endPct = ye * 100;
                y.start = ys; y.end = ye;
                y.value = siddet(lo); y.q = y.value;
                if (v2 !== v1) y.value2 = siddet(hi); else delete y.value2;
                out.push(y);
            });
            return out;
        }

        // Kaynagin ozellikleriyle yeni kiris NESNESI kurar (modele eklemez).
        //   sec.uclar : 'ikisi' (varsayilan) | 'bas' | 'son' | 'hic'
        //   sec.yukler: hat yuku listesi; verilmezse kaynaginki derin kopya,
        //               null ise bos.
        function kirisTuret(kaynak, n1, n2, sec = {}) {
            const y = { n1: n1, n2: n2, section: kaynak ? kaynak.section : undefined };
            if (!kaynak) { y.lineLoads = []; return y; }
            KIRIS_OZELLIKLERI.forEach(k => { if (kaynak[k] !== undefined) y[k] = kirisDerinKopya(kaynak[k]); });
            const uclar = sec.uclar || 'ikisi';
            if (uclar === 'ikisi' || uclar === 'bas') KIRIS_UC_OZELLIKLERI.bas.forEach(k => { if (kaynak[k] !== undefined) y[k] = kaynak[k]; });
            if (uclar === 'ikisi' || uclar === 'son') KIRIS_UC_OZELLIKLERI.son.forEach(k => { if (kaynak[k] !== undefined) y[k] = kaynak[k]; });
            y.lineLoads = (sec.yukler === null) ? [] : (sec.yukler !== undefined ? sec.yukler : (kirisDerinKopya(kaynak.lineLoads) || []));
            // Tekil yukler: verilmezse derin kopya, null ise yok
            if (sec.noktalar === null) { /* yok */ }
            else if (sec.noktalar !== undefined) { if (sec.noktalar.length) y.pointLoads = sec.noktalar; }
            else if (kaynak.pointLoads && kaynak.pointLoads.length) y.pointLoads = kirisDerinKopya(kaynak.pointLoads);
            return y;
        }

        // Tekil yukleri [a0,b0] kesrinden hedefin [a1,b1] kesrine tasir
        // (parcaya dusmeyenler atlanir; sinirdaki yuk ilk parcaya).
        function noktaYukleriniYenidenOlcekle(noktalar, a0, b0, a1, b1, sonParca) {
            if (!Array.isArray(noktalar) || b0 - a0 <= 1e-12) return [];
            return noktalar.filter(p => {
                const x = +p.pos || 0;
                return (x >= a0 - 1e-9 && x < b0 - 1e-9) || (sonParca && Math.abs(x - b0) <= 1e-9);
            }).map(p => Object.assign(kirisDerinKopya(p), { pos: a1 + ((+p.pos || 0) - a0) / (b0 - a0) * (b1 - a1) }));
        }

        // Kaynak kirisi verilen dugumlerde (0..1 kesirleri artan sirada)
        // parcalara ayirir; parcalari modele ekler, kaynagi siler. Yeni
        // kiris kimliklerini dondurur. Kesirler dugumlerin kaynak uzerindeki
        // yeridir - kesisimden, orandan ya da koordinattan gelir.
        function kirisiParcala(elemId, dugumler, kesirler) {
            const kaynak = model.elements[elemId];
            if (!kaynak) return [];
            const sinir = [0, ...kesirler, 1];
            const uclar = [kaynak.n1, ...dugumler, kaynak.n2];
            delete model.elements[elemId];
            const yeni = [];
            for (let i = 0; i < uclar.length - 1; i++) {
                const ucTuru = (uclar.length === 2) ? 'ikisi' : (i === 0 ? 'bas' : (i === uclar.length - 2 ? 'son' : 'hic'));
                const parca = kirisTuret(kaynak, uclar[i], uclar[i + 1], {
                    uclar: ucTuru,
                    yukler: hatYukleriniYenidenOlcekle(kaynak.lineLoads, sinir[i], sinir[i + 1], 0, 1),
                    noktalar: noktaYukleriniYenidenOlcekle(kaynak.pointLoads, sinir[i], sinir[i + 1], 0, 1, i === uclar.length - 2)
                });
                const id = nextElementId++;
                parca.id = id;
                model.elements[id] = parca;
                yeni.push(id);
            }
            return yeni;
        }

        // Bir dugumun kiris uzerindeki kesri (0..1), 3B.
        function dugumunKirisKesri(elem, nodeId) {
            const a = model.nodes[elem.n1], b = model.nodes[elem.n2], p = model.nodes[nodeId];
            if (!a || !b || !p) return 0.5;
            const z = n => n.z || 0;
            const dx = b.x - a.x, dy = b.y - a.y, dz = z(b) - z(a);
            const L2 = dx * dx + dy * dy + dz * dz;
            if (L2 < 1e-18) return 0.5;
            return Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy + (z(p) - z(a)) * dz) / L2));
        }

        // Kaynagi verilen dugumde ikiye boler (kesir dugumden olculur).
        function kirisiDugumdeBol(elemId, nodeId) {
            const e = model.elements[elemId];
            if (!e) return [];
            return kirisiParcala(elemId, [nodeId], [dugumunKirisKesri(e, nodeId)]);
        }

        // Kirisin yonunu cevirir (n1<->n2): hat yuku araliklari ve trapez
        // siddetleri aynalanir, uc ozellikleri yer degistirir. JOIN'de
        // parcalar birlesik yone cevrilir.
        function kirisiTersCevir(e) {
            const y = kirisTuret(e, e.n2, e.n1, { uclar: 'hic', yukler: null });
            KIRIS_UC_OZELLIKLERI.bas.forEach((k, i) => { const s = KIRIS_UC_OZELLIKLERI.son[i]; if (e[s] !== undefined) y[k] = e[s]; });
            KIRIS_UC_OZELLIKLERI.son.forEach((k, i) => { const s = KIRIS_UC_OZELLIKLERI.bas[i]; if (e[s] !== undefined) y[k] = e[s]; });
            y.lineLoads = (e.lineLoads || []).map(l => {
                const { s, e: en } = hatYukuAraligi(l);
                const c = kirisDerinKopya(l);
                c.startPct = (1 - en) * 100; c.endPct = (1 - s) * 100; c.start = 1 - en; c.end = 1 - s;
                if (typeof l.value2 === 'number' && isFinite(l.value2)) {
                    c.value = l.value2; c.q = l.value2; c.value2 = (l.value ?? l.q ?? 0);
                }
                return c;
            });
            if (e.pointLoads && e.pointLoads.length) y.pointLoads = e.pointLoads.map(p => Object.assign(kirisDerinKopya(p), { pos: 1 - (+p.pos || 0) }));
            return y;
        }

        // Iki ardisik parcayi (e1: n1..orta, e2: orta..n2) tek kiris nesnesine
        // birlestirir: yukler birlesik boy uzerinde yeniden olceklenir,
        // e1'in bas ucu ve e2'nin son ucu kalir. Kesit/yon/sinif e1'den.
        function kirisleriBirlestirNesne(e1, e2, L1, L2, n1, n2) {
            const L = L1 + L2;
            const k = (L > 1e-12) ? L1 / L : 0.5;
            const yukler = [
                ...hatYukleriniYenidenOlcekle(e1.lineLoads, 0, 1, 0, k),
                ...hatYukleriniYenidenOlcekle(e2.lineLoads, 0, 1, k, 1)
            ];
            const noktalar = [
                ...noktaYukleriniYenidenOlcekle(e1.pointLoads, 0, 1, 0, k, true),
                ...noktaYukleriniYenidenOlcekle(e2.pointLoads, 0, 1, k, 1, true)
            ];
            const y = kirisTuret(e1, n1, n2, { uclar: 'bas', yukler: yukler, noktalar: noktalar });
            KIRIS_UC_OZELLIKLERI.son.forEach(p => { if (e2[p] !== undefined) y[p] = e2[p]; });
            return y;
        }

        // ---- Dugum turetme: kopya / ayna / dondurme / dizi ----
        // Bir dugum kumesini donusumden gecirir. Ayni yerde dugum varsa
        // YENISINI ACMAZ, mevcudu kullanir (kopya komsusuna baglansin).
        // Yeni acilan dugume kaynagin mesneti ve dugum yukleri de gecer;
        // mevcut dugume DAYATILMAZ (onun kendi mesneti var).
        function dugumleriTuret(dugumler, donustur, yeniIdler, sec = {}) {
            const harita = {};
            dugumler.forEach(eski => {
                const d = model.nodes[eski];
                if (!d) return;
                const y = donustur(d);
                const varOlan = findNodeAtLocation(y.x, y.y, y.z);
                if (varOlan !== null && varOlan !== undefined) { harita[eski] = varOlan; return; }
                const yeni = nextNodeId++;
                model.nodes[yeni] = { id: yeni, x: y.x, y: y.y, z: y.z };
                harita[eski] = yeni;
                if (yeniIdler) yeniIdler.push(yeni);
                if (sec.mesnetsiz) return;
                if (model.constraints && model.constraints[eski] !== undefined) {
                    model.constraints[yeni] = kirisDerinKopya(model.constraints[eski]);
                }
                if (Array.isArray(model.loads)) {
                    model.loads.filter(l => l.nodeId === eski || l.nodeId === String(eski)).forEach(l => {
                        model.loads.push(Object.assign(kirisDerinKopya(l), { nodeId: yeni }));
                    });
                }
            });
            return harita;
        }

        // Kirisleri haritaya gore yeniden kurar (ozellikleriyle; kesisimlerde
        // otomatik boler).
        function kirisleriTuret(ids, harita, yeniKirisler) {
            ids.forEach(eski => {
                const e = model.elements[eski];
                if (!e) return;
                const a = harita[e.n1], b = harita[e.n2];
                if (a === undefined || b === undefined) return;
                yeniKirisler.push(...createBeamWithIntersections(a, b, e.section, e.orientation || 0, e));
            });
        }

        // ---- Etkin calisma duzlemi ----
        // activeWorkPlane.axis: duzlemin NORMALI ('Z' -> XY, 'Y' -> XZ, 'X' -> YZ).
        function calismaDuzlemiNormali() {
            const eks = (typeof activeWorkPlane !== 'undefined' && activeWorkPlane && activeWorkPlane.axis) ? activeWorkPlane.axis : 'Z';
            return eks === 'X' ? [1, 0, 0] : (eks === 'Y' ? [0, 1, 0] : [0, 0, 1]);
        }

        // Noktayi, merkezden gecen ve duzlem normali yonundeki eksen
        // etrafinda dondurur (Rodrigues). XY duzleminde eski davranisla
        // birebir: Z ekseni etrafinda.
        function noktayiDuzlemdeDondur(p, merkez, aciDeg) {
            const n = calismaDuzlemiNormali();
            const a = aciDeg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
            const v = [p.x - merkez.x, p.y - merkez.y, (p.z || 0) - (merkez.z || 0)];
            const nv = n[0] * v[0] + n[1] * v[1] + n[2] * v[2];
            const cr = [n[1] * v[2] - n[2] * v[1], n[2] * v[0] - n[0] * v[2], n[0] * v[1] - n[1] * v[0]];
            const r = [0, 1, 2].map(i => v[i] * c + cr[i] * s + n[i] * nv * (1 - c));
            return { x: merkez.x + r[0], y: merkez.y + r[1], z: (merkez.z || 0) + r[2] };
        }

        // Noktayi, p1-p2 dogrusunu iceren ve etkin duzleme DIK olan
        // duzleme gore aynalar. XY'de eski davranisla birebir.
        function noktayiDuzlemdeAynala(p, p1, p2) {
            const n = calismaDuzlemiNormali();
            const u = [p2.x - p1.x, p2.y - p1.y, (p2.z || 0) - (p1.z || 0)];
            const ul = Math.hypot(u[0], u[1], u[2]);
            if (ul < 1e-9) return { x: p.x, y: p.y, z: p.z || 0 };
            u[0] /= ul; u[1] /= ul; u[2] /= ul;
            // ayna duzleminin normali: u x n
            const m = [u[1] * n[2] - u[2] * n[1], u[2] * n[0] - u[0] * n[2], u[0] * n[1] - u[1] * n[0]];
            const ml = Math.hypot(m[0], m[1], m[2]);
            if (ml < 1e-9) return { x: p.x, y: p.y, z: p.z || 0 };
            m[0] /= ml; m[1] /= ml; m[2] /= ml;
            const v = [p.x - p1.x, p.y - p1.y, (p.z || 0) - (p1.z || 0)];
            const d = v[0] * m[0] + v[1] * m[1] + v[2] * m[2];
            return { x: p.x - 2 * d * m[0], y: p.y - 2 * d * m[1], z: (p.z || 0) - 2 * d * m[2] };
        }

        // ---- Tasinan dugumleri birlestirme ----
        // MOVE / ROTATE sonrasi bir dugum baska bir dugumun ustune
        // gelmisse ikisi tek dugum olur (kirisler, mesnetler, yukler ona
        // baglanir). Eskiden ust uste iki dugum kaliyordu; model gorunuste
        // bagli, hesapta kopuktu.
        function tasinanDugumleriBirlestir(dugumIdleri, tol = 0.001) {
            let sayi = 0;
            dugumIdleri.forEach(id => {
                const d = model.nodes[id];
                if (!d) return;
                const hedef = Object.entries(model.nodes).find(([oid, o]) =>
                    parseInt(oid) !== id && !dugumIdleri.has(parseInt(oid)) &&
                    Math.abs(o.x - d.x) < tol && Math.abs(o.y - d.y) < tol && Math.abs((o.z || 0) - (d.z || 0)) < tol);
                if (!hedef) return;
                const hid = parseInt(hedef[0]);
                dugumuBirlestir(id, hid);
                sayi++;
            });
            return sayi;
        }

        // 'eski' dugumu 'hedef'e katar: kirisler yeniden baglanir, mesnetler
        // TOPLANIR (tutulu olan tutulu kalir), dugum yukleri hedefe gecer.
        function dugumuBirlestir(eski, hedef) {
            Object.values(model.elements).forEach(e => {
                if (e.n1 === eski) e.n1 = hedef;
                if (e.n2 === eski) e.n2 = hedef;
            });
            if (model.constraints) {
                const a = model.constraints[eski], b = model.constraints[hedef];
                if (a !== undefined) {
                    model.constraints[hedef] = mesnetleriTopla(b, a);
                    delete model.constraints[eski];
                }
            }
            if (Array.isArray(model.loads)) model.loads.forEach(l => { if (l.nodeId === eski) l.nodeId = hedef; });
            delete model.nodes[eski];
            // Ayni iki dugum arasinda ikinci kiris ya da sifir boylu kiris kaldiysa sil
            const gorulen = new Set();
            Object.entries(model.elements).forEach(([id, e]) => {
                if (e.n1 === e.n2) { delete model.elements[id]; return; }
                const k = Math.min(e.n1, e.n2) + '-' + Math.max(e.n1, e.n2);
                if (gorulen.has(k)) delete model.elements[id]; else gorulen.add(k);
            });
        }

        // Iki mesnet tanimini birlestirir: dizge tanimlar ('fixed', 'pinned',
        // 'simply_supported') nesneye cevrilip serbestlikler OR'lanir.
        function mesnetNesnesi(bc) {
            const b = { Ux: false, Uy: false, Uz: false, Rx: false, Ry: false, Rz: false };
            if (!bc) return b;
            if (typeof bc === 'object') return Object.assign(b, bc);
            if (bc === 'fixed') return { Ux: true, Uy: true, Uz: true, Rx: true, Ry: true, Rz: true };
            if (bc === 'pinned') return Object.assign(b, { Ux: true, Uy: true, Uz: true });
            if (bc === 'simply_supported') return Object.assign(b, { Uz: true });
            return b;
        }
        function mesnetleriTopla(a, b) {
            if (a === undefined) return kirisDerinKopya(b);
            if (b === undefined) return kirisDerinKopya(a);
            const x = mesnetNesnesi(a), y = mesnetNesnesi(b);
            const t = {};
            Object.keys(x).forEach(k => { t[k] = !!(x[k] || y[k]); });
            return t;
        }
