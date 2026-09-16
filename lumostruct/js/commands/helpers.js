        // ============== INITIALIZATION ==============
        // Deferred until DOM + all modules are loaded (avoids "not defined" races)
        window.addEventListener('DOMContentLoaded', function() {
            if (typeof saveState === 'function') saveState();
            if (typeof draw === 'function') draw();
            if (typeof populateHPCatalog === 'function') populateHPCatalog();
            if (typeof updateSectionDropdowns === 'function') updateSectionDropdowns();
            if (typeof calculateEffectiveBreadth === 'function') calculateEffectiveBreadth();
            if (typeof updateProfilePreview === 'function') updateProfilePreview();
            setTimeout(function() {
                if (typeof initCommandSystem === 'function') initCommandSystem();
            }, 100);
        });
        
        // ============== COMMAND SYSTEM HELPERS ==============
        
        // Show/Hide Base Point Marker
        function showBasePointMarker(screenX, screenY) {
            if (cmdElements.basePointMarker) {
                cmdElements.basePointMarker.style.left = screenX + 'px';
                cmdElements.basePointMarker.style.top = screenY + 'px';
                cmdElements.basePointMarker.classList.add('visible');
            }
        }
        
        function hideBasePointMarker() {
            if (cmdElements.basePointMarker) {
                cmdElements.basePointMarker.classList.remove('visible');
            }
        }
        
        // Show/Hide Direction Line
        function showDirectionLine(startX, startY, endX, endY) {
            if (cmdElements.directionLine) {
                const dx = endX - startX;
                const dy = endY - startY;
                const length = Math.sqrt(dx * dx + dy * dy);
                const angle = Math.atan2(dy, dx) * 180 / Math.PI;
                
                cmdElements.directionLine.style.left = startX + 'px';
                cmdElements.directionLine.style.top = startY + 'px';
                cmdElements.directionLine.style.width = length + 'px';
                cmdElements.directionLine.style.transform = `rotate(${angle}deg)`;
                cmdElements.directionLine.classList.add('visible');
            }
        }
        
        function hideDirectionLine() {
            if (cmdElements.directionLine) {
                cmdElements.directionLine.classList.remove('visible');
            }
        }
        
        // Show/Hide Mirror Line
        function showMirrorLine(x1, y1, x2, y2) {
            if (cmdElements.mirrorLine) {
                const dx = x2 - x1;
                const dy = y2 - y1;
                const length = Math.sqrt(dx * dx + dy * dy);
                const angle = Math.atan2(dx, -dy) * 180 / Math.PI; // Perpendicular
                
                cmdElements.mirrorLine.style.left = x1 + 'px';
                cmdElements.mirrorLine.style.top = y1 + 'px';
                cmdElements.mirrorLine.style.height = length + 'px';
                cmdElements.mirrorLine.style.transform = `rotate(${angle}deg)`;
                cmdElements.mirrorLine.classList.add('visible');
            }
        }
        
        function hideMirrorLine() {
            if (cmdElements.mirrorLine) {
                cmdElements.mirrorLine.classList.remove('visible');
            }
        }
        
        // Show/Hide Split Point
        function showSplitPoint(screenX, screenY) {
            if (cmdElements.splitPoint) {
                cmdElements.splitPoint.style.left = screenX + 'px';
                cmdElements.splitPoint.style.top = screenY + 'px';
                cmdElements.splitPoint.classList.add('visible');
            }
        }
        
        function hideSplitPoint() {
            if (cmdElements.splitPoint) {
                cmdElements.splitPoint.classList.remove('visible');
            }
        }
        
        // Show/Hide Tooltip
        function showTooltipAt(screenX, screenY, html) {
            if (cmdElements.tooltip) {
                cmdElements.tooltip.innerHTML = html;
                // Yapisma isaretcisinin etiketi imlecin sag hizasinda durur;
                // ipucu 30 px yukaridayken alt kenari o etiketin ustune
                // biniyordu ("= 6000 mm" okunmuyordu). 46 px yukari.
                cmdElements.tooltip.style.left = (screenX + 15) + 'px';
                cmdElements.tooltip.style.top = (screenY - 46) + 'px';
                cmdElements.tooltip.classList.add('visible');
            }
        }
        
        function hideTooltip() {
            if (cmdElements.tooltip) {
                cmdElements.tooltip.classList.remove('visible');
            }
        }
        
        // Show/Hide Dynamic Input
        function showDynamicInput(screenX, screenY, value = '') {
            if (cmdElements.dynamicInput && cmdElements.dynInputValue) {
                cmdElements.dynamicInput.style.left = (screenX + 20) + 'px';
                cmdElements.dynamicInput.style.top = (screenY + 20) + 'px';
                cmdElements.dynamicInput.classList.add('active');
                cmdElements.dynInputValue.value = value;
                cmdElements.dynInputValue.focus();
                cmdElements.dynInputValue.select();
            }
        }
        
        function hideDynamicInput() {
            if (cmdElements.dynamicInput) {
                cmdElements.dynamicInput.classList.remove('active');
            }
        }
        
        // Update Coordinates Display
        function updateCoordsDisplay(modelX, modelY, modelZ) {
            if (cmdElements.coords) {
                const z = (typeof modelZ === 'number' && isFinite(modelZ)) ? modelZ : 0;
                cmdElements.coords.textContent = `X: ${modelX.toFixed(3)}  Y: ${modelY.toFixed(3)}  Z: ${z.toFixed(3)}`;
            }
        }
        
        // ============== COORDINATE CONVERSION ==============
        
        // Screen to Model coordinates (3D view)
        // gecenNokta (istege bagli): duzlem, etkin duzleme PARALEL olarak bu
        // noktadan gecirilir. Cizim z=3'teki bir dugumden devam ederken fare
        // z=0'a dusuyordu ve her kiris capraz asagi iniyordu; suruyor olan
        // cizginin duzlemi son noktadan gecmeli.
        function screenToModel3D(screenX, screenY, container, gecenNokta) {
            if (!threeCamera || !container) return { x: 0, y: 0, z: 0 };
            
            const rect = container.getBoundingClientRect();
            const mouse = new THREE.Vector2(
                ((screenX - rect.left) / rect.width) * 2 - 1,
                -((screenY - rect.top) / rect.height) * 2 + 1
            );
            
            const raycaster = new THREE.Raycaster();
            raycaster.setFromCamera(mouse, threeCamera);
            
            // Fare hangi duzleme dusecek? Izgarayla AYNI kaynak - eskiden
            // burasi gorunusten bagimsiz olarak hep z=0'a dusuruyordu, yani
            // XZ/YZ gorunusune gecince izgara donuyor ama tiklama hala XY'ye
            // iniyordu: o duzlemlerde calisilamiyordu.
            let normal, constant;
            const d = (typeof aktifCalismaDuzlemi === 'function')
                ? aktifCalismaDuzlemi()
                : { axis: 'Z', offset: 0 };
            {
                let o = d.offset;
                if (gecenNokta) {
                    o = d.axis === 'X' ? gecenNokta.x : (d.axis === 'Y' ? gecenNokta.y : (gecenNokta.z || 0));
                }
                if (d.axis === 'X') { normal = new THREE.Vector3(1, 0, 0); constant = -o; }
                else if (d.axis === 'Y') { normal = new THREE.Vector3(0, 1, 0); constant = -o; }
                else { normal = new THREE.Vector3(0, 0, 1); constant = -o; }
            }
            const plane = new THREE.Plane(normal, constant);
            const intersection = new THREE.Vector3();
            // Isin duzleme paralelse (XY duzlemi etkinken yandan bakmak gibi)
            // intersectPlane null doner ve hedef (0,0,0)'da kalir. Eskiden bu
            // sifir noktasi gercek bir tiklama sanilip oraya cizim yapiliyordu.
            // Bos donmek dogru: cagiran, duzlemin bu gorunuse dik oldugunu
            // soyler.
            const vurdu = raycaster.ray.intersectPlane(plane, intersection);
            if (!vurdu) return null;
            return { x: intersection.x, y: intersection.y, z: intersection.z };
        }

        // ---- Ekran olcegi ----
        // Bir CSS pikselinin kamera hedefindeki karsiligi (m). Yapisma
        // toleransi PIKSEL cinsinden olmali: sabit 0,15 m, yakinlastirinca
        // yarim ekran, uzaklastirinca gorunmez bir daireydi.
        function pikselBasinaMetre(container) {
            if (typeof threeCamera === 'undefined' || !threeCamera || !container) return 0.01;
            const h = container.clientHeight || 600;
            if (threeCamera.isOrthographicCamera) {
                return (threeCamera.top - threeCamera.bottom) / (threeCamera.zoom || 1) / h;
            }
            const r = (window.spherical && window.spherical.radius) || 8;
            return 2 * r * Math.tan((threeCamera.fov || 60) * Math.PI / 360) / h;
        }

        // Yapisma yaricapi: 10 piksel. Kullanici imleci "dugumun ustune"
        // getirir; ne kadar yakinlastirdigi onun isi.
        const YAPISMA_PIKSEL = 10;

        // ---- Ekran uzayinda dugum/orta nokta yapismasi ----
        // Duzlem-ici yapisma (findSnapPoint) dugumleri etkin duzleme
        // YANSITIP fare noktasiyla karsilastirir. Serbest 3B'de bu yanlis:
        // z=3'teki dugum ekranda baska yerde gorunur, yansittigi (x,y) ise
        // bambaska bir ekran noktasina duser - kullanici dugumun ustune gelir,
        // yapisma olmaz. Iki boyutlu gorunuslerde de derinlik belirsizligi var:
        // yandan bakinca y=0 ve y=4'teki iki dugum ust uste geliyor ve hangisi
        // secilecegi rastgeleydi ("alakasiz bir yerden tutuyor").
        //
        // Burada dugum ve orta noktalar EKRANA izdusurulur, imlece 10 piksel
        // icindekiler aday olur. Ust uste gelenlerde etkin calisma duzlemi
        // uzerindeki (derinligi duzlemin kaymasina esit olan) kazanir; boylece
        // XZ gorunusunde y=0 duzleminde cizerken y=0'daki dugum tutulur.
        // Donen nokta dugumun GERCEK 3B konumudur - kiris ona baglanir.
        function ekrandanYapis(clientX, clientY, container) {
            if (!cmdState.snapMode) return null;
            if (typeof threeCamera === 'undefined' || !threeCamera || !container) return null;
            if (typeof model === 'undefined' || !model) return null;

            const r = container.getBoundingClientRect();
            const px = clientX - r.left, py = clientY - r.top;
            const v = new THREE.Vector3();
            const ekrana = (x, y, z) => {
                v.set(x, y, z).project(threeCamera);
                if (v.z > 1) return null;                  // kamera arkasi
                return { x: (v.x * 0.5 + 0.5) * r.width, y: (-v.y * 0.5 + 0.5) * r.height };
            };

            const d = (typeof aktifCalismaDuzlemi === 'function')
                ? aktifCalismaDuzlemi() : { axis: 'Z', offset: 0 };
            const derinlik = p => d.axis === 'X' ? p.x : (d.axis === 'Y' ? p.y : (p.z || 0));
            const duzlemde = p => Math.abs(derinlik(p) - d.offset) < 0.001;

            // (uzaklik, duzlemde-mi) ikilisiyle siralanir: once duzlemdekiler.
            let enIyi = null;
            const dene = (p, tip) => {
                const e = ekrana(p.x, p.y, p.z || 0);
                if (!e) return;
                const u = Math.hypot(px - e.x, py - e.y);
                if (u > YAPISMA_PIKSEL) return;
                const aday = { x: p.x, y: p.y, z: p.z || 0, type: tip, uzaklik: u, duzlemde: duzlemde(p) };
                if (!enIyi) { enIyi = aday; return; }
                if (aday.duzlemde !== enIyi.duzlemde) { if (aday.duzlemde) enIyi = aday; return; }
                // Dugum orta noktadan once gelir: ayni yakinlikta uc kazanir.
                if (aday.type === 'END' && enIyi.type !== 'END' && u <= enIyi.uzaklik + 3) { enIyi = aday; return; }
                if (u < enIyi.uzaklik) enIyi = aday;
            };

            Object.values(model.nodes).forEach(n => dene(n, 'END'));
            Object.values(model.elements).forEach(el => {
                const n1 = model.nodes[el.n1], n2 = model.nodes[el.n2];
                if (!n1 || !n2) return;
                dene({ x: (n1.x + n2.x) / 2, y: (n1.y + n2.y) / 2,
                       z: ((n1.z || 0) + (n2.z || 0)) / 2 }, 'MID');
            });

            if (!enIyi) return null;
            return { x: enIyi.x, y: enIyi.y, z: enIyi.z, type: enIyi.type };
        }

        // ---- Ekranda kiris uzerindeki nokta (SPLIT / TRIM icin) ----
        // findPointOnBeam duzlem noktasiyla x-y'de bakar: dusey kolonun 2B
        // boyu sifir, bulunamiyor; z=3'teki kirise de duzlem noktasi (z=0)
        // hic yaklasmiyor. Burada kiris EKRANA izdusurulur, imlece 10 px
        // icindeki en yakin kiris secilir; kiris uzerindeki gercek 3B nokta,
        // fare isini ile kiris dogrusu arasindaki en kisa baglantidan gelir.
        function ekrandaKirisNoktasi(clientX, clientY, container, tolerans) {
            if (typeof threeCamera === 'undefined' || !threeCamera || !container) return null;
            if (typeof model === 'undefined' || !model) return null;
            const tol = tolerans || YAPISMA_PIKSEL;
            const r = container.getBoundingClientRect();
            const px = clientX - r.left, py = clientY - r.top;
            const v = new THREE.Vector3();
            const ekrana = (x, y, z) => {
                v.set(x, y, z).project(threeCamera);
                if (v.z > 1) return null;
                return { x: (v.x * 0.5 + 0.5) * r.width, y: (-v.y * 0.5 + 0.5) * r.height };
            };
            let enIyi = null;
            Object.entries(model.elements).forEach(([id, el]) => {
                const n1 = model.nodes[el.n1], n2 = model.nodes[el.n2];
                if (!n1 || !n2) return;
                const a = ekrana(n1.x, n1.y, n1.z || 0), b = ekrana(n2.x, n2.y, n2.z || 0);
                if (!a || !b) return;
                const dx = b.x - a.x, dy = b.y - a.y, uz2 = dx * dx + dy * dy;
                let s = uz2 < 1e-6 ? 0 : ((px - a.x) * dx + (py - a.y) * dy) / uz2;
                s = Math.max(0, Math.min(1, s));
                const u = Math.hypot(px - (a.x + s * dx), py - (a.y + s * dy));
                if (u <= tol && (!enIyi || u < enIyi.uzaklik)) enIyi = { elemId: parseInt(id, 10), uzaklik: u, n1, n2 };
            });
            if (!enIyi) return null;

            // Kiris dogrusu uzerinde fare isinina en yakin nokta (3B).
            const { n1, n2 } = enIyi;
            const P = new THREE.Vector3(n1.x, n1.y, n1.z || 0);
            const seg = new THREE.Vector3(n2.x - n1.x, n2.y - n1.y, (n2.z || 0) - (n1.z || 0));
            const L = seg.length();
            if (L < 1e-9) return null;
            const uVec = seg.clone().divideScalar(L);
            const rect = container.getBoundingClientRect();
            const rc = new THREE.Raycaster();
            rc.setFromCamera(new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1,
                                               -((clientY - rect.top) / rect.height) * 2 + 1), threeCamera);
            const Q = rc.ray.origin, w = rc.ray.direction;
            const r0 = P.clone().sub(Q);
            const bq = uVec.dot(w), c = w.dot(w), dd = uVec.dot(r0), e = w.dot(r0);
            const payda = 1 * c - bq * bq;
            let sM = Math.abs(payda) < 1e-9 ? L / 2 : (bq * e - c * dd) / payda;
            sM = Math.max(0, Math.min(L, sM));
            const ratio = sM / L;
            return {
                elemId: enIyi.elemId, ratio, distance: sM, totalLength: L,
                pointX: P.x + uVec.x * sM, pointY: P.y + uVec.y * sM, pointZ: P.z + uVec.z * sM
            };
        }

        // ---- Eksen kilidi (X / Y / Z) ----
        // Serbest 3B gorunuste fare hep bir DUZLEME duser; o duzlemden
        // cikmanin yolu yoktu - kolon cizmek icin XZ gorunusune gecmek
        // gerekiyordu. Kilit varken imlec, taban noktasindan gecen eksen
        // dogrusunun fare isinina EN YAKIN noktasina oturur (iki dogru
        // arasindaki en kisa baglanti). Boylece 3B'de bir dugume tiklayip
        // Z'ye basip yukari cizilebilir; uzunluk yazilirsa da o eksende gider.
        function eksenKilidiNoktasi(clientX, clientY, container, taban, eksen) {
            if (!taban || !eksen) return null;
            if (typeof threeCamera === 'undefined' || !threeCamera || !container) return null;

            const rect = container.getBoundingClientRect();
            const mouse = new THREE.Vector2(
                ((clientX - rect.left) / rect.width) * 2 - 1,
                -((clientY - rect.top) / rect.height) * 2 + 1
            );
            const rc = new THREE.Raycaster();
            rc.setFromCamera(mouse, threeCamera);

            const P = new THREE.Vector3(taban.x, taban.y, taban.z || 0);
            const u = eksen === 'X' ? new THREE.Vector3(1, 0, 0)
                    : eksen === 'Y' ? new THREE.Vector3(0, 1, 0)
                    : new THREE.Vector3(0, 0, 1);
            const Q = rc.ray.origin.clone();
            const w = rc.ray.direction.clone();

            // Eksen dogrusu P + s*u, fare isini Q + t*w. En yakin noktalarin s'i:
            const a = u.dot(u), b = u.dot(w), c = w.dot(w);
            const r0 = P.clone().sub(Q);
            const dd = u.dot(r0), e = w.dot(r0);
            const payda = a * c - b * b;
            // Eksen bakis yonuyle cakisiyorsa (Z kilidi + tam tepeden bakis)
            // derinlik ekrandan okunamaz; kilit uygulanmaz.
            if (Math.abs(payda) < 1e-9) return null;
            const s = (b * e - c * dd) / payda;
            return { x: P.x + u.x * s, y: P.y + u.y * s, z: P.z + u.z * s };
        }

        // Eksen cikarimi: uc eksenden imlece ekranda en yakin olani, 8 px
        // icindeyse. Donus { pos, eksen } ya da null.
        const CIKARIM_PIKSEL = 8;
        function eksenCikarimi(clientX, clientY, container, taban) {
            if (typeof threeCamera === 'undefined' || !threeCamera || !container) return null;
            const r = container.getBoundingClientRect();
            const px = clientX - r.left, py = clientY - r.top;
            const v = new THREE.Vector3();
            let enIyi = null;
            ['X', 'Y', 'Z'].forEach(eksen => {
                const k = eksenKilidiNoktasi(clientX, clientY, container, taban, eksen);
                if (!k) return;
                // Taban noktasinin kendisi her eksende "en yakin"; cok kisa
                // cizgide cikarim anlamsiz.
                const boy = Math.hypot(k.x - taban.x, k.y - taban.y, (k.z || 0) - (taban.z || 0));
                if (boy < 1e-6) return;
                v.set(k.x, k.y, k.z).project(threeCamera);
                if (v.z > 1) return;
                const sx = (v.x * 0.5 + 0.5) * r.width, sy = (-v.y * 0.5 + 0.5) * r.height;
                const u = Math.hypot(px - sx, py - sy);
                if (u <= CIKARIM_PIKSEL && (!enIyi || u < enIyi.u)) enIyi = { pos: k, eksen, u };
            });
            return enIyi ? { pos: enIyi.pos, eksen: enIyi.eksen } : null;
        }

        function eksenKilidiDegistir(eksen) {
            if (typeof cmdState === 'undefined') return;
            cmdState.eksenKilidi = (cmdState.eksenKilidi === eksen) ? null : eksen;
            if (typeof showToast === 'function')
                showToast(cmdState.eksenKilidi ? `Axis lock: ${cmdState.eksenKilidi} (press again to release)` : 'Axis lock off');
            if (typeof updateCommandUI === 'function') updateCommandUI();
        }

        // ---- Esit uzunluk onerisi ----
        // Cizerken imlecin taban noktasina uzakligi, modeldeki bir kirisin
        // boyuna yaklasinca (10 piksel) tam o boya oturtulur: 3000'lik bir
        // kirisin paralelini cizerken 3000'e gelince yakalar. Once mevcut
        // kirislerden CIZILENE PARALEL olanlar denenir (kullanicinin niyeti
        // buyuk olasilikla o), bulunmazsa butun boylar. Dugum yapismasi bunu
        // ezer: gercek bir noktaya yapismak daha kuvvetli bir niyettir.
        function esitUzunlukYapis(taban, p, container) {
            if (!taban || !p) return null;
            if (typeof model === 'undefined' || !model) return null;
            const dx = p.x - taban.x, dy = p.y - taban.y, dz = (p.z || 0) - (taban.z || 0);
            const L = Math.sqrt(dx * dx + dy * dy + dz * dz);
            if (L < 1e-6) return null;
            const yon = { x: dx / L, y: dy / L, z: dz / L };
            const tol = YAPISMA_PIKSEL * pikselBasinaMetre(container);

            let enIyi = null;
            const dene = (boy, paralel, id) => {
                const fark = Math.abs(L - boy);
                if (fark > tol) return;
                // paralel olan, olmayana karsi kazanir; sonra en yakin boy
                if (!enIyi || (paralel && !enIyi.paralel) ||
                    (paralel === enIyi.paralel && fark < enIyi.fark)) {
                    enIyi = { boy, paralel, fark, id };
                }
            };
            Object.entries(model.elements).forEach(([id, el]) => {
                const n1 = model.nodes[el.n1], n2 = model.nodes[el.n2];
                if (!n1 || !n2) return;
                const ex = n2.x - n1.x, ey = n2.y - n1.y, ez = (n2.z || 0) - (n1.z || 0);
                const boy = Math.sqrt(ex * ex + ey * ey + ez * ez);
                if (boy < 1e-6) return;
                const cosA = Math.abs((ex * yon.x + ey * yon.y + ez * yon.z) / boy);
                dene(boy, cosA > 0.9998, parseInt(id, 10));   // ~1 derece
            });
            if (!enIyi) return null;
            return {
                x: taban.x + yon.x * enIyi.boy,
                y: taban.y + yon.y * enIyi.boy,
                z: (taban.z || 0) + yon.z * enIyi.boy,
                type: 'LEN', boy: enIyi.boy, paralel: enIyi.paralel, kaynak: enIyi.id
            };
        }

        // ---- Imlecin 3B model noktasi: TEK yol ----
        // Tiklama ve fare hareketi ayni sirayi izler; ikisi ayri karar
        // verirse onizleme baska, cizilen baska yere duser.
        //   1. Ekranda dugum/orta nokta varsa ONA (gercek 3B konum).
        //   2. Eksen kilidi varsa taban noktasindan o eksende.
        //   3. Yoksa etkin duzleme dus, ortho + duzlem-ici yapisma.
        //   4. Serbest noktada esit uzunluk onerisi.
        // Donus: { pos, snap } ya da null (duzlem gorunuse dik).
        function imlecNoktasi3D(clientX, clientY, container, orthoBase) {
            const dugum = ekrandanYapis(clientX, clientY, container);
            if (dugum) return { pos: { x: dugum.x, y: dugum.y, z: dugum.z }, snap: dugum };

            if (cmdState.eksenKilidi && orthoBase) {
                const k = eksenKilidiNoktasi(clientX, clientY, container, orthoBase, cmdState.eksenKilidi);
                if (k) {
                    const esit = esitUzunlukYapis(orthoBase, k, container);
                    if (esit) return { pos: { x: esit.x, y: esit.y, z: esit.z }, snap: esit };
                    return { pos: k, snap: null };
                }
            }

            // Serbest 3B'de eksen CIKARIMI (tus basmadan): imlec taban
            // noktasindan gecen X/Y/Z dogrusuna ekranda 8 px yaklasirsa o
            // eksene oturur - SketchUp'in renkli eksen cikarimi gibi. Boylece
            // kolon cizmek icin Z'ye basmak sart degil; fare yukari gidince
            // cizgi Z'ye kilitlenir. Iki boyutlu gorunuslerde gerekmez: orada
            // duzlem + ortho ayni isi yapar, Z zaten duzlemin ekseni.
            if (orthoBase && typeof currentViewMode !== 'undefined' && currentViewMode === '3d') {
                const c = eksenCikarimi(clientX, clientY, container, orthoBase);
                if (c) {
                    const esit = esitUzunlukYapis(orthoBase, c.pos, container);
                    if (esit) { esit.eksen = c.eksen; return { pos: { x: esit.x, y: esit.y, z: esit.z }, snap: esit }; }
                    return { pos: c.pos, snap: { x: c.pos.x, y: c.pos.y, z: c.pos.z, type: 'AXIS', eksen: c.eksen } };
                }
            }

            const modelPos = screenToModel3D(clientX, clientY, container, orthoBase);
            if (!modelPos) return null;
            const snapPoint = duzlemeOturt(modelPos, orthoBase, container);
            // Izgara yapismasi en zayif niyet; esit uzunluk onu ezer.
            if (snapPoint && snapPoint.type !== 'GRID') return { pos: modelPos, snap: snapPoint };

            if (orthoBase) {
                const esit = esitUzunlukYapis(orthoBase, modelPos, container);
                if (esit) return { pos: { x: esit.x, y: esit.y, z: esit.z }, snap: esit };
            }
            return { pos: modelPos, snap: snapPoint || null };
        }
        
        // Model to Screen coordinates (3D view)
        function modelToScreen3D(modelX, modelY, container, modelZ = 0) {
            if (!threeCamera || !container) return { x: 0, y: 0 };
            
            const rect = container.getBoundingClientRect();
            const vector = new THREE.Vector3(modelX, modelY, modelZ);
            vector.project(threeCamera);
            
            return {
                x: ((vector.x + 1) / 2) * rect.width + rect.left,
                y: ((-vector.y + 1) / 2) * rect.height + rect.top
            };
        }
        
        // ---- Duzlem ici koordinatlar ----
        // Aktif duzlemin iki ekseni: XY'de (x,y), XZ'de (x,z), YZ'de (y,z).
        // Ortho ve snap bu ikilide calisir; boylece ayni kod XZ ve YZ'de de
        // XY'deki gibi davranir.
        function duzlemUV(p) {
            const d = (typeof aktifCalismaDuzlemi === 'function')
                ? aktifCalismaDuzlemi() : { axis: 'Z', offset: 0 };
            if (d.axis === 'Y') return { u: p.x, v: p.z || 0 };
            if (d.axis === 'X') return { u: p.y, v: p.z || 0 };
            return { u: p.x, v: p.y };
        }

        function duzlemNokta(u, v) {
            const d = (typeof aktifCalismaDuzlemi === 'function')
                ? aktifCalismaDuzlemi() : { axis: 'Z', offset: 0 };
            if (d.axis === 'Y') return { x: u, y: d.offset, z: v };
            if (d.axis === 'X') return { x: d.offset, y: u, z: v };
            return { x: u, y: v, z: d.offset };
        }

        // Fare konumuna ortho ve snap uygular. Iki cizim yolunda da ayni is
        // yapiliyordu ve ikisi de yalnizca x,y biliyordu.
        function duzlemeOturt(modelPos, orthoBase, container) {
            let uv = duzlemUV(modelPos);
            const taban = orthoBase ? duzlemUV(orthoBase) : null;

            if (taban && cmdState.orthoMode) {
                const c = applyOrtho(taban.u, taban.v, uv.u, uv.v);
                uv = { u: c.x, v: c.y };
            }

            // Tolerans ekrandan: kapsayici verilmediyse eski sabit deger.
            const tol = container ? YAPISMA_PIKSEL * pikselBasinaMetre(container) : 0.15;
            const snapPoint = findSnapPoint(uv.u, uv.v, tol);
            if (snapPoint) {
                const s = duzlemUV(snapPoint);
                if (taban && cmdState.orthoMode) {
                    // Ortho yonunde yalnizca o ekseni yapistir.
                    if (Math.abs(uv.u - taban.u) > Math.abs(uv.v - taban.v)) uv.u = s.u;
                    else uv.v = s.v;
                } else {
                    uv = { u: s.u, v: s.v };
                }
            }

            // Duzlem-ici nokta, taban noktasinin derinligine (z=3 gibi)
            // geri yazilir; duzlemNokta etkin duzlemin kaymasini kullanirdi.
            const np = duzlemNokta(uv.u, uv.v);
            if (orthoBase && !(snapPoint && snapPoint.type !== 'GRID')) {
                const d = (typeof aktifCalismaDuzlemi === 'function') ? aktifCalismaDuzlemi() : { axis: 'Z' };
                if (d.axis === 'X') np.x = orthoBase.x;
                else if (d.axis === 'Y') np.y = orthoBase.y;
                else np.z = orthoBase.z || 0;
            }
            modelPos.x = np.x; modelPos.y = np.y; modelPos.z = np.z;
            return snapPoint || null;
        }

        // Apply Ortho constraint
        function applyOrtho(baseX, baseY, currentX, currentY) {
            if (!cmdState.orthoMode) return { x: currentX, y: currentY };
            
            const dx = currentX - baseX;
            const dy = currentY - baseY;
            
            // Constrain to horizontal or vertical
            if (Math.abs(dx) > Math.abs(dy)) {
                return { x: currentX, y: baseY };
            } else {
                return { x: baseX, y: currentY };
            }
        }
        
        // Grid size for grid snap (0.1m = 100mm)
        var GRID_SIZE = 0.1;
        var SNAP_EPSILON = 0.0001;
        
        // Segment intersection helper
        function segmentIntersect(p1, p2, p3, p4) {
            const d = (p1.x - p2.x) * (p3.y - p4.y) - (p1.y - p2.y) * (p3.x - p4.x);
            if (Math.abs(d) < 1e-10) return null;
            const t = ((p1.x - p3.x) * (p3.y - p4.y) - (p1.y - p3.y) * (p3.x - p4.x)) / d;
            const u = -((p1.x - p2.x) * (p1.y - p3.y) - (p1.y - p2.y) * (p1.x - p3.x)) / d;
            if (t > 0.001 && t < 0.999 && u > 0.001 && u < 0.999) {
                return { x: p1.x + t * (p2.x - p1.x), y: p1.y + t * (p2.y - p1.y), t, u };
            }
            return null;
        }
        
        // Govde iki koordinatla calisir. Aktif duzlem XY degilse model o
        // duzleme yansitilir (XZ'de x,z; YZ'de y,z), ayni govde calistirilir
        // ve sonuc geri cevrilir. Eskiden yalnizca x,y okundugu icin XZ ve
        // YZ gorunuslerinde snap yanlis noktalari buluyordu.
        function findSnapPoint(modelX, modelY, tolerance = 0.15) {
            if (!cmdState.snapMode) return null;

            const duzlem = (typeof aktifCalismaDuzlemi === 'function')
                ? aktifCalismaDuzlemi() : { axis: 'Z', offset: 0 };
            const uv = n => duzlem.axis === 'Y' ? { x: n.x, y: n.z || 0 }
                          : duzlem.axis === 'X' ? { x: n.y, y: n.z || 0 }
                          : { x: n.x, y: n.y };
            const geri = p => duzlem.axis === 'Y' ? { x: p.x, y: duzlem.offset, z: p.y }
                            : duzlem.axis === 'X' ? { x: duzlem.offset, y: p.x, z: p.y }
                            : { x: p.x, y: p.y, z: duzlem.offset };

            // Yansitilmis kopya, GERCEK 3B konumu da tasir. Dugume yapisinca
            // duzleme geri yansitilmis noktayi dondurmek, o dugumden gecmeyen
            // bir kiris uretiyordu: ekranda ust uste gorunuyor ama baglanmiyor.
            const D = { nodes: {}, elements: model.elements };
            const derinlik = n => duzlem.axis === 'X' ? n.x : (duzlem.axis === 'Y' ? n.y : (n.z || 0));
            Object.entries(model.nodes).forEach(([id, n]) => {
                const q = uv(n);
                q.gercek = { x: n.x, y: n.y, z: n.z || 0 };
                // Yansitilinca ust uste gelen dugumlerden hangisi? Etkin
                // duzlemin uzerindeki. Yandan bakarken y=0 ve y=4'teki iki
                // dugum ayni yere dusuyor ve rastgele biri tutuluyordu.
                q.duzlemde = Math.abs(derinlik(n) - duzlem.offset) < 0.001;
                D.nodes[id] = q;
            });
            const taban = cmdState.basePoint ? uv(cmdState.basePoint) : { x: 0, y: 0 };

            let best = null;
            let minDist = tolerance;
            let snapType = '';
            let bestDuzlemde = false;
            // Duzlemdeki aday, duzlem disindakini uzaklik ne olursa olsun ezer
            // (ikisi de tolerans icindeyse).
            const dahaIyi = (dist, duzlemde) => {
                if (dist >= tolerance) return false;
                if (duzlemde !== bestDuzlemde) return duzlemde;
                return dist < minDist;
            };

            // 1. Endpoint snap (highest priority)
            Object.values(D.nodes).forEach(node => {
                const dist = Math.sqrt((node.x - modelX) ** 2 + (node.y - modelY) ** 2);
                if (dahaIyi(dist, node.duzlemde)) {
                    minDist = dist; bestDuzlemde = node.duzlemde;
                    best = { x: node.x, y: node.y, gercek: node.gercek };
                    snapType = 'END';
                }
            });

            // 2. Midpoint snap
            Object.values(D.elements).forEach(elem => {
                const n1 = D.nodes[elem.n1];
                const n2 = D.nodes[elem.n2];
                if (n1 && n2) {
                    const midX = (n1.x + n2.x) / 2;
                    const midY = (n1.y + n2.y) / 2;
                    const dist = Math.sqrt((midX - modelX) ** 2 + (midY - modelY) ** 2);
                    const duzlemde = n1.duzlemde && n2.duzlemde;
                    if (dahaIyi(dist, duzlemde)) {
                        minDist = dist; bestDuzlemde = duzlemde;
                        best = { x: midX, y: midY, gercek: (n1.gercek && n2.gercek) ? {
                            x: (n1.gercek.x + n2.gercek.x) / 2,
                            y: (n1.gercek.y + n2.gercek.y) / 2,
                            z: (n1.gercek.z + n2.gercek.z) / 2
                        } : null };
                        snapType = 'MID';
                    }
                }
            });
            
            // 3. Intersection snap
            if (cmdState.snapIntersection) {
                const elems = Object.values(D.elements);
                for (let i = 0; i < elems.length; i++) {
                    for (let j = i + 1; j < elems.length; j++) {
                        const e1 = elems[i], e2 = elems[j];
                        const n1 = D.nodes[e1.n1], n2 = D.nodes[e1.n2];
                        const n3 = D.nodes[e2.n1], n4 = D.nodes[e2.n2];
                        if (!n1 || !n2 || !n3 || !n4) continue;
                        const inter = segmentIntersect(n1, n2, n3, n4);
                        if (inter) {
                            const dist = Math.sqrt((inter.x - modelX) ** 2 + (inter.y - modelY) ** 2);
                            if (dist < minDist) {
                                minDist = dist;
                                best = { x: inter.x, y: inter.y };
                                snapType = 'INT';
                            }
                        }
                    }
                }
            }
            
            // 4. Perpendicular snap (when drawing line from base point)
            if (cmdState.snapPerpendicular && cmdState.basePoint) {
                Object.values(D.elements).forEach(elem => {
                    const n1 = D.nodes[elem.n1], n2 = D.nodes[elem.n2];
                    if (!n1 || !n2) return;
                    const dx = n2.x - n1.x, dy = n2.y - n1.y;
                    const len = Math.sqrt(dx*dx + dy*dy);
                    if (len < SNAP_EPSILON) return;
                    // Project basePoint onto line
                    const t = ((taban.x - n1.x) * dx + (taban.y - n1.y) * dy) / (len * len);
                    if (t < 0 || t > 1) return;
                    const perpX = n1.x + t * dx, perpY = n1.y + t * dy;
                    const dist = Math.sqrt((perpX - modelX) ** 2 + (perpY - modelY) ** 2);
                    if (dist < minDist) {
                        minDist = dist;
                        best = { x: perpX, y: perpY };
                        snapType = 'PERP';
                    }
                });
            }
            
            // 5. Nearest snap - closest point on any beam
            if (cmdState.snapNearest && !best) {
                Object.values(D.elements).forEach(elem => {
                    const n1 = D.nodes[elem.n1], n2 = D.nodes[elem.n2];
                    if (!n1 || !n2) return;
                    
                    const dx = n2.x - n1.x, dy = n2.y - n1.y;
                    const len = Math.sqrt(dx*dx + dy*dy);
                    if (len < 0.001) return;
                    
                    // Project point onto line segment
                    let t = ((modelX - n1.x) * dx + (modelY - n1.y) * dy) / (len * len);
                    t = Math.max(0, Math.min(1, t));
                    
                    const nearX = n1.x + t * dx;
                    const nearY = n1.y + t * dy;
                    const dist = Math.sqrt((nearX - modelX) ** 2 + (nearY - modelY) ** 2);
                    
                    if (dist < minDist) {
                        minDist = dist;
                        best = { x: nearX, y: nearY };
                        snapType = 'NEAR';
                    }
                });
            }
            
            // 6. Grid snap (lowest priority)
            if (cmdState.snapGrid && !best) {
                const gx = Math.round(modelX / GRID_SIZE) * GRID_SIZE;
                const gy = Math.round(modelY / GRID_SIZE) * GRID_SIZE;
                const dist = Math.sqrt((gx - modelX) ** 2 + (gy - modelY) ** 2);
                if (dist < tolerance) {
                    best = { x: gx, y: gy };
                    snapType = 'GRID';
                }
            }
            
            if (best) best.type = snapType;
            if (!best) return null;
            // Model uzerindeki gercek bir noktaya yapisildiysa o noktanin
            // kendisi dondurulur; boylece cizilen kiris ona baglanir.
            // Izgara gibi duzlem uzerindeki yapismalarda duzleme dusurulur.
            const g = best.gercek || geri(best);
            return { x: g.x, y: g.y, z: g.z, type: snapType };
        }
        
        // ============== OBJECT SNAP MARKER (visual) ==============
        var SNAP_MARKER_CONFIG = {
            END:  { color: 'var(--success)', label: 'Endpoint',      shape: '<rect x="5" y="5" width="14" height="14" fill="none" stroke="var(--success)" stroke-width="2"/>' },
            MID:  { color: 'var(--warning)', label: 'Midpoint',      shape: '<polygon points="12,4 20,19 4,19" fill="none" stroke="var(--warning)" stroke-width="2"/>' },
            INT:  { color: 'var(--warning)', label: 'Intersection',  shape: '<line x1="5" y1="5" x2="19" y2="19" stroke="var(--warning)" stroke-width="2"/><line x1="19" y1="5" x2="5" y2="19" stroke="var(--warning)" stroke-width="2"/>' },
            NEAR: { color: 'var(--primary)', label: 'Nearest',       shape: '<polygon points="12,4 20,12 12,20 4,12" fill="none" stroke="var(--primary)" stroke-width="2"/>' },
            GRID: { color: 'var(--text-2)', label: '',          shape: '<line x1="12" y1="4" x2="12" y2="20" stroke="var(--text-2)" stroke-width="1.5"/><line x1="4" y1="12" x2="20" y2="12" stroke="var(--text-2)" stroke-width="1.5"/>' },
            PERP: { color: 'var(--primary)', label: 'Perpendicular', shape: '<path d="M5 5 L5 19 L19 19" fill="none" stroke="var(--primary)" stroke-width="2"/><rect x="6" y="14" width="5" height="5" fill="none" stroke="var(--primary)" stroke-width="1.2"/>' },
            // Esit uzunluk: "=" isareti. Etiket calisma aninda boyu yazar.
            AXIS: { color: 'var(--warning)', label: 'On axis', shape: '<line x1="4" y1="20" x2="20" y2="4" stroke="var(--warning)" stroke-width="2"/><polyline points="14,4 20,4 20,10" fill="none" stroke="var(--warning)" stroke-width="2"/>' },
            LEN:  { color: 'var(--success)', label: 'Equal length', shape: '<line x1="5" y1="9" x2="19" y2="9" stroke="var(--success)" stroke-width="2"/><line x1="5" y1="15" x2="19" y2="15" stroke="var(--success)" stroke-width="2"/>' }
        };

        function showSnapMarker(screenX, screenY, type, etiket) {
            const marker = document.getElementById('snapMarker');
            const svg = document.getElementById('snapMarkerSvg');
            const label = document.getElementById('snapMarkerLabel');
            if (!marker || !svg) return;
            const c = SNAP_MARKER_CONFIG[type] || SNAP_MARKER_CONFIG.END;
            svg.innerHTML = c.shape;
            if (label) { label.textContent = etiket || c.label; label.style.color = c.color; }
            marker.style.left = screenX + 'px';
            marker.style.top = screenY + 'px';
            marker.style.display = 'block';
        }
        
        function hideSnapMarker() {
            const marker = document.getElementById('snapMarker');
            if (marker) marker.style.display = 'none';
        }
        
        // Find point on beam (for split)
        function findPointOnBeam(modelX, modelY, tolerance = 0.15) {
            let result = null;
            let minDist = tolerance;
            
            Object.entries(model.elements).forEach(([elemId, elem]) => {
                const n1 = model.nodes[elem.n1];
                const n2 = model.nodes[elem.n2];
                if (!n1 || !n2) return;
                
                // Calculate distance from point to line segment
                const dx = n2.x - n1.x;
                const dy = n2.y - n1.y;
                const length = Math.sqrt(dx * dx + dy * dy);
                if (length < 0.001) return;
                
                // Parameter t along the line
                let t = ((modelX - n1.x) * dx + (modelY - n1.y) * dy) / (length * length);
                t = Math.max(0, Math.min(1, t));
                
                // Closest point on line
                const closestX = n1.x + t * dx;
                const closestY = n1.y + t * dy;
                
                const dist = Math.sqrt((modelX - closestX) ** 2 + (modelY - closestY) ** 2);
                
                if (dist < minDist && t > 0.01 && t < 0.99) {
                    minDist = dist;
                    result = {
                        elemId: parseInt(elemId),
                        ratio: t,
                        distance: t * length,
                        totalLength: length,
                        pointX: closestX,
                        pointY: closestY
                    };
                }
            });
            
            return result;
        }
        
