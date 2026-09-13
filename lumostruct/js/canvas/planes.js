        // ============== KULLANICI CALISMA DUZLEMLERI ==============
        //
        // Program tek bir "aktif calisma duzlemi" biliyordu (activeWorkPlane) ve
        // onu ancak bir kirise sag tiklayarak kurabiliyordunuz. Yani once o
        // yukseklikte bir sey cizmis olmaniz gerekiyordu - z = 5000'de HENUZ
        // hicbir sey yokken oraya gecmenin yolu yoktu.
        //
        // Burada duzlemler adlandirilmis, saklanan, secilebilen ve silinebilen
        // nesnelere donusuyor:
        //   - model.planes icinde dururlar, yani proje ile birlikte kaydedilir
        //     ve geri alma gecmisine dogal olarak girerler.
        //   - 3B gorunuste saydam bir dikdortgen olarak cizilirler; uzerine
        //     tiklayinca o duzlem etkinlesir, uzerine cizilen her sey oraya
        //     oturur.
        //   - Buyuklukleri modelin kendi sinirlarindan gelir: model buyudukce
        //     duzlem de buyur, kucuk bir modelin etrafinda devasa bir levha
        //     durmaz.
        //
        // Duzlemi silmek YALNIZCA duzlemi siler. Uzerinde cizilmis dugum ve
        // kirisler modelin parcasi; duzlem sadece bir referans yuzey.

        const DUZLEM_ADI = { Z: 'XY', Y: 'XZ', X: 'YZ' };

        // Duzlemin normali hangi eksen ise kayma o eksende olculur:
        // XY duzlemi bir Z yuksekliginde, XZ duzlemi bir Y'de, YZ bir X'te.
        const DUZLEM_KAYMA_EKSENI = { Z: 'Z', Y: 'Y', X: 'X' };

        function calismaDuzlemleri() {
            if (typeof model === 'undefined' || !model) return [];
            if (!Array.isArray(model.planes)) model.planes = [];
            return model.planes;
        }

        function duzlemEtiketi(d) {
            return DUZLEM_ADI[d.axis] + '  ' + DUZLEM_KAYMA_EKSENI[d.axis] + '=' +
                   Math.round(d.offset * 1000) + ' mm';
        }

        // Yeni duzlem. kaymaMm kullanicinin yazdigi deger - program ici birim
        // metre, arayuzdeki her sey mm.
        function calismaDuzlemiEkle(eksen, kaymaMm) {
            if (!DUZLEM_ADI[eksen]) return null;
            const kayma = parseFloat(kaymaMm) / 1000;
            if (!Number.isFinite(kayma)) {
                if (typeof showToast === 'function') showToast('Enter a number for the offset', 'error');
                return null;
            }

            const liste = calismaDuzlemleri();
            const ayni = liste.find(d => d.axis === eksen && Math.abs(d.offset - kayma) < 1e-9);
            if (ayni) {
                if (typeof showToast === 'function') showToast('That plane already exists', 'info');
                calismaDuzlemiSec(ayni.id);
                return ayni;
            }

            let enBuyuk = 0;
            liste.forEach(d => { if (d.id > enBuyuk) enBuyuk = d.id; });
            const duzlem = { id: enBuyuk + 1, axis: eksen, offset: kayma };
            liste.push(duzlem);

            // saveState() DEGIL: duzlem eklemek yapiyi degistirmez, yalnizca bir
            // referans yuzey ekler. saveState cozumu "model degisti" diye
            // isaretleyip bos yere "Re-solve" uyarisi cikariyordu.
            if (typeof autoSaveModel === 'function') autoSaveModel();

            duzlemSeritleriniTazele();
            calismaDuzlemiSec(duzlem.id);
            return duzlem;
        }

        function calismaDuzlemiSil(id) {
            const liste = calismaDuzlemleri();
            const i = liste.findIndex(d => d.id === id);
            if (i < 0) return;
            const silinen = liste[i];
            liste.splice(i, 1);

            // Silinen duzlem o an etkinse calisma duzlemini birak; model
            // uzerinde cizilmis hicbir seye dokunulmaz.
            if (typeof activeWorkPlane !== 'undefined' && activeWorkPlane &&
                activeWorkPlane.axis === silinen.axis &&
                Math.abs((activeWorkPlane.offset || 0) - silinen.offset) < 1e-9) {
                if (typeof clearWorkPlane === 'function') clearWorkPlane();
            }

            if (typeof autoSaveModel === 'function') autoSaveModel();
            duzlemSeritleriniTazele();
            if (typeof update3DScene === 'function') update3DScene();
            if (typeof showToast === 'function') showToast('Plane deleted (model untouched)', 'info');
        }

        // Duzlemi etkinlestirir ve o duzlemin 2B gorunusune gecer.
        function calismaDuzlemiSec(id) {
            const d = calismaDuzlemleri().find(p => p.id === id);
            if (!d) return;
            if (typeof setWorkPlane === 'function') setWorkPlane(d.axis, d.offset);
            duzlemSeritleriniTazele();
        }

        // 3B'de duzleme tiklandiginda: gorunusu DEGISTIRMEDEN o duzlemi
        // etkinlestirir. Kullanici 3B'de kalip dogrudan o yuzeye cizebilsin.
        function duzlemeTiklandi(id) {
            const d = calismaDuzlemleri().find(p => p.id === id);
            if (!d) return;
            if (typeof activeWorkPlane === 'undefined') return;
            activeWorkPlane = { axis: d.axis, offset: d.offset };
            if (typeof izgarayiDuzlemeGore === 'function') izgarayiDuzlemeGore();
            if (typeof update3DScene === 'function') update3DScene();
            duzlemSeritleriniTazele();
            if (typeof showToast === 'function') showToast('Work plane: ' + duzlemEtiketi(d), 'info');
        }

        function duzlemEtkinMi(d) {
            if (typeof activeWorkPlane === 'undefined' || !activeWorkPlane) return false;
            return activeWorkPlane.axis === d.axis &&
                   Math.abs((activeWorkPlane.offset || 0) - d.offset) < 1e-9;
        }

        // ---- Modelin sinirlari ----
        // Duzlem "yapilan calisma kadar" buyuk olmali. Model bos ya da tek
        // dogrultuda yassiysa en az bir taban olcu verilir, yoksa duzlem
        // gorunmez bir cizgiye duser.
        function duzlemSiniri() {
            const TABAN = 4;        // m - bos modelde duzlemin kenar uzunlugu
            const PAY = 0.15;       // kenarlardan disari tasma orani

            const dugumler = (typeof model !== 'undefined' && model && model.nodes)
                ? Object.values(model.nodes) : [];

            let enAz = { x: 0, y: 0, z: 0 }, enCok = { x: 0, y: 0, z: 0 };
            if (dugumler.length) {
                enAz = { x: Infinity, y: Infinity, z: Infinity };
                enCok = { x: -Infinity, y: -Infinity, z: -Infinity };
                dugumler.forEach(n => {
                    const z = n.z || 0;
                    enAz.x = Math.min(enAz.x, n.x); enCok.x = Math.max(enCok.x, n.x);
                    enAz.y = Math.min(enAz.y, n.y); enCok.y = Math.max(enCok.y, n.y);
                    enAz.z = Math.min(enAz.z, z);   enCok.z = Math.max(enCok.z, z);
                });
            }

            // Duzlemlerin kendi kaymalari da sinira girer: z = 5000'de bir
            // duzlem varken dusey duzlemler z = 0 civarinda kalirsa hicbiri
            // digerini kesmiyor, ekranda birbirinden kopuk levhalar duruyordu.
            const EKSEN = { X: 'x', Y: 'y', Z: 'z' };
            calismaDuzlemleri().forEach(d => {
                const e = EKSEN[d.axis];
                if (!e) return;
                enAz[e] = Math.min(enAz[e], d.offset);
                enCok[e] = Math.max(enCok[e], d.offset);
            });

            const s = {};
            ['x', 'y', 'z'].forEach(e => {
                const orta = (enAz[e] + enCok[e]) / 2;
                const yari = Math.max((enCok[e] - enAz[e]) / 2 * (1 + PAY), TABAN / 2);
                s[e] = { orta: orta, yari: yari, boy: yari * 2 };
            });
            return s;
        }

        // ---- 3B cizim ----
        // update3DScene'in sonunda cagrilir. Duzlemler yalnizca 3B gorunuste
        // cizilir: 2B'de zaten izgara etkin duzlemin uzerinde duruyor, ikinci
        // bir yuzey gorus alanini kapatirdi.
        function calismaDuzlemleriniCiz() {
            if (typeof threeScene === 'undefined' || !threeScene) return;
            if (typeof THREE === 'undefined') return;

            const liste = calismaDuzlemleri();
            const ucBoyut = (typeof currentViewMode !== 'undefined' && currentViewMode === '3d');

            // Kullanici duzlemi varsa 3B'de varsayilan zemin izgarasi cekilir:
            // referans artik kullanicinin kendi duzlemleri.
            if (window.gridHelper && ucBoyut && liste.length > 0) {
                window.gridHelper.visible = false;
            }

            if (!ucBoyut || liste.length === 0) return;
            if (typeof view !== 'undefined' && view && view.showGrid === false) return;

            const s = duzlemSiniri();
            const acikTema = document.body.classList.contains('light-mode');
            const aralik = (window.gridSettings && window.gridSettings.spacing) || 1;

            // Etiket olcegi butun duzlemlerde AYNI. Her duzlemin kendi
            // boyutundan turetildiginde dar bir duzlemin adi okunamayacak
            // kadar kucuk, genis olaninki kocaman cikiyordu.
            const etiketOlcek = Math.max(s.x.boy, s.y.boy, s.z.boy) * 0.03;

            liste.forEach(d => {
                const etkin = duzlemEtkinMi(d);
                const renk = etkin ? 0x38bdf8 : (acikTema ? 0x94a3b8 : 0x475569);

                // Duzlemin iki ekseni ve konumu. PlaneGeometry yerel XY'de durur;
                // dondurme kurallari izgarayla AYNI (izgarayiDuzlemeGore).
                let genislik, yukseklik, konum, donme;
                if (d.axis === 'Z') {            // XY duzlemi, z = kayma
                    genislik = s.x.boy; yukseklik = s.y.boy;
                    konum = [s.x.orta, s.y.orta, d.offset];
                    donme = [0, 0, 0];
                } else if (d.axis === 'Y') {     // XZ duzlemi, y = kayma
                    genislik = s.x.boy; yukseklik = s.z.boy;
                    konum = [s.x.orta, d.offset, s.z.orta];
                    donme = [Math.PI / 2, 0, 0];
                } else {                          // YZ duzlemi, x = kayma
                    genislik = s.z.boy; yukseklik = s.y.boy;
                    konum = [d.offset, s.y.orta, s.z.orta];
                    donme = [0, Math.PI / 2, 0];
                }

                const grup = new THREE.Group();
                grup.userData.isModelObject = true;
                grup.userData.planeId = d.id;

                // Yuzey. Cok soluk: arkasindaki model okunabilmeli.
                const yuzey = new THREE.Mesh(
                    new THREE.PlaneGeometry(genislik, yukseklik),
                    new THREE.MeshBasicMaterial({
                        color: renk,
                        transparent: true,
                        opacity: etkin ? 0.14 : 0.07,
                        side: THREE.DoubleSide,
                        depthWrite: false
                    })
                );
                yuzey.userData.planeId = d.id;
                grup.add(yuzey);

                // Cerceve + ic cizgiler. Cizgi sayisi sinirli: 5 m'lik bir
                // duzlemde 1 m araliklarla 5 cizgi olur, 500 m'likte de 40 -
                // aksi halde geometri sisiyor.
                const noktalar = [];
                const yg = genislik / 2, yy = yukseklik / 2;
                noktalar.push(-yg, -yy, 0,  yg, -yy, 0);
                noktalar.push( yg, -yy, 0,  yg,  yy, 0);
                noktalar.push( yg,  yy, 0, -yg,  yy, 0);
                noktalar.push(-yg,  yy, 0, -yg, -yy, 0);

                const adim = (n) => Math.max(aralik, n / 40);
                for (let x = adim(genislik); x < yg; x += adim(genislik)) {
                    noktalar.push(x, -yy, 0, x, yy, 0);
                    noktalar.push(-x, -yy, 0, -x, yy, 0);
                }
                for (let y = adim(yukseklik); y < yy; y += adim(yukseklik)) {
                    noktalar.push(-yg, y, 0, yg, y, 0);
                    noktalar.push(-yg, -y, 0, yg, -y, 0);
                }

                const cizgiGeo = new THREE.BufferGeometry();
                cizgiGeo.setAttribute('position', new THREE.Float32BufferAttribute(noktalar, 3));
                const cizgiler = new THREE.LineSegments(cizgiGeo, new THREE.LineBasicMaterial({
                    color: renk, transparent: true, opacity: etkin ? 0.65 : 0.3
                }));
                grup.add(cizgiler);

                // Ad etiketi duzlemin bir kosesinde.
                if (typeof createTextSprite === 'function') {
                    const etiket = createTextSprite(duzlemEtiketi(d),
                        etkin ? '#38bdf8' : (acikTema ? '#64748b' : '#94a3b8'), etiketOlcek);
                    etiket.position.set(-yg + etiketOlcek * 1.6, yy - etiketOlcek * 0.6, 0.01);
                    grup.add(etiket);
                }

                grup.position.set(konum[0], konum[1], konum[2]);
                grup.rotation.set(donme[0], donme[1], donme[2]);
                threeScene.add(grup);
            });
        }

        // ---- Serit listesi (kanvasin ustunde) ----
        function duzlemSeritleriniTazele() {
            const kap = document.getElementById('planeChips');
            if (!kap) return;
            const liste = calismaDuzlemleri();

            kap.innerHTML = '';
            kap.style.display = liste.length ? 'flex' : 'none';

            liste.slice().sort((a, b) => (a.axis === b.axis)
                ? a.offset - b.offset
                : a.axis.localeCompare(b.axis)).forEach(d => {
                const serit = document.createElement('span');
                serit.className = 'plane-chip' + (duzlemEtkinMi(d) ? ' active' : '');

                const ad = document.createElement('button');
                ad.type = 'button';
                ad.className = 'plane-chip-name';
                ad.textContent = duzlemEtiketi(d);
                ad.title = 'Switch to this plane';
                ad.onclick = () => calismaDuzlemiSec(d.id);
                serit.appendChild(ad);

                const sil = document.createElement('button');
                sil.type = 'button';
                sil.className = 'plane-chip-del';
                sil.textContent = '×';
                sil.title = 'Delete this plane (drawing stays)';
                sil.onclick = (e) => { e.stopPropagation(); calismaDuzlemiSil(d.id); };
                serit.appendChild(sil);

                kap.appendChild(serit);
            });
        }

        // ---- "New plane" kutusu ----
        function yeniDuzlemAc() {
            const kutu = document.getElementById('newPlaneBox');
            if (!kutu) return;
            kutu.style.display = 'block';
            yeniDuzlemEkseniDegisti();
            const giris = document.getElementById('newPlaneOffset');
            if (giris) { giris.value = ''; setTimeout(() => giris.focus(), 10); }
        }

        function yeniDuzlemKapat() {
            const kutu = document.getElementById('newPlaneBox');
            if (kutu) kutu.style.display = 'none';
        }

        // Hangi eksende kayma sorulacagi duzleme gore degisir: XY icin Z,
        // XZ icin Y, YZ icin X. Etiket bunu soylemezse "5000" nereye gidiyor
        // belli olmuyor.
        function yeniDuzlemEkseniDegisti() {
            const secim = document.getElementById('newPlaneAxis');
            const etiket = document.getElementById('newPlaneOffsetLabel');
            if (!secim || !etiket) return;
            const eksen = DUZLEM_KAYMA_EKSENI[secim.value] || 'Z';
            etiket.textContent = eksen + ' (mm)';
        }

        function yeniDuzlemOnayla() {
            const secim = document.getElementById('newPlaneAxis');
            const giris = document.getElementById('newPlaneOffset');
            if (!secim || !giris) return;
            const d = calismaDuzlemiEkle(secim.value, giris.value === '' ? NaN : giris.value);
            if (!d) return;
            yeniDuzlemKapat();
            if (typeof showToast === 'function') showToast('Plane created: ' + duzlemEtiketi(d), 'success');
        }

        function yeniDuzlemTus(e) {
            if (e.key === 'Enter') { e.preventDefault(); yeniDuzlemOnayla(); }
            else if (e.key === 'Escape') { e.preventDefault(); yeniDuzlemKapat(); }
        }
