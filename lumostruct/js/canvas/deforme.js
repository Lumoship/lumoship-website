        // ============== DEFORME SEKIL ANIMASYONU ==============
        //
        // Kullanici: "deformasyon animasyon tarzi olursa hareketin dogru olup
        // olmadigini daha iyi anlarim, cok kasmayacak sekilde."
        //
        // Sahneyi her karede yeniden kurmak (update3DScene, 500 nesnede
        // ~118 ms) animasyon icin cok agir. Burada AYRI, hafif bir katman
        // var: her kiris icin 21 noktali bir cizgi. Her noktanin
        // deformasyonsuz konumu ve 1x olcekteki yer degistirme vektoru bir
        // kez hesaplanir; karede yalnizca konum dizisi
        //     p = p0 + k(t) * d
        // ile yazilir ve GPU'ya gonderilir. 100 kiriste kare basina ~2000
        // toplama - olculemeyecek kadar ucuz.
        //
        // Egri, cozucunun kendi sehim egrisidir (elementResults.diagram.d:
        // yerel z yonunde, dugum sehimleri dahil, mm). Yerel z yonu
        // elementFrame'den (fem.js) - egrinin hangi yone buyudugu cozucu
        // ile AYNI kaynaktan geliyor, yeniden turetilmiyor. Eksenel ve yanal
        // bilesenler dugum degerleri arasinda dogrusal.
        //
        // Hareket: 0 -> 1 -> 0, 2,4 saniyede bir tur, kosinusla yumusak.
        // Statik yuk altinda yapi "sifirdan sehime gider"; gidip gelme
        // yonu ve buyuklugu bir bakista gorunur. Genlik, kaydiricidaki
        // deformasyon olcegidir.

        let deformeAnim = { acik: false, grup: null, parcalar: [], t0: 0, sonOlcek: 0 };
        const DEFORME_ANIM_SURE_MS = 2400;
        const DEFORME_ORNEK = 21;                 // fem.js DIAGRAM_SAMPLES ile ayni

        function deformeAnimAcikMi() { return deformeAnim.acik; }

        // Dugme animasyon surerken "Stop" der: kullanici "Animate yazan
        // yerde stop gibi bir sey yazsin" dedi - calisan seyin nasil
        // durdurulacagi dugmenin uzerinde okunmali.
        function deformeAnimDugmesi() {
            const btn = document.getElementById('btnDeformAnim');
            if (!btn) return;
            btn.classList.toggle('success', deformeAnim.acik);
            btn.innerHTML = deformeAnim.acik ? '&#9632; Stop' : '&#9654; Animate';
            btn.title = deformeAnim.acik ? 'Stop the deformation animation' : 'Animate deformation: 0 → scale → 0, repeats';
        }

        function deformeAnimToggle() {
            if (!results || !results.displacements) {
                showToast('Run SOLVE first', true);
                return;
            }
            deformeAnim.acik = !deformeAnim.acik;
            deformeAnimDugmesi();
            if (deformeAnim.acik) {
                // Animasyon deforme sekil GORUNTUSUNUN yerine gecer: ikisi ust
                // uste binince hangisi hareket ediyor belli olmuyordu.
                if (view.showDeformed) {
                    view.showDeformed = false;
                    const b = document.getElementById('btnDeformed');
                    if (b) b.classList.remove('success');
                    update3DScene();
                }
                const exag = document.getElementById('exaggerationControl');
                if (exag) exag.style.display = 'flex';
                deformeAnimKur();
                deformeAnim.t0 = performance.now();
                if (typeof animate3D === 'function') animate3D();
            } else {
                deformeAnimSok();
                const exag = document.getElementById('exaggerationControl');
                if (exag && !view.showDeformed) exag.style.display = 'none';
            }
        }

        function deformeAnimSok() {
            if (deformeAnim.grup && threeScene) {
                threeScene.remove(deformeAnim.grup);
                deformeAnim.grup.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
            }
            deformeAnim.grup = null;
            deformeAnim.parcalar = [];
        }

        // Katmani kurar (sonuc ya da model degisince yeniden cagrilir).
        function deformeAnimKur() {
            deformeAnimSok();
            if (!threeScene || !results || !results.displacements || typeof THREE === 'undefined') return;

            const grup = new THREE.Group();
            // isModelObject: update3DScene sahneyi kurarken bunu da atar;
            // deformeAnimAdim bir sonraki karede YENI sonuctan yeniden kurar.
            grup.userData.isModelObject = true;
            grup.userData.isDeformAnim = true;
            const renk = 0x22c55e;
            const malzeme = new THREE.LineBasicMaterial({ color: renk, transparent: true, opacity: 0.95 });
            const dugumMalzeme = new THREE.PointsMaterial({ color: renk, size: 6, sizeAttenuation: false });

            Object.entries(model.elements).forEach(([id, el]) => {
                const n1 = model.nodes[el.n1], n2 = model.nodes[el.n2];
                if (!n1 || !n2) return;
                const d1 = results.displacements[el.n1] || { Ux: 0, Uy: 0, Uz: 0 };
                const d2 = results.displacements[el.n2] || { Ux: 0, Uy: 0, Uz: 0 };
                const frame = (typeof elementFrame === 'function') ? elementFrame(n1, n2, el.orientation || 0) : null;
                const r = results.elementResults && results.elementResults[id];
                const egri = (r && r.diagram && r.diagram.d && r.diagram.d.length === DEFORME_ORNEK) ? r.diagram.d : null;
                const z = frame ? frame.z : [0, 0, 1];

                // Dugum sehimlerinin yerel z izdusumu (m): egrinin dogrusal
                // kismi zaten dugumlerden geliyor, cift sayilmasin.
                const w1 = (d1.Ux || 0) * z[0] + (d1.Uy || 0) * z[1] + (d1.Uz || 0) * z[2];
                const w2 = (d2.Ux || 0) * z[0] + (d2.Uy || 0) * z[1] + (d2.Uz || 0) * z[2];

                const p0 = new Float32Array(DEFORME_ORNEK * 3);
                const dv = new Float32Array(DEFORME_ORNEK * 3);
                for (let k = 0; k < DEFORME_ORNEK; k++) {
                    const t = k / (DEFORME_ORNEK - 1);
                    p0[3 * k]     = n1.x + (n2.x - n1.x) * t;
                    p0[3 * k + 1] = n1.y + (n2.y - n1.y) * t;
                    p0[3 * k + 2] = (n1.z || 0) + ((n2.z || 0) - (n1.z || 0)) * t;
                    // dogrusal kisim (uc bilesen)
                    let ux = (d1.Ux || 0) * (1 - t) + (d2.Ux || 0) * t;
                    let uy = (d1.Uy || 0) * (1 - t) + (d2.Uy || 0) * t;
                    let uz = (d1.Uz || 0) * (1 - t) + (d2.Uz || 0) * t;
                    // egri kisim: cozucunun sehim egrisi eksi dogrusal kisim, yerel z'de
                    if (egri) {
                        const ek = egri[k] / 1000 - (w1 * (1 - t) + w2 * t);
                        ux += z[0] * ek; uy += z[1] * ek; uz += z[2] * ek;
                    }
                    dv[3 * k] = ux; dv[3 * k + 1] = uy; dv[3 * k + 2] = uz;
                }
                const geo = new THREE.BufferGeometry();
                const poz = new THREE.Float32BufferAttribute(new Float32Array(p0), 3);
                poz.setUsage(THREE.DynamicDrawUsage);
                geo.setAttribute('position', poz);
                const cizgi = new THREE.Line(geo, malzeme);
                grup.add(cizgi);
                deformeAnim.parcalar.push({ geo, p0, dv });
            });

            // Dugumler (ayri nokta bulutu)
            const ids = Object.keys(model.nodes);
            const np0 = new Float32Array(ids.length * 3), ndv = new Float32Array(ids.length * 3);
            ids.forEach((id, i) => {
                const n = model.nodes[id], d = results.displacements[id] || { Ux: 0, Uy: 0, Uz: 0 };
                np0[3 * i] = n.x; np0[3 * i + 1] = n.y; np0[3 * i + 2] = n.z || 0;
                ndv[3 * i] = d.Ux || 0; ndv[3 * i + 1] = d.Uy || 0; ndv[3 * i + 2] = d.Uz || 0;
            });
            const ngeo = new THREE.BufferGeometry();
            const npoz = new THREE.Float32BufferAttribute(new Float32Array(np0), 3);
            npoz.setUsage(THREE.DynamicDrawUsage);
            ngeo.setAttribute('position', npoz);
            grup.add(new THREE.Points(ngeo, dugumMalzeme));
            deformeAnim.parcalar.push({ geo: ngeo, p0: np0, dv: ndv });

            threeScene.add(grup);
            deformeAnim.grup = grup;
        }

        // Her karede (themes.js renderLoop) cagrilir. Sahne yeniden
        // kurulduysa (update3DScene grubu atar) katman yeniden kurulur.
        function deformeAnimAdim(simdi) {
            if (!deformeAnim.acik) return;
            if (!results || !results.displacements) { deformeAnim.acik = false; deformeAnimSok(); deformeAnimDugmesi(); return; }
            if (!deformeAnim.grup || !deformeAnim.grup.parent) deformeAnimKur();
            const faz = ((simdi - deformeAnim.t0) % DEFORME_ANIM_SURE_MS) / DEFORME_ANIM_SURE_MS;
            const k = 0.5 * (1 - Math.cos(2 * Math.PI * faz)) * (view.deformationScale || 50);
            deformeAnim.parcalar.forEach(p => {
                const arr = p.geo.attributes.position.array;
                for (let i = 0; i < arr.length; i++) arr[i] = p.p0[i] + k * p.dv[i];
                p.geo.attributes.position.needsUpdate = true;
            });
        }
