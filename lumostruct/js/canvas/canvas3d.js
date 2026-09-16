        // ============== 3D VIEW (Three.js) ==============
        let threeScene, threeCamera, threeRenderer, threeControls;
        let gizmoScene = null, gizmoCamera = null;  // corner navigation gizmo
        // Active work plane for sketching: null = default (Z=0 / XY plane).
        // {axis:'X'|'Y'|'Z', offset: meters} — axis is the plane NORMAL.
        let activeWorkPlane = null;
        let currentViewMode = 'plan';  // 'plan', 'front', '3d'
        let threeInitialized = false;
        let isRotatingTo3D = false;
        let rotationStartX = 0, rotationStartY = 0;
        let cameraAngleX = 0, cameraAngleY = 0;  // For smooth 3D transition
        
        // Display size multiplier for beams and nodes
        window.displaySizeMultiplier = 0.4;  // Default: 0.4x (kullanici tercihi)
        
        // Individual display sizes for geometry elements
        window.displaySizes = {
            beam: 1.0,      // Beam geometry scale
            node: 1.0,      // Node geometry scale
            load: 1.0,      // Load arrow scale
            bc: 1.0         // Boundary condition scale
        };
        
        // Label size settings
        window.labelSizes = {
            beam: 1.0,      // Beam section labels
            load: 1.5,      // Load value labels - larger default for visibility
            coord: 1.0      // Node coordinate labels
        };
        
        // Tema rengini THREE'nin anladigi tam sayiya cevirir.
        //
        // Tema degerleri '#3b82f6' olabilecegi gibi 'var(--primary)' de olabilir -
        // ikincisi renk tokenlarini birlestirirken buraya sizmis, ve
        // parseInt('var(--primary)', 16) NaN veriyor. THREE.Color(NaN) SIYAH cizer,
        // yani cizilen her kiris siyah cikiyordu. Artik CSS degiskeni gercekten
        // cozuluyor; cozulemezse yedek renge dusulur, hicbir kosulda NaN gecmez.
        function temaRenginiInt(deger, yedek) {
            const y = parseInt(String(yedek).replace('#', ''), 16);
            if (!deger) return y;
            let v = String(deger).trim();

            const m = v.match(/^var\(\s*(--[\w-]+)\s*(?:,([^)]*))?\)$/);
            if (m) {
                const cozulen = getComputedStyle(document.documentElement)
                    .getPropertyValue(m[1]).trim();
                v = cozulen || (m[2] ? m[2].trim() : '');
                if (!v) return y;
            }

            if (v[0] === '#') {
                let h = v.slice(1);
                if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
                const n = parseInt(h, 16);
                return Number.isFinite(n) ? n : y;
            }

            const rgb = v.match(/^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i);
            if (rgb) {
                return (Number(rgb[1]) << 16) | (Number(rgb[2]) << 8) | Number(rgb[3]);
            }
            return y;
        }

        function previewDisplaySize(type, value) {
            const val = parseFloat(value);
            window.displaySizes[type] = val;
            
            // Update display value
            const labelIds = {
                'beam': 'beamSizeValue',
                'node': 'nodeSizeValue',
                'loadGeom': 'loadSizeValue',
                'bc': 'bcSizeValue'
            };
            const labelId = labelIds[type];
            const label = document.getElementById(labelId);
            if (label) label.textContent = val.toFixed(1) + 'x';
            
            // For loadGeom, map to 'load' in displaySizes
            if (type === 'loadGeom') {
                window.displaySizes.load = val;
            }
            
            // Live preview
            update3DScene();
        }
        
        function previewLabelSize(type, value) {
            const val = parseFloat(value);
            window.labelSizes[type] = val;
            
            // Update display value
            const labelId = type === 'beam' ? 'beamLabelSizeValue' : 
                           type === 'load' ? 'loadLabelSizeValue' : 'nodeCoordSizeValue';
            const label = document.getElementById(labelId);
            if (label) label.textContent = val.toFixed(1) + 'x';
            
            // Live preview - update 3D scene
            update3DScene();
        }
        
        function saveDisplaySettings() {
            try {
                localStorage.setItem('grillageDisplaySizes', JSON.stringify(window.displaySizes));
                localStorage.setItem('grillageLabelSizes', JSON.stringify(window.labelSizes));
                showToast('Display settings saved');
            } catch(e) {}
        }
        
        function loadDisplaySettings() {
            try {
                // Load display sizes
                const savedDisplay = localStorage.getItem('grillageDisplaySizes');
                if (savedDisplay) {
                    const parsed = safeJsonParse(savedDisplay, null);
                    if (parsed) {
                        window.displaySizes = { ...window.displaySizes, ...parsed };
                    }
                    
                    // Update sliders
                    const beamSlider = document.getElementById('beamSizeSlider');
                    if (beamSlider) beamSlider.value = window.displaySizes.beam;
                    const beamLabel = document.getElementById('beamSizeValue');
                    if (beamLabel) beamLabel.textContent = safeToFixed(window.displaySizes.beam, 1) + 'x';
                    
                    const nodeSlider = document.getElementById('nodeSizeSlider');
                    if (nodeSlider) nodeSlider.value = window.displaySizes.node;
                    const nodeLabel = document.getElementById('nodeSizeValue');
                    if (nodeLabel) nodeLabel.textContent = safeToFixed(window.displaySizes.node, 1) + 'x';
                    
                    const loadSlider = document.getElementById('loadSizeSlider');
                    if (loadSlider) loadSlider.value = window.displaySizes.load;
                    const loadLabel = document.getElementById('loadSizeValue');
                    if (loadLabel) loadLabel.textContent = safeToFixed(window.displaySizes.load, 1) + 'x';
                    
                    const bcSlider = document.getElementById('bcSizeSlider');
                    if (bcSlider) bcSlider.value = window.displaySizes.bc;
                    const bcLabel = document.getElementById('bcSizeValue');
                    if (bcLabel) bcLabel.textContent = safeToFixed(window.displaySizes.bc, 1) + 'x';
                }
                
                // Load label sizes
                const savedLabels = localStorage.getItem('grillageLabelSizes');
                if (savedLabels) {
                    const parsed = safeJsonParse(savedLabels, null);
                    if (parsed) {
                        window.labelSizes = { ...window.labelSizes, ...parsed };
                    }
                    
                    const beamLabelSlider = document.getElementById('beamLabelSize');
                    if (beamLabelSlider) beamLabelSlider.value = window.labelSizes.beam;
                    const beamLabelLabel = document.getElementById('beamLabelSizeValue');
                    if (beamLabelLabel) beamLabelLabel.textContent = window.labelSizes.beam.toFixed(1) + 'x';
                    
                    const loadLabelSlider = document.getElementById('loadLabelSize');
                    if (loadLabelSlider) loadLabelSlider.value = window.labelSizes.load;
                    const loadLabelLabel = document.getElementById('loadLabelSizeValue');
                    if (loadLabelLabel) loadLabelLabel.textContent = window.labelSizes.load.toFixed(1) + 'x';
                    
                    const coordSlider = document.getElementById('nodeCoordSize');
                    if (coordSlider) coordSlider.value = window.labelSizes.coord;
                    const coordLabel = document.getElementById('nodeCoordSizeValue');
                    if (coordLabel) coordLabel.textContent = window.labelSizes.coord.toFixed(1) + 'x';
                }
            } catch(e) {}
        }
        
        function updateDisplaySize(value) {
            // Legacy function for toolbar slider - affects all geometry
            const val = parseFloat(value);
            window.displaySizeMultiplier = val;
            
            const label = document.getElementById('displaySizeLabel');
            if (label) label.textContent = val + 'x';
            
            // Refresh view
            update3DScene();
        }
        
        // Gizmo arka plan diskini (yeniden) olusturur. Tema degisince cagrilir; disk
        // bir kez kuruldugu icin eskiden acik temada koyu bir leke olarak kaliyordu.
        function rebuildGizmoDisk() {
            if (!gizmoScene || typeof THREE === 'undefined') return;
            const eski = gizmoScene.getObjectByName('gizmoDisk');
            if (eski) gizmoScene.remove(eski);

            const isLight = document.body.classList.contains('light-mode');
            const dc = document.createElement('canvas');
            dc.width = 256; dc.height = 256;
            const dx = dc.getContext('2d');
            dx.beginPath();
            dx.arc(128, 128, 122, 0, Math.PI * 2);
            dx.fillStyle = isLight ? 'rgba(255, 255, 255, 0.92)' : 'rgba(17, 24, 39, 0.92)';
            dx.fill();
            dx.lineWidth = 5;
            dx.strokeStyle = isLight ? 'rgba(100, 116, 139, 0.35)' : 'rgba(148, 163, 184, 0.30)';
            dx.stroke();

            const dtex = new THREE.CanvasTexture(dc);
            dtex.minFilter = THREE.LinearFilter;
            const disk = new THREE.Sprite(new THREE.SpriteMaterial({
                map: dtex, transparent: true, depthTest: false, depthWrite: false }));
            disk.name = 'gizmoDisk';
            disk.scale.set(3.2, 3.2, 1);
            disk.renderOrder = 0;
            gizmoScene.add(disk);
        }

        // Renders the corner navigation gizmo in a small bottom-left viewport.
        // The gizmo camera mirrors the main camera's orientation so X/Y/Z always
        // point the right way; fixed size, never overlaps the model.
        function renderGizmo() {
            if (!gizmoScene || !gizmoCamera || !threeRenderer || !threeCamera) return;
            const cont = document.getElementById('threeContainer');
            if (!cont) return;
            const size = 150, marginX = 16, marginY = 78; // bottom-left, above view label

            const dir = new THREE.Vector3();
            threeCamera.getWorldDirection(dir);
            gizmoCamera.position.copy(dir.clone().multiplyScalar(-3.5));
            gizmoCamera.up.copy(threeCamera.up);
            gizmoCamera.lookAt(0, 0, 0);

            const fullW = cont.clientWidth, fullH = cont.clientHeight;
            const prevAutoClear = threeRenderer.autoClear;
            threeRenderer.autoClear = false;
            threeRenderer.clearDepth();
            threeRenderer.setViewport(marginX, marginY, size, size);
            threeRenderer.setScissor(marginX, marginY, size, size);
            threeRenderer.setScissorTest(true);
            threeRenderer.render(gizmoScene, gizmoCamera);
            threeRenderer.setScissorTest(false);
            threeRenderer.setViewport(0, 0, fullW, fullH);
            threeRenderer.autoClear = prevAutoClear;
        }
        
        // Activate a sketch work plane and align the view to it.
        // axis = plane NORMAL ('Z'→XY/plan, 'Y'→XZ/front, 'X'→YZ/side).
        function setWorkPlane(axis, offset) {
            activeWorkPlane = { axis: axis, offset: offset };
            if (typeof izgarayiDuzlemeGore === 'function') izgarayiDuzlemeGore();
            if (axis === 'Z') setViewMode('plan', true, true);
            else if (axis === 'Y') setViewMode('front', true, true);
            else if (axis === 'X') setViewMode('side', true, true);
            if (typeof update3DScene === 'function') update3DScene();
            const mm = (offset * 1000).toFixed(0);
            const planeName = axis === 'Z' ? 'XY' : (axis === 'Y' ? 'XZ' : 'YZ');
            if (typeof showToast === 'function') showToast(`Work plane: ${planeName} (${axis}=${mm}mm)`, 'info');
        }
        
        function clearWorkPlane() {
            if (!activeWorkPlane) return;
            activeWorkPlane = null;
            if (typeof duzlemSeritleriniTazele === 'function') duzlemSeritleriniTazele();
            if (typeof izgarayiDuzlemeGore === 'function') izgarayiDuzlemeGore();
            if (typeof update3DScene === 'function') update3DScene();
            if (typeof showToast === 'function') showToast('Work plane cleared', 'info');
        }
        
        // Is the element (its two nodes) on the active work plane slice?
        function isOnActiveWorkPlane(n1, n2) {
            if (!activeWorkPlane) return true;
            const tol = 0.02; // 20mm slice tolerance
            const o = activeWorkPlane.offset, ax = activeWorkPlane.axis;
            const c1 = ax === 'X' ? n1.x : (ax === 'Y' ? n1.y : (n1.z || 0));
            const c2 = ax === 'X' ? n2.x : (ax === 'Y' ? n2.y : (n2.z || 0));
            return Math.abs(c1 - o) <= tol && Math.abs(c2 - o) <= tol;
        }
        
        // Ghost (fade) an object if it's off the active work plane.
        // Vurgu tazelemesinin ihtiyac duydugu malzemeler update3DScene'in
        // ICINDE, tema renklerinden uretiliyor - disaridan gorunmuyorlar.
        // Hepsini disari tasimak tema degisimini etkiler; bunun yerine
        // update3DScene her kurulumda gereken parcalari buraya birakir.
        let vurguMalzeme = null;

        function applyWorkPlaneGhost(obj3d, n1, n2) {
            if (!activeWorkPlane || isOnActiveWorkPlane(n1, n2)) return;
            // Serbest 3B'de soldurma YOK: orada calisma duzlemi 3B gorunusu
            // birakmadan secilebiliyor ve modelin geri kalanini %10 opaklikta
            // birakmak butun yapiyi yok ediyordu. Soldurma 2B duzlem
            // gorunuslerinde anlamli - orada zaten tek bir dilimde calisiliyor.
            if (typeof currentViewMode !== 'undefined' && currentViewMode === '3d') return;
            obj3d.traverse(o => {
                if (o.material) {
                    o.material = o.material.clone();
                    o.material.transparent = true;
                    o.material.opacity = 0.1;
                    o.material.depthWrite = false;
                }
            });
        }
        
        // Sets the view label/buttons to 3D (Free) without moving the camera.
        // Called when the user orbits away from an orthographic plane.
        function markViewAsFree3D() {
            if (currentViewMode === '3d') return;
            currentViewMode = '3d';
            document.querySelectorAll('.view-mode-btn').forEach(btn => btn.classList.remove('active'));
            const ab = document.getElementById('btnView3D');
            if (ab) ab.classList.add('active');
            const btnPlan = document.getElementById('btnPlan');
            const btnFront = document.getElementById('btnFront');
            const btn3D = document.getElementById('btn3D');
            if (btnPlan) btnPlan.classList.remove('active');
            if (btnFront) btnFront.classList.remove('active');
            if (btn3D) btn3D.classList.add('active');
            const vi = document.getElementById('viewModeName');
            if (vi) vi.innerHTML = '<span class="icon"><svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8" cy="8" r="1" fill="currentColor"/><circle cx="16" cy="8" r="1" fill="currentColor"/><circle cx="8" cy="16" r="1" fill="currentColor"/><circle cx="16" cy="16" r="1" fill="currentColor"/><circle cx="12" cy="12" r="1" fill="currentColor"/></svg></span> 3D (Free)';
        }
        
        function setViewMode(mode, animate = true, keepWorkPlane = false) {
            currentViewMode = mode;
            // Manual view buttons clear the work plane; only setWorkPlane keeps it
            if (!keepWorkPlane) activeWorkPlane = null;
            
            // Update canvas view mode buttons
            document.querySelectorAll('.view-mode-btn').forEach(btn => btn.classList.remove('active'));
            const btnId = mode === 'plan' ? 'btnViewPlan' : mode === 'front' ? 'btnViewFront' : mode === 'side' ? 'btnViewSide' : 'btnView3D';
            const activeBtn = document.getElementById(btnId);
            if (activeBtn) activeBtn.classList.add('active');
            
            // Update toolbar buttons
            const btnPlan = document.getElementById('btnPlan');
            const btnFront = document.getElementById('btnFront');
            const btn3D = document.getElementById('btn3D');
            if (btnPlan) btnPlan.classList.toggle('active', mode === 'plan');
            if (btnFront) btnFront.classList.toggle('active', mode === 'front');
            if (btn3D) btn3D.classList.toggle('active', mode === '3d');
            
            // Update view info
            const viewNames = {
                'plan': '<span class="icon"><svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="12" y1="3" x2="12" y2="21"/></svg></span> XY Plane (Top)',
                'front': '<span class="icon"><svg viewBox="0 0 24 24"><path d="M16 3H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z"/><line x1="6" y1="7" x2="10" y2="7"/><line x1="6" y1="12" x2="8" y2="12"/><line x1="6" y1="17" x2="10" y2="17"/></svg></span> XZ Plane (Front)',
                'side': '<span class="icon"><svg viewBox="0 0 24 24"><path d="M21.21 15.89A1 1 0 0 0 22 15V6a1 1 0 0 0-.29-.71l-4-4A1 1 0 0 0 17 1H8a1 1 0 0 0-.71.29l-4 4A1 1 0 0 0 3 6v9a1 1 0 0 0 .79.98l8 2a1 1 0 0 0 .42 0l8-2z"/><line x1="7" y1="6" x2="7" y2="10"/><line x1="11" y1="6" x2="11" y2="8"/><line x1="15" y1="6" x2="15" y2="10"/></svg></span> YZ Plane (Side)',
                '3d': '<span class="icon"><svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8" cy="8" r="1" fill="currentColor"/><circle cx="16" cy="8" r="1" fill="currentColor"/><circle cx="8" cy="16" r="1" fill="currentColor"/><circle cx="16" cy="16" r="1" fill="currentColor"/><circle cx="12" cy="12" r="1" fill="currentColor"/></svg></span> 3D Isometric'
            };
            const viewInfo = document.getElementById('viewModeName');
            if (viewInfo) viewInfo.innerHTML = viewNames[mode] || mode;
            
            // ALWAYS use Three.js - just change camera position
            initThreeJS();
            document.getElementById('threeContainer').style.display = 'block';
            document.getElementById('mainCanvas').style.display = 'none';
            
            update3DScene();
            
            // Set camera angles based on view mode
            // spherical: theta = rotation around Z, phi = angle from Z axis
            let targetTheta, targetPhi;
            
            switch (mode) {
                case 'plan':
                    // XY duzlemi - tam tepeden.
                    //
                    // phi 0.01 idi (tam dik degil, yarim derece yatik). Ortografik
                    // kamerada bu yatiklik derinligi ekrana KAYDIRIR: z=0 ve z=4
                    // dugumleri ust uste gelmiyor, 4*tan(0.01) = 4 cm kayiyordu
                    // (olculdu: 1.7 piksel). Tam dik bakista kayma sifir.
                    //
                    // theta 0 iken ekranin sagi +Y, asagisi +X oluyordu: plan
                    // gorunusu 90 derece donuk, ustelik XZ gorunusuyle celisiyor
                    // (orada +X saga gidiyor). theta = -90 ile +X saga, +Y yukari
                    // gelir; XY, XZ ve YZ artik ayni X yonunu gosterir.
                    targetTheta = -Math.PI / 2;
                    targetPhi = 0;
                    break;
                case 'front':
                    // XZ Plane - Front view (looking along Y axis from negative Y)
                    targetTheta = -Math.PI / 2;  // -90 degrees
                    targetPhi = Math.PI / 2;     // Horizontal
                    break;
                case 'side':
                    // YZ Plane - Side view (looking along X axis from negative X)
                    targetTheta = Math.PI;       // 180 degrees
                    targetPhi = Math.PI / 2;     // Horizontal
                    break;
                case '3d':
                default:
                    // Isometric 3D view
                    targetTheta = Math.PI / 4;   // 45 degrees
                    targetPhi = Math.PI / 4;     // 45 degrees from vertical
                    break;
            }
            
            // Update target to model center, offset onto the active work plane
            const bounds = getModelBounds();
            let tx = bounds.centerX, ty = bounds.centerY, tz = 0;
            if (activeWorkPlane) {
                if (activeWorkPlane.axis === 'Z') tz = activeWorkPlane.offset;
                else if (activeWorkPlane.axis === 'Y') ty = activeWorkPlane.offset;
                else if (activeWorkPlane.axis === 'X') tx = activeWorkPlane.offset;
            }
            
            if (animate && threeControls) {
                animateCameraAngles(targetTheta, targetPhi, tx, ty, tz);
            } else if (threeControls) {
                threeControls.setTarget(tx, ty, tz);
                threeControls.setAngles(targetTheta, targetPhi);
            }
            
            // Cerceve KORUNUR. Burada her gorunus degisiminde fit3DView()
            // cagriliyordu ve aci animasyonunun ortasinda (300ms) devreye
            // girip yakinligi bir anda degistiriyordu: 3B'den XY'ye gecerken
            // goruntu once donuyor sonra ziplayarak uzaklasiyordu.
            // Yakinlastirma zaten korunabilir durumda - updateCameraPosition
            // 2B'ye gecerken mesafeyi OLCEK_2B ile carpip FOV'u kisiyor, yani
            // modelin ekrandaki boyu ayni kaliyor.
            // Yalnizca programatik ilk kurulumda (animate=false) cerceveletir;
            // dugmeye basan kullanicinin yakinligi bozulmaz.
            if (!animate) setTimeout(() => fit3DView(), 50);

            // Izgara aktif duzleme doner: XZ'ye gecince XZ'de, YZ'ye gecince
            // YZ'de gorunur. Serbest 3B'de zeminde (XY) kalir.
            izgarayiDuzlemeGore();
            
            animate3D();
        }
        
        // Smooth camera angle animation
        function animateCameraAngles(targetTheta, targetPhi, targetX, targetY, targetZ = 0) {
            if (!threeControls) return;
            
            const startTheta = threeControls.spherical.theta;
            const startPhi = threeControls.spherical.phi;

            // Azimut acisi cemberseldir: -90 dereceye giderken +270 yerine -90
            // yonune donmeli. Hedefi baslangica en yakin esdegerine tasi, yoksa
            // gorunus degistirirken kamera modelin cevresinde uzun yoldan
            // dolaniyor.
            let hedefTheta = targetTheta;
            while (hedefTheta - startTheta > Math.PI) hedefTheta -= 2 * Math.PI;
            while (hedefTheta - startTheta < -Math.PI) hedefTheta += 2 * Math.PI;
            const startTargetX = threeControls.target.x;
            const startTargetY = threeControls.target.y;
            const startTargetZ = threeControls.target.z || 0;
            
            const duration = 480; // ms
            const startTime = performance.now();
            
            function animateStep() {
                const elapsed = performance.now() - startTime;
                const progress = Math.min(elapsed / duration, 1);
                
                // Ease in-out cubic (smooth start and end)
                const eased = progress < 0.5
                    ? 4 * progress * progress * progress
                    : 1 - Math.pow(-2 * progress + 2, 3) / 2;
                
                // Interpolate angles
                const currentTheta = startTheta + (hedefTheta - startTheta) * eased;
                const currentPhi = startPhi + (targetPhi - startPhi) * eased;
                
                // Interpolate target
                const currentX = startTargetX + (targetX - startTargetX) * eased;
                const currentY = startTargetY + (targetY - startTargetY) * eased;
                const currentZ = startTargetZ + (targetZ - startTargetZ) * eased;
                
                threeControls.target.x = currentX;
                threeControls.target.y = currentY;
                threeControls.target.z = currentZ;
                threeControls.setAngles(currentTheta, currentPhi);
                
                if (progress < 1) {
                    requestAnimationFrame(animateStep);
                }
                // Animasyon bitince fit3DView() cagriliyordu: gorunus yumusakca
                // donuyor, sonra birden yakinlik degisiyordu - "smooth gecis
                // ama sonunda bir zoom" tam olarak buydu. setViewMode'daki
                // ayni cagriyi kaldirmistim, buradaki kalmis.
                // Yakinlik zaten korunur: 2B'ye gecerken updateCameraPosition
                // mesafeyi OLCEK_2B ile carpip FOV'u kisiyor, model ekranda
                // ayni boyda kaliyor.
            }
            
            animateStep();
        }
        
        function getModelBounds() {
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            Object.values(model.nodes).forEach(n => {
                minX = Math.min(minX, n.x);
                minY = Math.min(minY, n.y);
                maxX = Math.max(maxX, n.x);
                maxY = Math.max(maxY, n.y);
            });
            if (!isFinite(minX)) { minX = -5; maxX = 5; minY = -5; maxY = 5; }
            return {
                minX, minY, maxX, maxY,
                centerX: (minX + maxX) / 2,
                centerY: (minY + maxY) / 2
            };
        }
        
        function initThreeJS() {
            if (threeInitialized) return;
            
            const container = document.getElementById('threeContainer');
            
            // Make sure container is visible before getting dimensions
            container.style.display = 'block';
            document.getElementById('mainCanvas').style.display = 'none';
            
            const rect = container.parentElement.getBoundingClientRect();
            const width = rect.width || 800;
            const height = rect.height || 600;
            
            // Check theme
            const isLight = document.body.classList.contains('light-mode');
            
            // Scene
            threeScene = new THREE.Scene();
            threeScene.background = new THREE.Color(isLight ? 0xf8fafc : 0x0a0e17);
            if (typeof applyThemeToScene === 'function') applyThemeToScene();
            
            // Camera
            threeCamera = new THREE.PerspectiveCamera(60, width / height, 0.01, 1000);
            threeCamera.position.set(5, 5, 5);
            threeCamera.lookAt(0, 0, 0);
            
            // Renderer
            threeRenderer = new THREE.WebGLRenderer({ antialias: true });
            threeRenderer.setSize(width, height);
            threeRenderer.setPixelRatio(window.devicePixelRatio);
            container.appendChild(threeRenderer.domElement);
            
            // Corner navigation gizmo: separate scene + camera (rendered in a small
            // viewport at the bottom-left corner, follows the main camera's angle)
            gizmoScene = new THREE.Scene();
            gizmoCamera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
            gizmoCamera.up.set(0, 0, 1);
            // Arka plan diski: gizmo goruntu alaninin arkasindaki model/izgara
            // sizmasin diye. Temaya gore yeniden kurulabilmesi icin ayri fonksiyon.
            rebuildGizmoDisk();
            
            // Lights
            const ambientLight = new THREE.AmbientLight(0x404040, 0.5);
            threeScene.add(ambientLight);
            
            const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
            directionalLight.position.set(10, 10, 10);
            threeScene.add(directionalLight);
            
            const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.4);
            directionalLight2.position.set(-10, -5, -10);
            threeScene.add(directionalLight2);
            
            // Grid helper - will be replaced by recreateGrid() after init
            window.gridHelper = new THREE.GridHelper(500, 500, 
                isLight ? 0xcbd5e1 : 0x334155, 
                isLight ? 0xe2e8f0 : 0x1e293b
            );
            window.gridHelper.rotation.x = Math.PI / 2;
            window.gridHelper.isGridHelper = true;  // Mark for toggle
            threeScene.add(window.gridHelper);
            
            // Initialize grid settings after scene is ready
            setTimeout(() => {
                if (typeof recreateGrid === 'function') {
                    recreateGrid();
                }
            }, 100);
            
            // Custom axes with arrows and labels - stored in a group for scaling
            window.axesGroup = new THREE.Group();
            window.axesGroup.userData.isAxes = true;
            
            function createAxisWithArrowAndLabel(name, color, direction, axisLength) {
                const arrowLength = axisLength * 0.17;
                const arrowRadius = axisLength * 0.062;  // fuller arrow head
                const lineRadius = axisLength * 0.022;   // prominent shaft
                const shaftLen = axisLength - arrowLength; // leave room for the cone
                const colorHex = '#' + color.toString(16).padStart(6, '0');
                const isZ = (name === 'Z');

                // Shaft (silindir) — yumuşak, yüksek segment
                const lineGeometry = new THREE.CylinderGeometry(lineRadius, lineRadius, shaftLen, 24);
                const lineMaterial = new THREE.MeshBasicMaterial({ color: color });
                const line = new THREE.Mesh(lineGeometry, lineMaterial);
                line.renderOrder = 10;
                if (isZ) line.userData.isZAxis = true;

                const midPos = direction.clone().multiplyScalar(shaftLen / 2);
                line.position.copy(midPos);
                if (name === 'X') line.rotation.z = Math.PI / 2;
                else if (name === 'Z') line.rotation.x = Math.PI / 2;
                window.axesGroup.add(line);

                // Ok başı (koni) — daha fazla segment, zarif
                const coneGeometry = new THREE.ConeGeometry(arrowRadius, arrowLength, 28);
                const coneMaterial = new THREE.MeshBasicMaterial({ color: color });
                const cone = new THREE.Mesh(coneGeometry, coneMaterial);
                cone.renderOrder = 10;
                if (isZ) cone.userData.isZAxis = true;

                const endPos = direction.clone().multiplyScalar(shaftLen + arrowLength / 2);
                cone.position.copy(endPos);
                if (name === 'X') cone.rotation.z = -Math.PI / 2;
                else if (name === 'Z') cone.rotation.x = Math.PI / 2;
                window.axesGroup.add(cone);

                // Label — colored circular badge + white letter (CAD gizmo look)
                const canvas = document.createElement('canvas');
                canvas.width = 256; canvas.height = 256;
                const ctx = canvas.getContext('2d');
                const cx = 128, cy = 128, r = 100;
                // outer ring (subtle highlight)
                ctx.beginPath();
                ctx.arc(cx, cy, r, 0, Math.PI * 2);
                ctx.fillStyle = colorHex;
                ctx.fill();
                ctx.lineWidth = 16;
                ctx.strokeStyle = 'rgba(255,255,255,0.95)';
                ctx.stroke();
                // letter
                ctx.fillStyle = '#ffffff';
                ctx.font = 'bold 128px Inter, Arial, sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(name, cx, cy + 4);

                const texture = new THREE.CanvasTexture(canvas);
                texture.minFilter = THREE.LinearMipmapLinearFilter; // mipmap → küçültmede pürüzsüz
                texture.magFilter = THREE.LinearFilter;
                texture.generateMipmaps = true;
                if (threeRenderer && threeRenderer.capabilities) {
                    texture.anisotropy = threeRenderer.capabilities.getMaxAnisotropy();
                }
                const spriteMaterial = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
                const sprite = new THREE.Sprite(spriteMaterial);
                sprite.renderOrder = 11;
                const spriteScale = axisLength * 0.34;
                sprite.scale.set(spriteScale, spriteScale, 1);
                if (isZ) sprite.userData.isZAxis = true;

                const labelPos = direction.clone().multiplyScalar(axisLength + spriteScale * 0.55);
                sprite.position.copy(labelPos);
                window.axesGroup.add(sprite);
            }
            
            // Initial axes (will be updated in update3DScene based on model size)
            createAxisWithArrowAndLabel('X', 0xff3b30, new THREE.Vector3(1, 0, 0), 1);
            createAxisWithArrowAndLabel('Y', 0x34c759, new THREE.Vector3(0, 1, 0), 1);
            createAxisWithArrowAndLabel('Z', 0x0a84ff, new THREE.Vector3(0, 0, 1), 1);
            gizmoScene.add(window.axesGroup);
            
            // OrbitControls (manual implementation since CDN doesn't include it)
            setupOrbitControls(container);
            
            threeInitialized = true;
            
            // Load saved color theme
            loadColorTheme();
            loadDisplaySettings();
            setTimeout(() => applyColorTheme(), 100);
            
            // Initialize stress legend dragging
            initStressLegendDrag();
            
            // Handle resize
            window.addEventListener('resize', () => {
                const rect = container.parentElement.getBoundingClientRect();
                kamerayiYenidenOlcekle(rect.width, rect.height);
            });
        }

        // Renderer boyutu degisince kamera da guncellenmeli. Eskiden bes ayri
        // yerde "threeCamera.aspect = w/h; updateProjectionMatrix()" yaziyordu;
        // ortografik kamerada aspect diye bir alan YOKTUR, o satirlar sessizce
        // hicbir sey yapmaz ve 2B gorunum pencere yeniden boyutlandikca
        // gerinirdi. Tek giris noktasi: updateCameraPosition her iki kamerayi da
        // dogru kurar.
        function kamerayiYenidenOlcekle(genislik, yukseklik) {
            if (typeof threeRenderer === 'undefined' || !threeRenderer) return;
            if (!(genislik > 0) || !(yukseklik > 0)) return;
            threeRenderer.setSize(genislik, yukseklik);
            if (typeof threeControls !== 'undefined' && threeControls) threeControls.update();
        }
        
        // Stress legend drag functionality
        function initStressLegendDrag() {
            const legend = document.getElementById('stressLegend');
            const header = document.getElementById('stressLegendHeader');
            if (!legend || !header) return;
            
            let isDragging = false;
            let startX, startY, startLeft, startTop;
            
            header.addEventListener('mousedown', (e) => {
                isDragging = true;
                startX = e.clientX;
                startY = e.clientY;
                
                const rect = legend.getBoundingClientRect();
                const containerRect = legend.parentElement.getBoundingClientRect();
                
                startLeft = rect.left - containerRect.left;
                startTop = rect.top - containerRect.top;
                
                // Switch to left/top positioning
                legend.style.right = 'auto';
                legend.style.bottom = 'auto';
                legend.style.left = startLeft + 'px';
                legend.style.top = startTop + 'px';
                
                e.preventDefault();
            });
            
            document.addEventListener('mousemove', (e) => {
                if (!isDragging) return;
                
                const dx = e.clientX - startX;
                const dy = e.clientY - startY;
                
                const containerRect = legend.parentElement.getBoundingClientRect();
                let newLeft = startLeft + dx;
                let newTop = startTop + dy;
                
                // Constrain to container
                newLeft = Math.max(0, Math.min(newLeft, containerRect.width - legend.offsetWidth));
                newTop = Math.max(0, Math.min(newTop, containerRect.height - legend.offsetHeight));
                
                legend.style.left = newLeft + 'px';
                legend.style.top = newTop + 'px';
            });
            
            document.addEventListener('mouseup', () => {
                isDragging = false;
            });
        }
        
        // Simple orbit controls implementation
        function setupOrbitControls(container) {
            let isDragging = false;
            let isPanning = false;
            let isRotating = false;
            let hasMoved = false;
            let previousMousePosition = { x: 0, y: 0 };
            let mouseDownPosition = { x: 0, y: 0 };
            window.spherical = { theta: Math.PI / 4, phi: Math.PI / 4, radius: 8 };
            let spherical = window.spherical;  // Local reference
            let target = new THREE.Vector3(0, 0, 0);
            let mouseButton = -1;
            
            // Box selection state
            let isBoxSelecting = false;
            let boxStartX = 0, boxStartY = 0;
            
            // Raycaster for 3D selection
            const raycaster = new THREE.Raycaster();
            raycaster.params.Line.threshold = 0.08; // Line selection tolerance (meters = 80mm)
            raycaster.params.Points.threshold = 0.05; // Point selection tolerance (50mm)
            const mouse = new THREE.Vector2();
            
            // XY / XZ / YZ gorunumleri TAM 2B olmali: derinlikte ayri duran iki
            // sey (ornegin y=0 ve y=3 cerceveleri) yandan bakinca ekranda TEK
            // sey gorunmeli.
            //
            // Once perspektif kamerada gorus acisi 60'tan 2 dereceye kisiliyor,
            // kamera da ayni oranda geri cekiliyordu. Bu perspektifi azaltir ama
            // BITIRMEZ. Iki noktanin ekranda ayrisma miktari
            //     kayma = (ekran merkezine uzaklik) * (derinlik farki) / (kamera mesafesi)
            // ve kamera mesafesi yakinlastikca kuculdugu icin kayma buyur.
            // Olculdu: y=0 / y=3 cerceveleri radius=15'te 1.3 piksel, radius=3'te
            // ~20 piksel ayriliyordu - yani yakinlastikca her sey cift gorunuyor.
            //
            // Ortografik kamerada bu kayma tanim geregi SIFIR: butun izdusum
            // isinlari paralel, derinlik ekran konumunu hic etkilemez. Dugum,
            // kiris, yuk oku, mesnet, etiket - hepsi ayni izdusumden gectigi icin
            // istisnasiz butun ogeler icin gecerli.
            //
            // Cerceveleme korunur: perspektif kamera hedef duzleminde yari
            // yuksekligi r*tan(30) kadar gorur, ortografik kameranin yari
            // yuksekligi de radius*tan(30) aliniyor. Boylece 3B <-> 2B gecisinde
            // model ekranda ayni boyda kalir, yakinlik ziplamaz.
            const FOV_3B = 60;
            const YARIM_TAN = Math.tan(FOV_3B * Math.PI / 360);

            // Perspektif kamera initThreeJS'te kuruldu; ortografik esi burada.
            // updateCameraPosition hangisinin etkin oldugunu secer ve global
            // threeCamera'yi ona baglar - diger dosyalar hep o degiskeni okur.
            const perspektifKamera = threeCamera;
            const ortografikKamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 1000);
            ortografikKamera.up.set(0, 0, 1);

            const olcuVec = new THREE.Vector2();
            function goruntuOrani() {
                if (!threeRenderer) return perspektifKamera.aspect || 1;
                threeRenderer.getSize(olcuVec);
                return olcuVec.y > 0 ? olcuVec.x / olcuVec.y : (perspektifKamera.aspect || 1);
            }

            function updateCameraPosition() {
                const ikiBoyut = (typeof currentViewMode !== 'undefined' && currentViewMode !== '3d');
                const kamera = ikiBoyut ? ortografikKamera : perspektifKamera;
                threeCamera = kamera;
                const oran = goruntuOrani();

                // Ortografik kamerada mesafe goruntuyu buyutup kucultmez; kamera
                // yalnizca modelin tamami on kirpma duzleminin otesinde kalsin
                // diye uzakta durur.
                const r = ikiBoyut ? (spherical.radius * 20 + 50) : spherical.radius;

                const x = r * Math.sin(spherical.phi) * Math.cos(spherical.theta);
                const y = r * Math.sin(spherical.phi) * Math.sin(spherical.theta);
                const z = r * Math.cos(spherical.phi);

                kamera.position.set(target.x + x, target.y + y, target.z + z);

                // lookAt yukari yonu KULLANIR, bu yuzden ONCE kurulur.
                //
                // Tam tepeden bakista (phi = 0) dunya +Z'si bakis yonuyle
                // cakisir; lookAt bu durumda bakis eksenini 0.0001 iteleyip
                // rastgele bir yon secer - plan gorunusu 90 derece donuk cikardi.
                // phi kucukken ekranin yukarisi (-cos(theta), -sin(theta), 0)
                // yonune gider; tam tepede de ayni degeri veriyoruz, boylece
                // donerken sicrama olmaz ve theta plan gorunusunun yonunu
                // belirlemeye devam eder.
                const sinPhi = Math.sin(spherical.phi);
                if (Math.abs(sinPhi) < 1e-6) {
                    kamera.up.set(-Math.cos(spherical.theta), -Math.sin(spherical.theta), 0);
                } else {
                    kamera.up.set(0, 0, 1);
                }
                kamera.lookAt(target);

                if (ikiBoyut) {
                    const yariY = Math.max(1e-4, spherical.radius * YARIM_TAN);
                    const yariX = yariY * oran;
                    const uzak = r * 2 + 200;
                    if (kamera.right !== yariX || kamera.top !== yariY || kamera.far !== uzak) {
                        kamera.left = -yariX;
                        kamera.right = yariX;
                        kamera.top = yariY;
                        kamera.bottom = -yariY;
                        kamera.near = 0.01;
                        kamera.far = uzak;
                        kamera.updateProjectionMatrix();
                    }
                } else {
                    // Kamera uzaklastikca sabit near/far derinlik hassasiyetini
                    // bitirir (z-fighting). Ikisi de mesafeyle olceklenir.
                    const near = Math.max(0.01, r * 0.01);
                    const far = r * 10;
                    if (kamera.aspect !== oran || kamera.fov !== FOV_3B ||
                        kamera.near !== near || kamera.far !== far) {
                        kamera.aspect = oran;
                        kamera.fov = FOV_3B;
                        kamera.near = near;
                        kamera.far = far;
                        kamera.updateProjectionMatrix();
                    }
                }
            }
            
            container.addEventListener('mousedown', (e) => {
                mouseButton = e.button;
                mouseDownPosition = { x: e.clientX, y: e.clientY };
                previousMousePosition = { x: e.clientX, y: e.clientY };
                hasMoved = false;
                hideAllContextMenus();
                
                // Raycast to find what's under cursor
                const rect = container.getBoundingClientRect();
                mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
                mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
                raycaster.setFromCamera(mouse, threeCamera);
                const intersects = raycaster.intersectObjects(threeScene.children, true);
                
                let foundNodeId = null, foundElemId = null;
                for (const intersect of intersects) {
                    let obj = intersect.object;
                    while (obj && obj.userData.nodeId === undefined && obj.userData.elemId === undefined) obj = obj.parent;
                    if (obj && obj.userData.nodeId !== undefined && foundNodeId == null) foundNodeId = obj.userData.nodeId;
                    if (obj && obj.userData.elemId !== undefined && foundElemId == null) foundElemId = obj.userData.elemId;
                }
                
                // Check if command is active and NOT in select phase
                const cmdActiveNotSelect = typeof cmdState !== 'undefined' && 
                    cmdState.active !== CMD.NONE && 
                    cmdState.phase !== PHASE.SELECT;
                
                if (e.button === 0) {
                    // Left click
                    // Node drag start - only with Ctrl key
                    if (foundNodeId != null && !cmdActiveNotSelect && cmdState.active === CMD.NONE && e.ctrlKey) {
                        const node = model.nodes[foundNodeId];
                        if (node) {
                            saveState();
                            cmdState.active = CMD.NODE_MOVE;
                            cmdState.selectedNode = foundNodeId;
                            cmdState.basePoint = { x: node.x, y: node.y };
                            cmdState.dragNode = foundNodeId;
                            
                            // Store original positions for all selected nodes (multi-drag)
                            cmdState.dragNodesOriginal = {};
                            if (selectedNodes.has(foundNodeId)) {
                                selectedNodes.forEach(nodeId => {
                                    const n = model.nodes[nodeId];
                                    if (n) {
                                        cmdState.dragNodesOriginal[nodeId] = { x: n.x, y: n.y };
                                    }
                                });
                            }
                            
                            const multiInfo = selectedNodes.size > 1 ? ` (${selectedNodes.size} nodes)` : '';
                            showToast(`Node #${foundNodeId}: Drag to move${multiInfo}`);
                            updateCommandUI();
                            isDragging = true;
                            isBoxSelecting = false;
                            return;
                        }
                    }
                    
                    if (cmdActiveNotSelect) {
                        // Command active - don't start box selection
                        isDragging = false;
                        isBoxSelecting = false;
                    } else {
                        // Normal mode or SELECT phase - allow box selection
                        isDragging = true;
                        isBoxSelecting = false;
                        boxStartX = e.clientX;
                        boxStartY = e.clientY;
                    }
                } else if (e.button === 1) {
                    // Middle click (scroll wheel press) - pan
                    isPanning = true;
                    previousMousePosition = { x: e.clientX, y: e.clientY };
                    container.style.cursor = 'grabbing';
                    e.preventDefault();
                } else if (e.button === 2) {
                    // Right click - context menu or cancel command
                    if (cmdActiveNotSelect) {
                        if (typeof cancelCommand === 'function') cancelCommand();
                        e.preventDefault();
                    } else {
                        isRotating = true;
                    }
                }
            });
            
            container.addEventListener('mousemove', (e) => {
                const deltaX = e.clientX - previousMousePosition.x;
                const deltaY = e.clientY - previousMousePosition.y;
                
                // Check if mouse has moved significantly
                const totalMove = Math.abs(e.clientX - mouseDownPosition.x) + Math.abs(e.clientY - mouseDownPosition.y);
                if (totalMove > 5) {
                    hasMoved = true;
                }
                
                const modelPos = screenToModel3D(e.clientX, e.clientY, container);
                
                // Update status bar coordinates
                const statusCoords = document.getElementById('statusCoords');
                if (statusCoords && modelPos) {
                    let txt = `X: ${(modelPos.x * 1000).toFixed(0)} Y: ${(modelPos.y * 1000).toFixed(0)}`;
                    // XZ/YZ duzlemlerinde Z asil calisilan eksen; degeri sifir
                    // olsa bile gosterilmeli.
                    const aktif = (typeof aktifCalismaDuzlemi === 'function')
                        ? aktifCalismaDuzlemi() : { axis: 'Z' };
                    if (aktif.axis !== 'Z' || Math.abs(modelPos.z || 0) > 1e-6) {
                        txt += ` Z: ${((modelPos.z || 0) * 1000).toFixed(0)}`;
                    }
                    statusCoords.textContent = txt;
                }
                
                // Node dragging (single or multiple nodes)
                if (cmdState.dragNode && isDragging) {
                    const primaryNode = model.nodes[cmdState.dragNode];
                    if (primaryNode && cmdState.basePoint) {
                        let newX = modelPos.x, newY = modelPos.y;
                        
                        // Apply ortho
                        if (cmdState.orthoMode) {
                            const ddx = newX - cmdState.basePoint.x, ddy = newY - cmdState.basePoint.y;
                            if (Math.abs(ddx) > Math.abs(ddy)) newY = cmdState.basePoint.y;
                            else newX = cmdState.basePoint.x;
                        }
                        
                        // Apply snap (excluding dragged node)
                        const snap = findSnapPoint(newX, newY, 0.15);
                        if (snap) {
                            if (cmdState.orthoMode) {
                                if (Math.abs(newX - cmdState.basePoint.x) > Math.abs(newY - cmdState.basePoint.y)) newX = snap.x;
                                else newY = snap.y;
                            } else { newX = snap.x; newY = snap.y; }
                        }
                        
                        // Calculate delta
                        const deltaX = newX - cmdState.basePoint.x;
                        const deltaY = newY - cmdState.basePoint.y;
                        
                        // Move primary node
                        primaryNode.x = newX; 
                        primaryNode.y = newY;
                        
                        // Move all other selected nodes (multi-drag)
                        if (selectedNodes.size > 1 && selectedNodes.has(cmdState.dragNode)) {
                            selectedNodes.forEach(nodeId => {
                                if (nodeId !== cmdState.dragNode) {
                                    const otherNode = model.nodes[nodeId];
                                    if (otherNode && cmdState.dragNodesOriginal && cmdState.dragNodesOriginal[nodeId]) {
                                        otherNode.x = cmdState.dragNodesOriginal[nodeId].x + deltaX;
                                        otherNode.y = cmdState.dragNodesOriginal[nodeId].y + deltaY;
                                    }
                                }
                            });
                        }
                        
                        if (currentViewMode === '3d') update3DScene();
                        else draw();
                        
                        // Show tooltip with coordinates
                        const ox = deltaX * 1000, oy = deltaY * 1000;
                        const multiInfo = selectedNodes.size > 1 ? ` [${selectedNodes.size} nodes]` : '';
                        showTooltipAt(e.clientX, e.clientY, 
                            `<span class="distance">X:${(newX*1000).toFixed(0)} Y:${(newY*1000).toFixed(0)}<br>Δ ${ox.toFixed(0)},${oy.toFixed(0)}${cmdState.orthoMode?' [ORTHO]':''}${multiInfo}</span>`
                        );
                    }
                    previousMousePosition = { x: e.clientX, y: e.clientY };
                    return;
                }
                
                // Check if command is active
                const cmdActiveNotSelect = typeof cmdState !== 'undefined' && 
                    cmdState.active !== CMD.NONE && 
                    cmdState.phase !== PHASE.SELECT;
                
                // Always handle command mouse move for visual feedback
                if (typeof cmdState !== 'undefined' && cmdState.active !== CMD.NONE) {
                    if (typeof handleCommandMouseMove3D === 'function') {
                        handleCommandMouseMove3D(e, container);
                    }
                }
                
                // Node hover (when no command active)
                if (cmdState.active === CMD.NONE && !isRotating && !isPanning && !isDragging) {
                    const rect = container.getBoundingClientRect();
                    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
                    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
                    raycaster.setFromCamera(mouse, threeCamera);
                    const intersects = raycaster.intersectObjects(threeScene.children, true);
                    
                    let foundNodeId = null;
                    for (const intersect of intersects) {
                        let obj = intersect.object;
                        while (obj && obj.userData.nodeId === undefined) obj = obj.parent;
                        if (obj && obj.userData.nodeId !== undefined) { foundNodeId = obj.userData.nodeId; break; }
                    }
                    
                    // Tiklama ile ayni tolerans: imlec dugume yakinsa balon
                    // gorunsun ki ne secilecegi belli olsun.
                    if (foundNodeId == null) {
                        const y = ekrandaEnYakin(e.clientX, e.clientY, container);
                        if (y && y.nodeId !== undefined) foundNodeId = y.nodeId;
                    }

                    if (foundNodeId != null) {
                        const node = model.nodes[foundNodeId];
                        if (node) {
                            cmdState.hoverNode = { nodeId: foundNodeId, x: node.x, y: node.y };
                            showTooltipAt(e.clientX, e.clientY, 
                                `<span class="distance">Node #${foundNodeId}<br>X:${(node.x*1000).toFixed(0)} Y:${(node.y*1000).toFixed(0)}<br><span style="color:var(--text-3);font-size:9px">Ctrl+Drag to move</span></span>`
                            );
                        }
                    } else {
                        if (cmdState.hoverNode) {
                            cmdState.hoverNode = null;
                            hideTooltip();
                        }
                    }
                }
                
                if (isRotating && hasMoved) {
                    // Right mouse drag - Rotate
                    spherical.theta -= deltaX * 0.01;
                    spherical.phi -= deltaY * 0.01;
                    spherical.phi = Math.max(0.1, Math.min(Math.PI - 0.1, spherical.phi));
                    // ONCE gorunus 3B'ye isaretlenir, SONRA kamera guncellenir:
                    // ters sirada ilk kare hala ortografik kamerayla ciziliyor,
                    // donusun basinda bir kare zipliyordu.
                    markViewAsFree3D();
                    updateCameraPosition();
                } else if (isPanning) {
                    // Middle mouse drag - Pan
                    // Use camera vectors for correct movement in any view angle
                    const speed = spherical.radius * 0.003;
                    
                    // Get camera direction
                    const cameraDir = new THREE.Vector3();
                    threeCamera.getWorldDirection(cameraDir);
                    
                    // World up is Z
                    const worldUp = new THREE.Vector3(0, 0, 1);
                    
                    // Right vector = cross(cameraDir, worldUp)
                    const right = new THREE.Vector3().crossVectors(cameraDir, worldUp).normalize();
                    
                    // If right is zero (looking straight up/down), use fallback
                    if (right.length() < 0.01) {
                        right.set(1, 0, 0);
                    }
                    
                    // Screen up vector = cross(right, cameraDir)
                    const up = new THREE.Vector3().crossVectors(right, cameraDir).normalize();
                    
                    // Pan: mouse right moves view right (target moves opposite)
                    // mouse up moves view up (target moves opposite in screen space)
                    target.x -= right.x * deltaX * speed - up.x * deltaY * speed;
                    target.y -= right.y * deltaX * speed - up.y * deltaY * speed;
                    target.z -= right.z * deltaX * speed - up.z * deltaY * speed;
                    
                    updateCameraPosition();
                } else if (isDragging && hasMoved && !cmdActiveNotSelect && !cmdState.dragNode) {
                    // Left mouse drag - Box selection (only when no command active or in SELECT phase)
                    isBoxSelecting = true;
                    drawBoxSelection3D(container, boxStartX, boxStartY, e.clientX, e.clientY);
                }
                
                previousMousePosition = { x: e.clientX, y: e.clientY };
            });
            
            container.addEventListener('mouseup', (e) => {
                // Check if command is active
                const cmdActiveNotSelect = typeof cmdState !== 'undefined' && 
                    cmdState.active !== CMD.NONE && 
                    cmdState.phase !== PHASE.SELECT;
                
                if (e.button === 0) {
                    // Left click release
                    
                    // Node drag finish
                    if (cmdState.dragNode && hasMoved) {
                        const node = model.nodes[cmdState.dragNode];
                        if (node) showToast(`Node → X:${(node.x*1000).toFixed(0)} Y:${(node.y*1000).toFixed(0)}`);
                        cmdState.dragNode = null;
                        hideTooltip();
                        isDragging = false;
                        return;
                    }
                    else if (cmdState.active === CMD.NODE_MOVE && !hasMoved) {
                        // Node move canceled (clicked without moving)
                        cancelCommand();
                        isDragging = false;
                        return;
                    }
                    
                    if (cmdActiveNotSelect) {
                        // Handle command click
                        if (!hasMoved && typeof handleCommandClick3D === 'function') {
                            handleCommandClick3D(e, container);
                        }
                    } else if (isBoxSelecting && hasMoved) {
                        // Complete box selection - require minimum box size
                        const boxWidth = Math.abs(e.clientX - boxStartX);
                        const boxHeight = Math.abs(e.clientY - boxStartY);
                        
                        if (boxWidth > 10 || boxHeight > 10) {
                            // Valid box selection
                            finishBoxSelection3D(container, boxStartX, boxStartY, e.clientX, e.clientY, e.shiftKey);
                        }
                        clearBoxSelection3D();
                    } else if (!hasMoved) {
                        // Single click - selection
                        handle3DClick(e, container);
                    }
                    isDragging = false;
                    isBoxSelecting = false;
                } else if (e.button === 1) {
                    isPanning = false;
                    container.style.cursor = 'default';
                } else if (e.button === 2) {
                    // Right click - handled by contextmenu event
                    isRotating = false;
                }
                
                mouseButton = -1;
            });
            
            container.addEventListener('mouseleave', () => {
                isDragging = false;
                isPanning = false;
                isRotating = false;
                isBoxSelecting = false;
                container.style.cursor = 'default';
                clearBoxSelection3D();
            });
            
            // Prevent context menu on right click (we handle it ourselves)
            container.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                
                // Only show context menu if mouse didn't move (not rotating)
                if (hasMoved) {
                    // Was rotating, don't show menu
                    return;
                }
                
                hideAllContextMenus();
                
                // Raycast to find object under cursor
                const rect = container.getBoundingClientRect();
                mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
                mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
                
                raycaster.setFromCamera(mouse, threeCamera);
                const intersects = raycaster.intersectObjects(threeScene.children, true);
                
                const modelPos = screenToModel3D(e.clientX, e.clientY, container);
                
                let foundNode = null, foundElem = null;
                
                if (intersects.length > 0) {
                    for (const intersect of intersects) {
                        let obj = intersect.object;
                        while (obj && obj.userData.nodeId === undefined && obj.userData.elemId === undefined) {
                            obj = obj.parent;
                        }
                        
                        if (obj && obj.userData.nodeId !== undefined && foundNode == null) {
                            foundNode = obj.userData.nodeId;
                        }
                        if (obj && obj.userData.elemId !== undefined && foundElem == null) {
                            foundElem = obj.userData.elemId;
                        }
                    }
                }
                
                if (foundNode) {
                    // Node context menu
                    ctxTarget = { type: 'node', elemId: null, nodeId: foundNode, t: 0, x: modelPos.x, y: modelPos.y };
                    showContextMenuAt('contextMenuNode', e.clientX, e.clientY);
                } else if (foundElem) {
                    // Beam context menu
                    const beam = model.elements[foundElem];
                    let t = 0.5;
                    if (beam) {
                        const n1 = model.nodes[beam.n1], n2 = model.nodes[beam.n2];
                        if (n1 && n2) {
                            const dx = n2.x - n1.x, dy = n2.y - n1.y;
                            const len = Math.sqrt(dx*dx + dy*dy);
                            if (len > 0.001) {
                                t = ((modelPos.x - n1.x) * dx + (modelPos.y - n1.y) * dy) / (len * len);
                                t = Math.max(0.05, Math.min(0.95, t));
                            }
                        }
                    }
                    ctxTarget = { type: 'beam', elemId: foundElem, nodeId: null, t: t, x: modelPos.x, y: modelPos.y };
                    cmdState.hoverBeam = foundElem;
                    cmdState.hoverPoint = { ratio: t, pointX: modelPos.x, pointY: modelPos.y };
                    showContextMenuAt('contextMenu', e.clientX, e.clientY);
                } else {
                    // Empty area context menu
                    ctxTarget = { type: null, elemId: null, nodeId: null, t: 0, x: modelPos.x, y: modelPos.y };
                    showContextMenuAt('contextMenuEmpty', e.clientX, e.clientY);
                }
            });
            
            container.addEventListener('wheel', (e) => {
                e.preventDefault();
                spherical.radius *= e.deltaY > 0 ? 1.1 : 0.9;
                spherical.radius = Math.max(1, Math.min(100, spherical.radius));
                updateCameraPosition();
            });
            
            // Prevent middle button auto-scroll
            container.addEventListener('auxclick', (e) => {
                if (e.button === 1) {
                    e.preventDefault();
                }
            });
            
            // Double click to reset view
            container.addEventListener('dblclick', () => {
                // Nesne YENIDEN ATANMAZ, icerigi degisir: threeControls.spherical
                // ve window.spherical ayni nesneyi tutuyor. Yeniden atandiginda
                // onlar eski nesnede kaliyor, gorunus animasyonu da yanlis
                // baslangic acisindan basliyordu.
                Object.assign(spherical, { theta: Math.PI / 4, phi: Math.PI / 4, radius: 8 });
                target.set(0, 0, 0);
                fit3DView();
            });
            
            // 3D Click handler for selection
            function handle3DClick(e, container) {
                const rect = container.getBoundingClientRect();
                mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
                mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
                
                raycaster.setFromCamera(mouse, threeCamera);
                
                // Get all intersectable objects
                const intersects = raycaster.intersectObjects(threeScene.children, true);
                
                if (intersects.length > 0) {
                    // Collect all nodes and elements at click point
                    let foundNodes = [];
                    let foundElements = [];
                    
                    for (const intersect of intersects) {
                        let obj = intersect.object;
                        
                        // Walk up to find parent with userData
                        while (obj && obj.userData.nodeId === undefined && obj.userData.elemId === undefined) {
                            obj = obj.parent;
                        }
                        
                        if (obj && obj.userData.nodeId !== undefined && !foundNodes.includes(obj.userData.nodeId)) {
                            foundNodes.push(obj.userData.nodeId);
                        }
                        if (obj && obj.userData.elemId !== undefined && !foundElements.includes(obj.userData.elemId)) {
                            foundElements.push(obj.userData.elemId);
                        }
                    }
                    
                    // Apply selection mode filter
                    if (selectionMode === 'nodes') {
                        foundElements = [];
                    } else if (selectionMode === 'beams') {
                        foundNodes = [];
                    } else if (selectionMode === 'all' && foundElements.length > 0 && foundNodes.length > 0) {
                        // If both present and mode is 'all', prefer beam (less confusing)
                        foundNodes = [];
                    }
                    
                    // Select first found item
                    if (foundNodes.length > 0) {
                        const nodeId = foundNodes[0];
                        const node = model.nodes[nodeId];
                        if (node) {
                            if (e.ctrlKey) {
                                // Multi-select
                                if (selectedNodes.has(nodeId)) {
                                    selectedNodes.delete(nodeId);
                                } else {
                                    selectedNodes.add(nodeId);
                                }
                            } else {
                                // Single select
                                selectedNodes.clear();
                                selectedElements.clear();
                                selectedNodes.add(nodeId);
                            }
                            selectedNode = node;
                            selectedElement = null;
                            showNodeDetails(node);
                            updateEntityInfoPanel();
                            updateStatusBar();
                            secimVurgusunuTazele();
                        }
                        return;
                    }
                    
                    if (foundElements.length > 0) {
                        const elemId = foundElements[0];
                        const elem = model.elements[elemId];
                        if (elem) {
                            if (e.ctrlKey) {
                                // Multi-select
                                if (selectedElements.has(elemId)) {
                                    selectedElements.delete(elemId);
                                } else {
                                    selectedElements.add(elemId);
                                }
                            } else {
                                // Single select
                                selectedNodes.clear();
                                selectedElements.clear();
                                selectedElements.add(elemId);
                            }
                            selectedElement = { ...elem, id: elemId };
                            selectedNode = null;
                            showElementDetails(selectedElement);
                            updateEntityInfoPanel();
                            updateStatusBar();
                            secimVurgusunuTazele();
                        }
                        return;
                    }
                }
                
                // Isin hicbir seye carpmadi. Kirisler ince oldugu icin bir
                // iki piksel sapinca secim kaciyordu; once yakindakine bak.
                const yakin = ekrandaEnYakin(e.clientX, e.clientY, container);
                if (yakin) {
                    const dugumMu = yakin.nodeId !== undefined;
                    const id = dugumMu ? yakin.nodeId : yakin.elemId;
                    const kipUygun = selectionMode === 'all' ||
                        (dugumMu ? selectionMode === 'nodes' : selectionMode === 'beams');

                    if (kipUygun) {
                        if (!e.ctrlKey) { selectedNodes.clear(); selectedElements.clear(); }
                        if (dugumMu) {
                            selectedNodes.add(id);
                            selectedNode = { ...model.nodes[id], id };
                            selectedElement = null;
                            if (typeof showNodeDetails === 'function') showNodeDetails(selectedNode);
                        } else {
                            selectedElements.add(id);
                            selectedElement = { ...model.elements[id], id };
                            selectedNode = null;
                            if (typeof showElementDetails === 'function') showElementDetails(selectedElement);
                        }
                        updateEntityInfoPanel();
                        updateStatusBar();
                        secimVurgusunuTazele();
                        return;
                    }
                }

                // Model uzerinde bir sey yok ama bir calisma duzleminin
                // yuzeyi varsa: o duzlemi etkinlestir. Duzlem kocaman bir
                // yuzey oldugu icin bu kontrol EN SONA birakilir - yoksa
                // arkasindaki kirisi secmek imkansiz olurdu.
                for (const carpma of intersects) {
                    let o = carpma.object;
                    while (o && o.userData.planeId === undefined) o = o.parent;
                    if (o && o.userData.planeId !== undefined) {
                        if (!e.ctrlKey) {
                            selectedNodes.clear();
                            selectedElements.clear();
                            selectedNode = null;
                            selectedElement = null;
                            updateStatusBar();
                            secimVurgusunuTazele();
                        }
                        if (typeof duzlemeTiklandi === 'function') duzlemeTiklandi(o.userData.planeId);
                        return;
                    }
                }

                // Clicked on nothing - clear selection (unless Ctrl held)
                if (!e.ctrlKey) {
                    selectedNodes.clear();
                    selectedElements.clear();
                    selectedNode = null;
                    selectedElement = null;
                    setStyle('elementDetails', 'display', 'none');
                    updateStatusBar();
                    secimVurgusunuTazele();
                }
            }
            
            // Box selection helpers for 3D view
            let boxSelectionDiv = null;
            
            function drawBoxSelection3D(container, x1, y1, x2, y2) {
                // Determine mode based on drag direction
                const isWindowMode = x1 < x2;
                
                if (!boxSelectionDiv) {
                    boxSelectionDiv = document.createElement('div');
                    boxSelectionDiv.style.cssText = `
                        position: fixed;
                        pointer-events: none;
                        z-index: 1000;
                    `;
                    document.body.appendChild(boxSelectionDiv);
                }
                
                // Window mode = solid blue, Crossing mode = dashed green
                if (isWindowMode) {
                    boxSelectionDiv.style.border = '2px solid #3b82f6';
                    boxSelectionDiv.style.background = 'rgba(59, 130, 246, 0.15)';
                } else {
                    boxSelectionDiv.style.border = '2px dashed #22c55e';
                    boxSelectionDiv.style.background = 'rgba(34, 197, 94, 0.15)';
                }
                
                const left = Math.min(x1, x2);
                const top = Math.min(y1, y2);
                const width = Math.abs(x2 - x1);
                const height = Math.abs(y2 - y1);
                
                boxSelectionDiv.style.left = left + 'px';
                boxSelectionDiv.style.top = top + 'px';
                boxSelectionDiv.style.width = width + 'px';
                boxSelectionDiv.style.height = height + 'px';
                boxSelectionDiv.style.display = 'block';
            }
            
            function clearBoxSelection3D() {
                if (boxSelectionDiv) {
                    boxSelectionDiv.style.display = 'none';
                }
            }
            
            function finishBoxSelection3D(container, x1, y1, x2, y2, addToSelection) {
                const rect = container.getBoundingClientRect();
                
                // Determine selection mode based on drag direction
                // Left to right = Window (only fully enclosed)
                // Right to left = Crossing (any intersection)
                const isWindowMode = x1 < x2;
                
                // Convert screen coords to box bounds
                const left = Math.min(x1, x2) - rect.left;
                const right = Math.max(x1, x2) - rect.left;
                const top = Math.min(y1, y2) - rect.top;
                const bottom = Math.max(y1, y2) - rect.top;
                
                if (!addToSelection) {
                    selectedNodes.clear();
                    selectedElements.clear();
                }
                
                // Helper function to check if point is in box
                function isPointInBox(screenPos) {
                    return screenPos.x >= left && screenPos.x <= right &&
                           screenPos.y >= top && screenPos.y <= bottom;
                }
                
                // Helper function to check if line segment intersects box (crosses edges)
                function lineCrossesBox(p1, p2) {
                    const boxEdges = [
                        { x1: left, y1: top, x2: right, y2: top },      // top
                        { x1: right, y1: top, x2: right, y2: bottom },  // right
                        { x1: left, y1: bottom, x2: right, y2: bottom }, // bottom
                        { x1: left, y1: top, x2: left, y2: bottom }     // left
                    ];
                    
                    for (const edge of boxEdges) {
                        if (linesIntersect(p1.x, p1.y, p2.x, p2.y, edge.x1, edge.y1, edge.x2, edge.y2)) {
                            return true;
                        }
                    }
                    return false;
                }
                
                // Line segment intersection check
                function linesIntersect(x1, y1, x2, y2, x3, y3, x4, y4) {
                    const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
                    if (Math.abs(denom) < 0.0001) return false;
                    
                    const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
                    const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;
                    
                    return t >= 0 && t <= 1 && u >= 0 && u <= 1;
                }
                
                // Check each node
                Object.entries(model.nodes).forEach(([id, node]) => {
                    const nodeId = parseInt(id);
                    const screenPos = worldToScreen3D(node.x, node.y, (node.z || 0), container);
                    
                    if (isPointInBox(screenPos)) {
                        selectedNodes.add(nodeId);
                    }
                });
                
                // Check each element
                Object.entries(model.elements).forEach(([id, elem]) => {
                    const elemId = parseInt(id);
                    const n1 = model.nodes[elem.n1];
                    const n2 = model.nodes[elem.n2];
                    if (!n1 || !n2) return;
                    
                    const screenP1 = worldToScreen3D(n1.x, n1.y, (n1.z || 0), container);
                    const screenP2 = worldToScreen3D(n2.x, n2.y, (n2.z || 0), container);
                    
                    if (isWindowMode) {
                        // Window mode: BOTH endpoints must be inside box
                        if (isPointInBox(screenP1) && isPointInBox(screenP2)) {
                            selectedElements.add(elemId);
                        }
                    } else {
                        // Crossing mode: ANY part touches box (endpoint in box OR line crosses box)
                        if (isPointInBox(screenP1) || isPointInBox(screenP2) || lineCrossesBox(screenP1, screenP2)) {
                            selectedElements.add(elemId);
                        }
                    }
                });
                
                updateEntityInfoPanel();
                secimVurgusunuTazele();
                
                const count = selectedNodes.size + selectedElements.size;
                const modeText = isWindowMode ? 'Window' : 'Crossing';
                if (count > 0) {
                    showToast(`${modeText}: ${selectedNodes.size} nodes, ${selectedElements.size} beams`, 'info');
                }
            }
            
            // Secim degisince SAHNEYI YENIDEN KURMAK gerekmez: degisen tek sey
        // renk ve dugum boyu. update3DScene() 497 nesneyi bastan yaratiyor ve
        // bu makinede 118 ms suruyor - kutuyla secip fareyi biraktiginizda
        // hissedilen takilma buydu, ayrica her tek tiklamada da oluyordu.
        // Burada malzeme ve olcek yerinde degistirilir.

        // Isin tam ustune gelmeyi sart kosuyordu: kirisler ince oldugu icin
        // bir iki piksel sapinca secim olmuyordu. Isin bos donerse ekranda
        // tiklanan noktaya en yakin ogeye bakilir.
        const SECIM_TOLERANSI = 10;   // piksel

        function ekrandaEnYakin(tiklamaX, tiklamaY, container, tolerans = SECIM_TOLERANSI) {
            if (!threeCamera || !model) return null;

            const r = container.getBoundingClientRect();
            const px = tiklamaX - r.left, py = tiklamaY - r.top;

            // Dunya noktasini ekrana tasir. Kamera arkasinda kalan noktalar
            // izdusumde one katlanir; onlari elemek gerekir.
            const v = new THREE.Vector3();
            const ekrana = (x, y, z) => {
                v.set(x, y, z).project(threeCamera);
                if (v.z > 1) return null;              // kamera arkasi
                return { x: (v.x * 0.5 + 0.5) * r.width, y: (-v.y * 0.5 + 0.5) * r.height };
            };

            // Nokta - dogru parcasi uzakligi (ekran duzleminde).
            const parcayaUzaklik = (p, a, b) => {
                const dx = b.x - a.x, dy = b.y - a.y;
                const uz2 = dx * dx + dy * dy;
                if (uz2 < 1e-6) return Math.hypot(p.x - a.x, p.y - a.y);
                let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / uz2;
                t = Math.max(0, Math.min(1, t));
                return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
            };

            const tiklama = { x: px, y: py };
            let enIyiDugum = null, dugumUzak = Infinity;
            let enIyiKiris = null, kirisUzak = Infinity;

            if (view.showNodes !== false) {
                Object.entries(model.nodes).forEach(([id, n]) => {
                    const e = ekrana(n.x, n.y, n.z || 0);
                    if (!e) return;
                    const u = Math.hypot(px - e.x, py - e.y);
                    if (u < dugumUzak) { dugumUzak = u; enIyiDugum = parseInt(id, 10); }
                });
            }

            if (view.showBeams !== false) {
                Object.entries(model.elements).forEach(([id, el]) => {
                    const n1 = model.nodes[el.n1], n2 = model.nodes[el.n2];
                    if (!n1 || !n2) return;
                    const a = ekrana(n1.x, n1.y, n1.z || 0);
                    const b = ekrana(n2.x, n2.y, n2.z || 0);
                    if (!a || !b) return;
                    const u = parcayaUzaklik(tiklama, a, b);
                    if (u < kirisUzak) { kirisUzak = u; enIyiKiris = parseInt(id, 10); }
                });
            }

            // Dugum daha kucuk bir hedef; esit yakinlikta o kazanir.
            if (enIyiDugum !== null && dugumUzak <= tolerans && dugumUzak <= kirisUzak + 4)
                return { nodeId: enIyiDugum, uzaklik: dugumUzak };
            if (enIyiKiris !== null && kirisUzak <= tolerans)
                return { elemId: enIyiKiris, uzaklik: kirisUzak };
            return null;
        }

        function worldToScreen3D(x, y, z, container) {
                const vector = new THREE.Vector3(x, y, z);
                vector.project(threeCamera);
                
                const rect = container.getBoundingClientRect();
                return {
                    x: (vector.x * 0.5 + 0.5) * rect.width,
                    y: (-vector.y * 0.5 + 0.5) * rect.height
                };
            }
            
            function show3DContextMenu(e, container) {
                // Use existing context menu
                const contextMenu = document.getElementById('contextMenu');
                if (!contextMenu) return;
                
                // First do a raycast to see if we right-clicked on something
                const rect = container.getBoundingClientRect();
                mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
                mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
                
                raycaster.setFromCamera(mouse, threeCamera);
                const intersects = raycaster.intersectObjects(threeScene.children, true);
                
                // Find first model object
                let clickedNode = null;
                let clickedElement = null;
                
                for (const hit of intersects) {
                    let obj = hit.object;
                    while (obj && obj.userData.nodeId === undefined && obj.userData.elemId === undefined) {
                        obj = obj.parent;
                    }
                    if (obj && obj.userData.nodeId !== undefined) {
                        clickedNode = obj.userData.nodeId;
                        break;
                    }
                    if (obj && obj.userData.elemId !== undefined) {
                        clickedElement = obj.userData.elemId;
                        break;
                    }
                }
                
                // If clicked on unselected item, select it
                if (clickedNode && !selectedNodes.has(clickedNode)) {
                    selectedNodes.clear();
                    selectedElements.clear();
                    selectedNodes.add(clickedNode);
                    secimVurgusunuTazele();
                } else if (clickedElement && !selectedElements.has(clickedElement)) {
                    selectedNodes.clear();
                    selectedElements.clear();
                    selectedElements.add(clickedElement);
                    secimVurgusunuTazele();
                }
                
                // Position and show context menu
                contextMenu.style.left = e.clientX + 'px';
                contextMenu.style.top = e.clientY + 'px';
                contextMenu.style.display = 'block';
                
                // Update context menu content based on selection
                updateContextMenuContent();
            }
            
            function updateContextMenuContent() {
                const contextMenu = document.getElementById('contextMenu');
                if (!contextMenu) return;
                
                const hasNodeSelection = selectedNodes.size > 0;
                const hasElementSelection = selectedElements.size > 0;
                const hasSelection = hasNodeSelection || hasElementSelection;
                
                // Simple context menu - can be expanded later
                contextMenu.innerHTML = `
                    <div class="context-menu-item" onclick="deleteSelection(); hideContextMenu();" ${!hasSelection ? 'style="opacity:0.5;pointer-events:none;"' : ''}>
                        <span class="icon"><svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg></span> Delete Selected
                    </div>
                    <div class="context-menu-item" onclick="duplicateSelection(); hideContextMenu();" ${!hasSelection ? 'style="opacity:0.5;pointer-events:none;"' : ''}>
                        <span class="icon"><svg viewBox="0 0 24 24"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg></span> Duplicate
                    </div>
                    <div class="context-menu-divider"></div>
                    <div class="context-menu-item" onclick="selectAllNodes(); hideContextMenu();">
                        ⬡ Select All Nodes
                    </div>
                    <div class="context-menu-item" onclick="selectAllElements(); hideContextMenu();">
                        <span class="icon"><svg viewBox="0 0 24 24"><path d="M16 3H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z"/><line x1="6" y1="7" x2="10" y2="7"/><line x1="6" y1="12" x2="8" y2="12"/><line x1="6" y1="17" x2="10" y2="17"/></svg></span> Select All Elements
                    </div>
                    <div class="context-menu-divider"></div>
                    <div class="context-menu-item" onclick="clearSelection(); hideContextMenu();">
                        <span class="icon"><svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></span>️ Clear Selection
                    </div>
                `;
            }
            
            function hideContextMenu() {
                const contextMenu = document.getElementById('contextMenu');
                if (contextMenu) contextMenu.style.display = 'none';
            }
            
            // Click anywhere else to hide context menu
            document.addEventListener('click', (e) => {
                const contextMenu = document.getElementById('contextMenu');
                if (contextMenu && !contextMenu.contains(e.target)) {
                    contextMenu.style.display = 'none';
                }
            });
            
            updateCameraPosition();
            
            threeControls = {
                target: target,  // Expose target for camera animation
                spherical: spherical,  // Expose spherical for state access
                update: updateCameraPosition,
                reset: () => {
                    Object.assign(spherical, { theta: Math.PI / 4, phi: Math.PI / 4, radius: 8 });
                    target.set(0, 0, 0);
                    updateCameraPosition();
                },
                setTarget: (x, y, z) => {
                    target.set(x, y, z);
                    updateCameraPosition();
                },
                setRadius: (r) => {
                    spherical.radius = r;
                    updateCameraPosition();
                },
                setAngles: (theta, phi) => {
                    spherical.theta = theta;
                    spherical.phi = phi;
                    updateCameraPosition();
                }
            };
        }
        
        function secimVurgusunuTazele() {
            if (typeof threeScene === 'undefined' || !threeScene) return;

            // Sahne henuz bir kez kurulmadiysa malzemeler yok; tam kurulum.
            if (!vurguMalzeme) { update3DScene(); return; }
            const M = vurguMalzeme;

            // Bir tasiyicinin (dugum mesh'i ya da kiris grubu) butun
            // malzemeli parcalarini boyar. Secim kalkinca her parca kendi
            // temelMalzeme'sine doner - kirisin govdesi, plakasi ve bulbu
            // ayri malzemeler kullandigi icin hepsine tek renk basilamaz.
            const boya = (kok, secili, secimMalzemesi) => {
                kok.traverse(o => {
                    if (!o.material) return;
                    if (!secili) {
                        if (o.userData.temelMalzeme) o.material = o.userData.temelMalzeme;
                        return;
                    }
                    o.material = (o.userData.vurguRolu === 'plaka' && M.plateSelectedMaterial)
                        ? M.plateSelectedMaterial : secimMalzemesi;
                });
            };

            threeScene.traverse(o => {
                if (o.userData.nodeId !== undefined) {
                    const id = o.userData.nodeId;
                    const secili = selectedNodes.has(id);
                    boya(o, secili, M.nodeSelectedMaterial);
                    o.scale.setScalar(secili ? 1.5 : (model.constraints[id] ? 1.3 : 1));
                    // Calisma duzlemi hayaleti malzemeyi klonluyor; malzemeyi
                    // degistirince yeniden uygulanmali, yoksa sonuk kalmasi
                    // gereken oge birden parlak oluyor.
                    const n = model.nodes[id];
                    if (n) applyWorkPlaneGhost(o, n, n);

                } else if (o.userData.elemId !== undefined) {
                    const id = o.userData.elemId;
                    const elem = model.elements[id];
                    if (!elem) return;
                    boya(o, selectedElements.has(id), M.beamSelectedMaterial);
                    const n1 = model.nodes[elem.n1], n2 = model.nodes[elem.n2];
                    if (n1 && n2) applyWorkPlaneGhost(o, n1, n2);
                }
            });
        }

        function update3DScene() {
            if (!threeInitialized) return;
            
            // Clear existing model objects with proper disposal
            const toRemove = [];
            threeScene.traverse((obj) => {
                if (obj.userData.isModelObject) toRemove.push(obj);
            });
            toRemove.forEach(obj => {
                disposeThreeObject(obj);
                threeScene.remove(obj);
            });
            
            // Update axes scale based on model size
            const nodes = Object.values(model.nodes);
            let modelSize = 10;  // Default size
            let centerX = 0, centerY = 0;
            
            if (nodes.length > 0) {
                const xs = nodes.map(n => n.x);
                const ys = nodes.map(n => n.y);
                const minX = Math.min(...xs);
                const maxX = Math.max(...xs);
                const minY = Math.min(...ys);
                const maxY = Math.max(...ys);
                const rangeX = maxX - minX;
                const rangeY = maxY - minY;
                modelSize = Math.max(rangeX, rangeY, 2);
                centerX = (minX + maxX) / 2;
                centerY = (minY + maxY) / 2;
            }
            
            // Izgarayi duzleme oturtma isi TEK yerde: izgarayiDuzlemeGore().
            // Burada ikinci bir kopya vardi ve yalnizca calisma duzlemine
            // bakiyordu; gorunus XZ/YZ iken donmeyi sifirlayip izgarayi XY'ye
            // geri ceviriyordu - komut baslatmak bile yetiyordu.
            if (window.gridHelper) {
                window.gridHelper.visible = (view.showGrid !== false);
                izgarayiDuzlemeGore();
            }
            
            // Axes now live in the corner gizmo scene → fixed size (no model scaling)
            if (window.axesGroup) {
                window.axesGroup.scale.set(1, 1, 1);
                // Z axis is always visible (consistent across views)
                window.axesGroup.children.forEach(child => {
                    if (child.userData && child.userData.isZAxis) {
                        child.visible = true;
                    }
                });
            }
            
            // Display size multiplier (controlled by toggle button)
            const displaySize = window.displaySizeMultiplier || 0.5;
            
            // Individual display sizes
            const beamDisplaySize = (window.displaySizes?.beam || 1.0) * displaySize;
            const nodeDisplaySize = (window.displaySizes?.node || 1.0) * displaySize;
            const loadDisplaySize = (window.displaySizes?.load || 1.0) * displaySize;
            const bcDisplaySize = (window.displaySizes?.bc || 1.0) * displaySize;
            
            // Toggle grid visibility
            threeScene.traverse((obj) => {
                if (obj.isGridHelper) {
                    obj.visible = view.showGrid;
                }
            });
            
            // Premium Materials - Section type colors (use theme color as base)
            const beamColorHex = window.colorTheme?.beam || '#60a5fa';
            // Convert hex string to integer for THREE.Color
            const beamColorInt = temaRenginiInt(beamColorHex, '#60a5fa');
            const beamThemeColor = new THREE.Color(beamColorInt);
            const sectionMaterials = {
                'HP': new THREE.MeshStandardMaterial({ 
                    color: beamThemeColor.clone(),
                    emissive: beamThemeColor.clone().multiplyScalar(0.4),
                    emissiveIntensity: 0.15,
                    metalness: 0.3, 
                    roughness: 0.6,
                    side: THREE.DoubleSide 
                }),
                'FB': new THREE.MeshStandardMaterial({ 
                    color: beamThemeColor.clone(),
                    emissive: beamThemeColor.clone().multiplyScalar(0.4),
                    emissiveIntensity: 0.15,
                    metalness: 0.3, 
                    roughness: 0.6,
                    side: THREE.DoubleSide 
                }),
                'T': new THREE.MeshStandardMaterial({ 
                    color: beamThemeColor.clone(),
                    emissive: beamThemeColor.clone().multiplyScalar(0.4),
                    emissiveIntensity: 0.15,
                    metalness: 0.3, 
                    roughness: 0.6,
                    side: THREE.DoubleSide 
                }),
                'L': new THREE.MeshStandardMaterial({ 
                    color: beamThemeColor.clone(),
                    emissive: beamThemeColor.clone().multiplyScalar(0.4),
                    emissiveIntensity: 0.15,
                    metalness: 0.3, 
                    roughness: 0.6,
                    side: THREE.DoubleSide 
                }),
                'default': new THREE.MeshStandardMaterial({ 
                    color: beamThemeColor.clone(),
                    emissive: beamThemeColor.clone().multiplyScalar(0.3),
                    emissiveIntensity: 0.1,
                    metalness: 0.3, 
                    roughness: 0.6,
                    side: THREE.DoubleSide 
                })
            };
            
            // Selected material with strong emissive glow - use theme color
            const selectionColorHex = window.colorTheme?.selection || '#fef08a';
            const selectionColorInt = temaRenginiInt(selectionColorHex, '#fef08a');
            const selectionThemeColor = new THREE.Color(selectionColorInt);
            const beamSelectedMaterial = new THREE.MeshStandardMaterial({ 
                color: selectionThemeColor,
                emissive: selectionThemeColor.clone().multiplyScalar(0.6),
                emissiveIntensity: 0.5,
                metalness: 0.4, 
                roughness: 0.4,
                side: THREE.DoubleSide 
            });
            
            const beamDeformedMaterial = new THREE.MeshStandardMaterial({ 
                color: 0x4ade80,  // Brighter green
                emissive: 0x22c55e,
                emissiveIntensity: 0.2,
                metalness: 0.3, 
                roughness: 0.6,
                side: THREE.DoubleSide 
            });
            
            const plateMaterial = new THREE.MeshStandardMaterial({ 
                color: 0xcbd5e1,  // Lighter gray
                emissive: 0x94a3b8,
                emissiveIntensity: 0.1,
                metalness: 0.2, 
                roughness: 0.7,
                side: THREE.DoubleSide 
            });
            
            const plateSelectedMaterial = new THREE.MeshStandardMaterial({ 
                color: selectionThemeColor, 
                emissive: selectionThemeColor.clone().multiplyScalar(0.5),
                emissiveIntensity: 0.3,
                metalness: 0.3, 
                roughness: 0.5,
                side: THREE.DoubleSide 
            });
            
            // Node materials - use color from theme
            const nodeColorHex = window.colorTheme?.node || '#22d3ee';
            const nodeColorInt = temaRenginiInt(nodeColorHex, '#22d3ee');
            const nodeThemeColor = new THREE.Color(nodeColorInt);
            const nodeMaterial = new THREE.MeshStandardMaterial({ 
                color: nodeThemeColor,
                emissive: nodeThemeColor.clone().multiplyScalar(0.3),
                emissiveIntensity: 0.3,
                metalness: 0.5, 
                roughness: 0.3
            });
            
            const nodeSelectedMaterial = new THREE.MeshStandardMaterial({ 
                color: selectionThemeColor,
                emissive: selectionThemeColor.clone().multiplyScalar(0.6),
                emissiveIntensity: 0.6,
                metalness: 0.6, 
                roughness: 0.2
            });
            
            // Support materials - bright green for stability
            const supportMaterial = new THREE.MeshStandardMaterial({ 
                color: 0x00ff88, 
                emissive: 0x00ff44,
                emissiveIntensity: 0.3,
                metalness: 0.4, 
                roughness: 0.5
            });
            
            const supportBaseMaterial = new THREE.MeshStandardMaterial({ 
                color: 0x00cc66, 
                metalness: 0.3, 
                roughness: 0.6
            });
            
            // Load materials - bright red with glow
            const loadMaterial = new THREE.MeshStandardMaterial({ 
                color: 0xff4444, 
                emissive: 0xff2222,
                emissiveIntensity: 0.4,
                metalness: 0.3, 
                roughness: 0.5
            });
            
            // Legacy materials for compatibility
            const beamMaterial = sectionMaterials['default'];
            const webMaterial = sectionMaterials['HP'];
            const flangeMaterial = new THREE.MeshStandardMaterial({ color: beamThemeColor.clone(), emissive: beamThemeColor.clone().multiplyScalar(0.3), emissiveIntensity: 0.1, metalness: 0.3, roughness: 0.6, side: THREE.DoubleSide });
            const axisMaterialX = new THREE.MeshBasicMaterial({ color: 0xff0000 });
            const axisMaterialY = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
            const axisMaterialZ = new THREE.MeshBasicMaterial({ color: 0x0000ff });
            
            // Helper to get material by section type
            function getMaterialForSection(sectionName, isSelected, isDeformed, elemId = null) {
                if (isSelected) return beamSelectedMaterial;
                
                // Check for stress visualization - show when in Results tab OR when stress toggle is on
                const shouldShowStress = (showResultsVisualization || view.showStress) && results && results.elementResults;
                
                if (isDeformed && !shouldShowStress) return beamDeformedMaterial;
                
                // Check for stress visualization
                if (shouldShowStress && elemId !== null) {
                    const elemResult = results.elementResults[elemId];
                    if (elemResult) {
                        const stress = elemResult.vonMises || 0;
                        const sigmaLimit = parseFloat(document.getElementById('sigmaLimit')?.value) || 355;
                        const color = getStressColorHex(stress, sigmaLimit);
                        return new THREE.MeshStandardMaterial({ 
                            color: color, 
                            metalness: 0.4, 
                            roughness: 0.5,
                            side: THREE.DoubleSide 
                        });
                    }
                }
                
                const sectionType = sectionName ? sectionName.match(/^(HP|FB|T|L)/)?.[1] || 'default' : 'default';
                return sectionMaterials[sectionType] || sectionMaterials['default'];
            }

            // Secim vurgusu bu malzemelerle sahneyi yeniden kurmadan
            // guncellenir (bkz. secimVurgusunuTazele).
            vurguMalzeme = {
                nodeMaterial, nodeSelectedMaterial,
                beamSelectedMaterial, plateMaterial, plateSelectedMaterial
            };

            // Her parca kendi "normal" malzemesini saklar; secim kalkinca
            // buna geri donulur. Kirisin govdesi, plakasi ve bulbu farkli
            // malzemeler kullaniyor - hepsine tek renk basmak yanlis olurdu.
            function vurguIcinEtiketle(kok) {
                kok.traverse(o => {
                    if (!o.material) return;
                    o.userData.temelMalzeme = o.material;
                    if (o.material === plateMaterial) o.userData.vurguRolu = 'plaka';
                });
            }
            
            function getStressColorHex(stress, maxStress) {
                if (!maxStress || maxStress === 0) return 0x22c55e;
                
                const ratio = Math.min(stress / maxStress, 1);
                
                // Color stops: Green -> Lime -> Yellow -> Orange -> Red
                let r, g, b;
                
                if (ratio < 0.25) {
                    const t = ratio / 0.25;
                    r = Math.round(34 + (132 - 34) * t);
                    g = Math.round(197 + (204 - 197) * t);
                    b = Math.round(94 + (22 - 94) * t);
                } else if (ratio < 0.5) {
                    const t = (ratio - 0.25) / 0.25;
                    r = Math.round(132 + (234 - 132) * t);
                    g = Math.round(204 + (179 - 204) * t);
                    b = Math.round(22 + (8 - 22) * t);
                } else if (ratio < 0.75) {
                    const t = (ratio - 0.5) / 0.25;
                    r = Math.round(234 + (249 - 234) * t);
                    g = Math.round(179 + (115 - 179) * t);
                    b = Math.round(8 + (22 - 8) * t);
                } else {
                    const t = (ratio - 0.75) / 0.25;
                    r = Math.round(249 + (239 - 249) * t);
                    g = Math.round(115 + (68 - 115) * t);
                    b = Math.round(22 + (68 - 22) * t);
                }
                
                return (r << 16) + (g << 8) + b;
            }
            
            // Get deformation scale
            const deformScale = view.showDeformed && results ? view.deformationScale : 0;
            
            // Helper to parse section dimensions
            function getSectionDimensions(sectionName) {
                // Check for composite section: PROFILE_PLATEWxPLATET
                let plateW = 0, plateT = 0;
                let profilePart = sectionName;
                
                if (sectionName.includes('_')) {
                    const parts = sectionName.split('_');
                    profilePart = parts[0];
                    const plateMatch = parts[1].match(/(\d+)[Xx](\d+)/);
                    if (plateMatch) {
                        plateW = parseInt(plateMatch[1]) / 1000;  // m
                        plateT = parseInt(plateMatch[2]) / 1000;  // m
                    }
                }
                
                // FB: height x thickness (stands vertical)
                const fbMatch = profilePart.match(/FB(\d+)[Xx](\d+)/);
                if (fbMatch) {
                    return {
                        type: 'FB',
                        h: parseInt(fbMatch[1]) / 1000,  // web height (m)
                        t: parseInt(fbMatch[2]) / 1000,  // web thickness (m)
                        plateW: plateW,
                        plateT: plateT
                    };
                }
                
                // HP: height x thickness
                const hpMatch = profilePart.match(/HP(\d+)[Xx](\d+)/);
                if (hpMatch) {
                    return {
                        type: 'HP',
                        h: parseInt(hpMatch[1]) / 1000,
                        t: parseInt(hpMatch[2]) / 1000,
                        bf: parseInt(hpMatch[1]) / 1000 * 0.4,
                        plateW: plateW,
                        plateT: plateT
                    };
                }
                
                // T-section: T400x12+150x20
                const tMatch = profilePart.match(/T(\d+)[Xx](\d+)\+(\d+)[Xx](\d+)/);
                if (tMatch) {
                    return {
                        type: 'T',
                        hw: parseInt(tMatch[1]) / 1000,
                        tw: parseInt(tMatch[2]) / 1000,
                        bf: parseInt(tMatch[3]) / 1000,
                        tf: parseInt(tMatch[4]) / 1000,
                        plateW: plateW,
                        plateT: plateT
                    };
                }
                
                // Default
                return { type: 'default', h: 0.1, t: 0.01, plateW: plateW, plateT: plateT };
            }
            
            // Draw elements (beams)
            if (view.showBeams) {
            Object.entries(model.elements).forEach(([id, elem]) => {
                const elemId = parseInt(id);
                const n1 = model.nodes[elem.n1];
                const n2 = model.nodes[elem.n2];
                if (!n1 || !n2) return;
                
                // Check if element is selected
                // Sahne her zaman SECILMEMIS hali kurar; vurguyu sonradan
                // secimVurgusunuTazele() basar. Boylece secim degisince
                // sahneyi yeniden kurmak gerekmez ve her parcanin "normal"
                // malzemesi temelMalzeme olarak saklanabilir.
                const isSelected = false;
                
                let z1 = (n1.z || 0), z2 = (n2.z || 0);
                if (deformScale > 0 && results && results.displacements) {
                    const d1 = results.displacements[elem.n1];
                    const d2 = results.displacements[elem.n2];
                    // Sahne Z"si model Z"si ile ayni yonde (deforme olmayan geometri
                    // z = n.z ile kuruluyor, kamera up = +Z). O halde Uz
                    // DOGRUDAN eklenir: negatif Uz asagi cizer.
                    //
                    // Burada bir zamanlar -Uz vardi ve tam tersini yapiyordu:
                    // asagi yuk altinda yapi YUKARI kalkiyordu. Yorum zaten
                    // dogru niyeti yaziyordu, satir onu tutmuyordu. 2B gorunum
                    // (canvas2d.js drawDeformed) hep dogruydu; yalnizca 3B ters.
                    if (d1) z1 += d1.Uz * deformScale;
                    if (d2) z2 += d2.Uz * deformScale;
                }
                
                const start = new THREE.Vector3(n1.x, n1.y, z1);
                const end = new THREE.Vector3(n2.x, n2.y, z2);
                const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
                const length = start.distanceTo(end);
                
                // Direction vector
                const dir = new THREE.Vector3().subVectors(end, start).normalize();
                
                // Get orientation (default: web vertical, top up)
                const orientation = elem.orientation || 0;
                
                if (view.showSection) {
                    // Draw with real cross-section geometry
                    const sec = getSectionDimensions(elem.section);
                    // Use section-specific material (pass elemId for stress colors)
                    const mat = getMaterialForSection(elem.section, isSelected, deformScale > 0, elemId);
                    const pMat = isSelected ? plateSelectedMaterial : plateMaterial;
                    
                    // Calculate rotation to align with beam direction
                    // Beam extends along local X axis, then rotated to actual direction
                    const angle = Math.atan2(dir.y, dir.x);
                    
                    // Create beam group
                    const beamGroup = new THREE.Group();
                    beamGroup.userData.isModelObject = true;
                    beamGroup.userData.elemId = elemId;
                    
                    // GRILLAGE CONVENTION: Plate on TOP (Z=0), profile hanging DOWN (Z-)
                    // This is ship structure standard - plate is deck/hull, stiffeners hang below
                    
                    // Plate (if exists) - at Z=0 level (top surface)
                    if (sec.plateW > 0 && sec.plateT > 0) {
                        const plateGeom = new THREE.BoxGeometry(length, sec.plateW, sec.plateT);
                        const plate = new THREE.Mesh(plateGeom, pMat);
                        plate.position.z = -sec.plateT / 2;  // Plate hangs slightly below Z=0
                        beamGroup.add(plate);
                    }
                    
                    // Profile hangs BELOW plate (negative Z direction)
                    const profileTopZ = -(sec.plateT || 0);  // Start from bottom of plate
                    
                    if (sec.type === 'FB') {
                        // Flat Bar: thin rectangle hanging down
                        const webGeom = new THREE.BoxGeometry(length, sec.t, sec.h);
                        const web = new THREE.Mesh(webGeom, mat);
                        web.position.z = profileTopZ - sec.h / 2;
                        beamGroup.add(web);
                        
                    } else if (sec.type === 'HP') {
                        // HP Profile (Bulb Flat) - EN 10067 style
                        // Web is ~82% of height, bulb is ~18%
                        const bulbH = sec.h * 0.18;
                        const webH = sec.h - bulbH;
                        const bulbW = sec.t * 3.2;  // Bulb width ~3.2x web thickness
                        
                        // Web (hanging down from plate)
                        const webGeom = new THREE.BoxGeometry(length, sec.t, webH);
                        const web = new THREE.Mesh(webGeom, mat);
                        web.position.z = profileTopZ - webH / 2;
                        beamGroup.add(web);
                        
                        // Bulb at bottom - create a more realistic bulb shape
                        // Using a capsule-like shape (cylinder + spheres) for the bulb
                        const bulbCenterZ = profileTopZ - webH - bulbH / 2;
                        
                        // Main bulb body (wider than web)
                        const bulbGeom = new THREE.BoxGeometry(length, bulbW, bulbH);
                        const bulb = new THREE.Mesh(bulbGeom, flangeMaterial);
                        bulb.position.z = bulbCenterZ;
                        beamGroup.add(bulb);
                        
                        // Round the bulb edges with small cylinders at sides
                        const edgeRadius = bulbH / 2;
                        const edgeGeom = new THREE.CylinderGeometry(edgeRadius, edgeRadius, length, 8);
                        
                        // Left edge
                        const leftEdge = new THREE.Mesh(edgeGeom, flangeMaterial);
                        leftEdge.rotation.z = Math.PI / 2;
                        leftEdge.position.set(0, -bulbW/2 + edgeRadius, bulbCenterZ);
                        beamGroup.add(leftEdge);
                        
                        // Right edge
                        const rightEdge = new THREE.Mesh(edgeGeom, flangeMaterial);
                        rightEdge.rotation.z = Math.PI / 2;
                        rightEdge.position.set(0, bulbW/2 - edgeRadius, bulbCenterZ);
                        beamGroup.add(rightEdge);
                        
                    } else if (sec.type === 'T') {
                        // T-section (inverted T): Web at top (connects to plate), Flange at bottom
                        // Web (vertical, hanging from plate)
                        const webH = sec.hw - sec.tf;
                        const webGeom = new THREE.BoxGeometry(length, sec.tw, webH);
                        const web = new THREE.Mesh(webGeom, mat);
                        web.position.z = profileTopZ - webH / 2;
                        beamGroup.add(web);
                        
                        // Flange (horizontal, at bottom of web)
                        const flangeGeom = new THREE.BoxGeometry(length, sec.bf, sec.tf);
                        const flange = new THREE.Mesh(flangeGeom, flangeMaterial);
                        flange.position.z = profileTopZ - webH - sec.tf / 2;
                        beamGroup.add(flange);
                        
                    } else {
                        // Default: simple rectangle hanging down
                        const webGeom = new THREE.BoxGeometry(length, sec.t, sec.h);
                        const web = new THREE.Mesh(webGeom, mat);
                        web.position.z = profileTopZ - sec.h / 2;
                        beamGroup.add(web);
                    }
                    
                    // Position and orient the entire group
                    beamGroup.position.copy(mid);
                    beamGroup.rotation.z = angle;  // Rotate around Z to align with beam direction
                    
                    // Apply user orientation (rotation around beam's local axis)
                    if (orientation !== 0) {
                        // This rotates around the beam's length axis (local X after z-rotation)
                        beamGroup.rotateX(orientation * Math.PI / 180);
                    }
                    
                    vurguIcinEtiketle(beamGroup);
                    applyWorkPlaneGhost(beamGroup, n1, n2);
                    threeScene.add(beamGroup);
                    
                } else {
                    // Cylinder representation for better visibility
                    // Check for stress visualization
                    const shouldShowStress = (showResultsVisualization || view.showStress) && results && results.elementResults;
                    
                    // Beam thickness based on model size and display multiplier
                    const beamRadius = modelSize * 0.008 * beamDisplaySize;
                    
                    if (shouldShowStress && results.elementResults[elemId] && !isSelected) {
                        // GRADIENT: Draw beam as multiple segments with varying colors
                        const elemResult = results.elementResults[elemId];
                        const sigmaLimit = parseFloat(document.getElementById('sigmaLimit')?.value) || 355;
                        
                        // Cozucunun hesapladigi diyagram. Eskiden burada M1/Mmid/M2'den
                        // parabol uyduruluyordu ve mutlak deger alindigi icin isaret
                        // degistiren moment (her surekli kiris) yanlis renkleniyordu.
                        const diag = elemResult.diagram;
                        const Mmax = Math.abs(elemResult.Mmax || 0);
                        const momentAt = (t) => {
                            if (diag && diag.M && diag.M.length > 1) {
                                const f = Math.min(Math.max(t, 0), 1) * (diag.M.length - 1);
                                const i0 = Math.floor(f), i1 = Math.min(i0 + 1, diag.M.length - 1);
                                const w = f - i0;
                                return diag.M[i0] * (1 - w) + diag.M[i1] * w;
                            }
                            const a = Math.abs(elemResult.M1 || 0), b = Math.abs(elemResult.M2 || 0);
                            return a * (1 - t) + b * t;
                        };
                        
                        // Number of segments
                        const numSegments = 8;
                        const segLength = length / numSegments;
                        
                        const beamGroup = new THREE.Group();
                        beamGroup.userData.isModelObject = true;
                        beamGroup.userData.elemId = elemId;
                        
                        for (let i = 0; i < numSegments; i++) {
                            const t = (i + 0.5) / numSegments; // Center of segment
                            
                            const M = momentAt(t);
                            
                            // Calculate stress at this position (proportional to moment)
                            const stressRatio = Mmax > 0 ? Math.abs(M) / (Mmax * 1.001) : 0;
                            const stress = stressRatio * (elemResult.sigma || 0);
                            const segColor = getStressColorHex(stress, sigmaLimit);
                            
                            const segMat = new THREE.MeshStandardMaterial({
                                color: segColor,
                                emissive: segColor,
                                emissiveIntensity: 0.2,
                                metalness: 0.3,
                                roughness: 0.6
                            });
                            
                            const segGeom = new THREE.CylinderGeometry(beamRadius, beamRadius, segLength * 1.02, 8);
                            const segMesh = new THREE.Mesh(segGeom, segMat);
                            
                            // Position along beam axis (Y in local coords before rotation)
                            const segT = (i + 0.5) / numSegments;
                            segMesh.position.y = (segT - 0.5) * length;
                            
                            beamGroup.add(segMesh);
                        }
                        
                        beamGroup.position.copy(mid);
                        beamGroup.lookAt(end);
                        beamGroup.rotateX(Math.PI / 2);
                        
                        vurguIcinEtiketle(beamGroup);
                        applyWorkPlaneGhost(beamGroup, n1, n2);
                        threeScene.add(beamGroup);
                    } else {
                        // Single color beam (no stress or selected)
                        let beamColor;
                        if (isSelected) {
                            beamColor = selectionColorInt;
                        } else if (shouldShowStress && results.elementResults[elemId]) {
                            const stress = results.elementResults[elemId].vonMises || 0;
                            const sigmaLimit = parseFloat(document.getElementById('sigmaLimit')?.value) || 355;
                            beamColor = getStressColorHex(stress, sigmaLimit);
                        } else {
                            beamColor = beamColorInt;
                        }
                        
                        const beamMat = new THREE.MeshStandardMaterial({ 
                            color: beamColor,
                            emissive: beamColor,
                            emissiveIntensity: isSelected ? 0.4 : 0.15,
                            metalness: 0.3,
                            roughness: 0.6
                        });
                        
                        const beamGeometry = new THREE.CylinderGeometry(beamRadius, beamRadius, length, 8);
                        const beam = new THREE.Mesh(beamGeometry, beamMat);
                        
                        beam.position.copy(mid);
                        beam.lookAt(end);
                        beam.rotateX(Math.PI / 2);
                        
                        beam.userData.isModelObject = true;
                        beam.userData.elemId = elemId;
                        vurguIcinEtiketle(beam);
                        applyWorkPlaneGhost(beam, n1, n2);
                        threeScene.add(beam);
                    }
                }
            });
            } // End of if (view.showBeams)
            
            // Draw nodes - Premium diamond style
            if (view.showNodes) {
                Object.entries(model.nodes).forEach(([id, node]) => {
                    const nodeId = parseInt(id);
                    let z = (node.z || 0);
                    if (deformScale > 0 && results && results.displacements) {
                        const d = results.displacements[nodeId];
                        if (d) z += d.Uz * deformScale;
                    }
                    
                    // Check if node is selected
                    const isNodeSelected = false;   // vurgu sonradan basilir
                    
                    const isConstrained = model.constraints[nodeId];
                    // Node size based on model size and display multiplier
                    const baseNodeSize = modelSize * 0.025 * nodeDisplaySize;  // Larger nodes
                    // Buyutme GEOMETRIYE degil mesh olcegine uygulanir:
                    // boylece secim degisince yeni geometri kurmak gerekmez,
                    // secimVurgusunuTazele() yalnizca olcegi degistirir.
                    const nodeSize = baseNodeSize;
                    const nodeOlcek = isNodeSelected ? 1.5 : (isConstrained ? 1.3 : 1);
                    
                    // Diamond shape (octahedron) for premium look
                    const nodeGeometry = new THREE.OctahedronGeometry(nodeSize);
                    
                    // Select material based on selection state
                    let nMat = nodeMaterial;
                    if (isNodeSelected) {
                        nMat = nodeSelectedMaterial;
                    }
                    
                    const nodeMesh = new THREE.Mesh(nodeGeometry, nMat);
                    nodeMesh.scale.setScalar(nodeOlcek);
                    nodeMesh.position.set(node.x, node.y, z);
                    nodeMesh.userData.isModelObject = true;
                    nodeMesh.userData.nodeId = nodeId;
                    vurguIcinEtiketle(nodeMesh);
                    applyWorkPlaneGhost(nodeMesh, node, node);
                    threeScene.add(nodeMesh);
                    
                    // Draw premium constraint arrows (6 DOF system)
                    if (isConstrained) {
                        const bc = model.constraints[nodeId];
                        const constraintGroup = new THREE.Group();
                        constraintGroup.userData.isModelObject = true;
                        
                        // Arrow size based on model and display size
                        const arrowScale = modelSize * 0.06 * bcDisplaySize;
                        
                        // Constraint material - Green/Teal for constraints
                        const constraintMat = new THREE.MeshStandardMaterial({ 
                            color: 0x06b6d4,  // Cyan
                            emissive: 0x0891b2,
                            emissiveIntensity: 0.3,
                            metalness: 0.5, 
                            roughness: 0.3
                        });
                        
                        // Parse constraint DOFs
                        let constrainedDofs = { Ux: false, Uy: false, Uz: false, Rx: false, Ry: false, Rz: false };
                        
                        if (typeof bc === 'string') {
                            if (bc === 'fixed') {
                                constrainedDofs = { Ux: true, Uy: true, Uz: true, Rx: true, Ry: true, Rz: true };
                            } else if (bc === 'simply_supported' || bc === 'pinned') {
                                constrainedDofs = { Ux: true, Uy: true, Uz: true, Rx: false, Ry: false, Rz: false };
                            } else if (bc === 'roller') {
                                constrainedDofs = { Ux: false, Uy: false, Uz: true, Rx: false, Ry: false, Rz: false };
                            }
                        } else if (typeof bc === 'object') {
                            constrainedDofs = {
                                Ux: !!bc.Ux, Uy: !!bc.Uy, Uz: !!bc.Uz,
                                Rx: !!bc.Rx, Ry: !!bc.Ry, Rz: !!bc.Rz
                            };
                        }
                        
                        // Helper: Create translation arrow (straight arrow)
                        function createTranslationArrow(direction, offset) {
                            const arrowGroup = new THREE.Group();
                            
                            const shaftLength = arrowScale * 0.7;
                            const shaftRadius = arrowScale * 0.03;
                            const coneHeight = arrowScale * 0.25;
                            const coneRadius = arrowScale * 0.08;
                            
                            // Shaft
                            const shaftGeom = new THREE.CylinderGeometry(shaftRadius, shaftRadius, shaftLength, 8);
                            const shaft = new THREE.Mesh(shaftGeom, constraintMat);
                            shaft.position.y = shaftLength / 2;
                            arrowGroup.add(shaft);
                            
                            // Arrow head (cone)
                            const coneGeom = new THREE.ConeGeometry(coneRadius, coneHeight, 12);
                            const cone = new THREE.Mesh(coneGeom, constraintMat);
                            cone.position.y = shaftLength + coneHeight / 2;
                            arrowGroup.add(cone);
                            
                            // Orient arrow based on direction
                            if (direction === 'x') {
                                arrowGroup.rotation.z = -Math.PI / 2;
                                arrowGroup.position.x = offset;
                            } else if (direction === 'y') {
                                arrowGroup.position.y = offset;
                            } else if (direction === 'z') {
                                arrowGroup.rotation.x = Math.PI / 2;
                                arrowGroup.position.z = offset;
                            }
                            
                            return arrowGroup;
                        }
                        
                        // Helper: Create rotation arrow (curved arrow)
                        function createRotationArrow(axis, offset) {
                            const arrowGroup = new THREE.Group();
                            
                            const curveRadius = arrowScale * 0.5;
                            const tubeRadius = arrowScale * 0.025;
                            
                            // Create arc (3/4 circle)
                            const curve = new THREE.EllipseCurve(
                                0, 0,
                                curveRadius, curveRadius,
                                0, Math.PI * 1.5,
                                false,
                                0
                            );
                            
                            const points = curve.getPoints(32);
                            const points3D = points.map(p => new THREE.Vector3(p.x, p.y, 0));
                            const curveGeom = new THREE.TubeGeometry(
                                new THREE.CatmullRomCurve3(points3D),
                                32, tubeRadius, 8, false
                            );
                            const curveMesh = new THREE.Mesh(curveGeom, constraintMat);
                            arrowGroup.add(curveMesh);
                            
                            // Arrow head at end of curve
                            const coneHeight = arrowScale * 0.15;
                            const coneRadius = arrowScale * 0.06;
                            const coneGeom = new THREE.ConeGeometry(coneRadius, coneHeight, 8);
                            const cone = new THREE.Mesh(coneGeom, constraintMat);
                            
                            // Position cone at end of arc
                            const endPoint = points3D[points3D.length - 1];
                            cone.position.copy(endPoint);
                            cone.rotation.z = Math.PI / 2;  // Point tangent to arc
                            arrowGroup.add(cone);
                            
                            // Orient based on rotation axis
                            if (axis === 'x') {
                                arrowGroup.rotation.y = Math.PI / 2;
                                arrowGroup.position.x = offset;
                            } else if (axis === 'y') {
                                arrowGroup.rotation.x = -Math.PI / 2;
                                arrowGroup.position.y = offset;
                            } else if (axis === 'z') {
                                arrowGroup.position.z = offset;
                            }
                            
                            return arrowGroup;
                        }
                        
                        const spacing = arrowScale * 0.3;
                        
                        // Translation constraints (straight arrows)
                        if (constrainedDofs.Ux) {
                            constraintGroup.add(createTranslationArrow('x', -spacing));
                        }
                        if (constrainedDofs.Uy) {
                            constraintGroup.add(createTranslationArrow('y', -spacing));
                        }
                        if (constrainedDofs.Uz) {
                            constraintGroup.add(createTranslationArrow('z', -spacing));
                        }
                        
                        // Rotation constraints (curved arrows)
                        if (constrainedDofs.Rx) {
                            constraintGroup.add(createRotationArrow('x', spacing));
                        }
                        if (constrainedDofs.Ry) {
                            constraintGroup.add(createRotationArrow('y', spacing));
                        }
                        if (constrainedDofs.Rz) {
                            constraintGroup.add(createRotationArrow('z', spacing * 0.5));
                        }
                        
                        constraintGroup.position.set(node.x, node.y, (node.z || 0));
                        threeScene.add(constraintGroup);
                    }
                });
            }
            
            // Draw loads - Premium version with model-scaled arrows
            if (view.showLoads) {
                // Load materials with different colors for direction
                const loadDownMaterial = new THREE.MeshStandardMaterial({ 
                    color: 0xef4444,   // Red for downward
                    emissive: 0xdc2626,
                    emissiveIntensity: 0.4,
                    metalness: 0.4, 
                    roughness: 0.3
                });
                
                const loadUpMaterial = new THREE.MeshStandardMaterial({ 
                    color: 0x22c55e,   // Green for upward
                    emissive: 0x16a34a,
                    emissiveIntensity: 0.4,
                    metalness: 0.4, 
                    roughness: 0.3
                });
                
                // Base scale for arrows
                const baseLoadArrowScale = modelSize * 0.10 * loadDisplaySize;
                
                // Find max load value for proportional scaling
                let maxLoadValue = 0;
                // Olcek UC bilesene de bakar. Yalnizca Fz'ye bakinca yatay
                // yuklu bir modelde maxLoadValue 0 kaliyor, ok boylari sacma
                // ciktiyordu.
                model.loads.forEach(load => {
                    ['Fx', 'Fy', 'Fz'].forEach(ad => {
                        const v = Math.abs(load[ad] || 0);
                        if (v > maxLoadValue) maxLoadValue = v;
                    });
                });
                // Also check line loads
                Object.values(model.elements).forEach(elem => {
                    if (elem.lineLoads) {
                        elem.lineLoads.forEach(ll => {
                            const q = Math.abs(ll.value || ll.q || 0);
                            if (q > maxLoadValue) maxLoadValue = q;
                        });
                    }
                });
                if (maxLoadValue === 0) maxLoadValue = 10; // Default
                
                // Point loads on nodes
                //
                // Her BILESEN icin ayri ok. Eskiden yalnizca Fz ciziliyordu ve
                // Fz tanimsizsa -10 varsayiliyordu: {Fx: 10} gibi yatay bir yuk
                // ekranda OLMAYAN bir "10 kN asagi" oku olarak gorunuyor, asil
                // yatay yuk ise hic gorunmuyordu. Cozucu uc bileseni de dogru
                // uyguluyordu (denge testleri gecerdi); yanlis olan gosterimdi.
                const YUK_EKSENLERI = [
                    { ad: 'Fx', eksen: 'x' },
                    { ad: 'Fy', eksen: 'y' },
                    { ad: 'Fz', eksen: 'z' }
                ];

                model.loads.forEach(load => {
                    const node = model.nodes[load.nodeId];
                    if (!node) return;

                    let z = 0;
                    if (deformScale > 0 && results && results.displacements) {
                        const d = results.displacements[load.nodeId];
                        if (d) z = d.Uz * deformScale;
                    }

                    YUK_EKSENLERI.forEach(({ ad, eksen }) => {
                        const F = load[ad];
                        if (!F) return;              // 0 ya da tanimsiz: ok yok

                        const negatif = F < 0;

                        // Proportional scaling: min 0.4x, max 1.0x of base scale
                        const loadRatio = Math.sqrt(Math.abs(F) / maxLoadValue);
                        const scaleFactor = 0.4 + loadRatio * 0.6;
                        const loadArrowScale = baseLoadArrowScale * scaleFactor;

                        const arrowLength = loadArrowScale;
                        const coneHeight = loadArrowScale * 0.35;
                        const coneRadius = loadArrowScale * 0.12;
                        const stemRadius = loadArrowScale * 0.04;

                        const lMat = negatif ? loadDownMaterial : loadUpMaterial;

                        const loadGroup = new THREE.Group();
                        loadGroup.userData.isModelObject = true;

                        const arrowGeometry = new THREE.ConeGeometry(coneRadius, coneHeight, 16);
                        const arrow = new THREE.Mesh(arrowGeometry, lMat);

                        const stemLength = arrowLength - coneHeight;
                        const stemGeometry = new THREE.CylinderGeometry(stemRadius, stemRadius * 0.8, stemLength, 12);
                        const stem = new THREE.Mesh(stemGeometry, lMat);

                        // Yerel +y her zaman eksenin ARTI yonu. Yonu koninin
                        // kendi yerlesimi belirler: negatifse koni dugumun
                        // yaninda ve geriye bakar, govde disari uzanir.
                        if (negatif) {
                            arrow.rotation.x = Math.PI;
                            arrow.position.y = coneHeight / 2;
                            stem.position.y = coneHeight + stemLength / 2;
                        } else {
                            arrow.position.y = stemLength + coneHeight / 2;
                            stem.position.y = stemLength / 2;
                        }

                        loadGroup.add(arrow);
                        loadGroup.add(stem);

                        // Value label sprite - larger canvas for better visibility
                        const labelCanvas = document.createElement('canvas');
                        labelCanvas.width = 256;
                        labelCanvas.height = 128;
                        const labelCtx = labelCanvas.getContext('2d');
                        labelCtx.clearRect(0, 0, 256, 128);

                        labelCtx.font = 'bold 52px Inter, Arial, sans-serif';
                        labelCtx.textAlign = 'center';
                        labelCtx.textBaseline = 'middle';

                        // Etikette hangi bilesen oldugu yazar: ayni dugumde
                        // birden fazla ok olabilir, "10.0 kN" tek basina hangisi
                        // oldugunu soylemiyordu.
                        const yazi = ad + ' ' + Math.abs(F).toFixed(1) + ' kN';

                        labelCtx.strokeStyle = 'rgba(15, 23, 42, 0.95)';
                        labelCtx.lineWidth = 6;
                        labelCtx.strokeText(yazi, 128, 64);

                        labelCtx.fillStyle = negatif ? '#ef4444' : '#22c55e';
                        labelCtx.fillText(yazi, 128, 64);

                        const labelTexture = new THREE.CanvasTexture(labelCanvas);
                        const labelMaterial = new THREE.SpriteMaterial({ map: labelTexture, transparent: true });
                        const labelSprite = new THREE.Sprite(labelMaterial);
                        const loadLabelMult = window.labelSizes?.load || 1.0;
                        labelSprite.scale.set(baseLoadArrowScale * 1.8 * loadLabelMult, baseLoadArrowScale * 0.9 * loadLabelMult, 1);
                        // Etiket okun dugumden UZAK ucunda.
                        labelSprite.position.y = arrowLength + loadArrowScale * 0.55;
                        loadGroup.add(labelSprite);

                        // Yerel +y'yi ilgili dunya eksenine cevir.
                        if (eksen === 'z') loadGroup.rotation.x = Math.PI / 2;
                        else if (eksen === 'x') loadGroup.rotation.z = -Math.PI / 2;
                        // 'y' icin donme yok: yerel +y zaten dunya +y.

                        loadGroup.position.set(node.x, node.y, z + 0.02);

                        threeScene.add(loadGroup);
                    });
                });
                
                // Line loads on elements - distributed arrows with gradient
                Object.values(model.elements).forEach(elem => {
                    if (!elem.lineLoads || elem.lineLoads.length === 0) return;
                    
                    const n1 = model.nodes[elem.n1];
                    const n2 = model.nodes[elem.n2];
                    if (!n1 || !n2) return;
                    
                    const dx = n2.x - n1.x;
                    const dy = n2.y - n1.y;
                    const beamLength = Math.sqrt(dx*dx + dy*dy);
                    
                    // Get line load value for scaling
                    // Yon cozucuyle ayni yerden gelir (lineLoadDirection). Eskiden burada
                    // "q < 0 ise asagi" varsayiliyordu; cozucude ise yonu `angle` belirler,
                    // bu yuzden her normal asagi yuk yukari yonde ciziliyordu.
                    const firstLoad = elem.lineLoads[0];
                    const dir = lineLoadDirection(firstLoad);

                    // Cizim, cozucunun kullandigi yon vektorunun AYNISINI kurar:
                    // wVec = cosA * frame.y - sinA * z  (bkz. fem.js).
                    const frame = (typeof elementFrame === 'function')
                        ? elementFrame(n1, n2) : null;
                    const angleRad = (firstLoad.angle !== undefined ? firstLoad.angle : 90)
                        * Math.PI / 180;
                    // Cozucude wf butun bilesenleri carpar; isareti dusurmek
                    // value=-8 (yukari) yuku asagi cizdiriyordu.
                    const qIsaret = (firstLoad.value ?? firstLoad.q ?? 0) < 0 ? -1 : 1;
                    const sinA = Math.sin(angleRad) * qIsaret;
                    const cosA = Math.cos(angleRad) * qIsaret;
                    const q = dir.magnitude;
                    const isLineLoadDownward = dir.isDownward;
                    const lineLoadRatio = Math.sqrt(q / maxLoadValue);
                    const lineScaleFactor = 0.4 + lineLoadRatio * 0.6;
                    const lineLoadArrowScale = baseLoadArrowScale * 0.6 * lineScaleFactor;
                    
                    // Material based on direction
                    const lineLoadMat = isLineLoadDownward ? 
                        new THREE.MeshStandardMaterial({ 
                            color: 0xf97316,   // Orange for downward
                            emissive: 0xea580c,
                            emissiveIntensity: 0.3,
                            metalness: 0.4, 
                            roughness: 0.3
                        }) :
                        new THREE.MeshStandardMaterial({ 
                            color: 0x22c55e,   // Green for upward
                            emissive: 0x16a34a,
                            emissiveIntensity: 0.3,
                            metalness: 0.4, 
                            roughness: 0.3
                        });
                    
                    // More arrows for longer beams
                    const numArrows = Math.max(3, Math.ceil(beamLength / (modelSize * 0.15)));
                    
                    for (let i = 0; i < numArrows; i++) {
                        const t = (i + 0.5) / numArrows;
                        const x = n1.x + dx * t;
                        const y = n1.y + dy * t;
                        
                        let zBase = 0;
                        if (deformScale > 0 && results && results.displacements) {
                            const d1 = results.displacements[elem.n1];
                            const d2 = results.displacements[elem.n2];
                            if (d1 && d2) zBase = (d1.Uz * (1-t) + d2.Uz * t) * deformScale;
                        }
                        
                        const arrowGroup = new THREE.Group();
                        arrowGroup.userData.isModelObject = true;
                        
                        // Small arrow with premium material
                        const coneH = lineLoadArrowScale * 0.35;
                        const coneR = lineLoadArrowScale * 0.12;
                        const arrowGeometry = new THREE.ConeGeometry(coneR, coneH, 12);
                        const arrow = new THREE.Mesh(arrowGeometry, lineLoadMat);
                        
                        // Stem
                        const stemLen = lineLoadArrowScale * 0.65;
                        const stemR = lineLoadArrowScale * 0.04;
                        const stemGeometry = new THREE.CylinderGeometry(stemR, stemR * 0.8, stemLen, 8);
                        const stem = new THREE.Mesh(stemGeometry, lineLoadMat);
                        
                        // Ok, yukun GERCEK yonunde cizilir. Eskiden her zaman
                        // dunya z ekseninde ciziliyordu: angle=0 (saf yanal)
                        // bir yuk dusey gorunuyor, angle=45'te yanal yarisi
                        // hic gorunmuyordu. Cozucu ikisini de dogru uyguluyor
                        // (wVec = cosA*frame.y - sinA*z), gosterim yanlisti.
                        //
                        // Koni yerel -y'de ve o yone bakar; govde +y'ye uzanir.
                        // Sonra yerel -y, yuk yonune dondurulur: ok kirisin
                        // uzerinde durup yukun ittigi yone bakar.
                        arrow.rotation.x = Math.PI;
                        arrow.position.y = coneH / 2;
                        stem.position.y = coneH + stemLen / 2;
                        arrowGroup.add(arrow);
                        arrowGroup.add(stem);

                        const yukYonu = frame
                            ? new THREE.Vector3(
                                cosA * frame.y[0],
                                cosA * frame.y[1],
                                cosA * frame.y[2] - sinA)
                            : new THREE.Vector3(0, 0, -sinA);
                        if (yukYonu.lengthSq() < 1e-12) yukYonu.set(0, 0, -1);
                        yukYonu.normalize();

                        arrowGroup.quaternion.setFromUnitVectors(
                            new THREE.Vector3(0, -1, 0), yukYonu);
                        arrowGroup.position.set(x, y, zBase + 0.06);
                        
                        threeScene.add(arrowGroup);
                    }
                    
                    // Connecting line at top of arrows
                    const linePoints = [];
                    for (let i = 0; i <= 10; i++) {
                        const t = i / 10;
                        let zBase = 0;
                        if (deformScale > 0 && results && results.displacements) {
                            const d1 = results.displacements[elem.n1];
                            const d2 = results.displacements[elem.n2];
                            if (d1 && d2) zBase = (d1.Uz * (1-t) + d2.Uz * t) * deformScale;
                        }
                        // Line at top of arrows (arrow tip + arrow length)
                        const lineZ = zBase + 0.06 + lineLoadArrowScale;
                        linePoints.push(new THREE.Vector3(
                            n1.x + dx * t,
                            n1.y + dy * t,
                            lineZ
                        ));
                    }
                    const lineGeometry = new THREE.BufferGeometry().setFromPoints(linePoints);
                    const lineColor = isLineLoadDownward ? 0xf97316 : 0x22c55e;
                    const lineMaterial = new THREE.LineBasicMaterial({ color: lineColor, linewidth: 2 });
                    const line = new THREE.Line(lineGeometry, lineMaterial);
                    line.userData.isModelObject = true;
                    threeScene.add(line);
                });
            }
            
            // Draw Moment Diagram in 3D (in Z direction - same as load direction)
            if (view.showMoment && results && results.elementResults) {
                const momentMaterial = new THREE.MeshBasicMaterial({ 
                    color: 0xa855f7, 
                    transparent: true, 
                    opacity: 0.6,
                    side: THREE.DoubleSide
                });
                const momentLineMaterial = new THREE.LineBasicMaterial({ color: 0xa855f7, linewidth: 2 });
                
                // Find max moment for scaling
                let maxM = 0;
                Object.values(results.elementResults).forEach(res => {
                    maxM = Math.max(maxM, Math.abs(res.M1 || 0), Math.abs(res.M2 || 0), Math.abs(res.Mmid || 0));
                });
                
                if (maxM > 0) {
                    const diagramScale = 0.5 * view.diagramScale; // Scale factor for 3D
                    
                    Object.entries(model.elements).forEach(([elemId, elem]) => {
                        const n1 = model.nodes[elem.n1];
                        const n2 = model.nodes[elem.n2];
                        if (!n1 || !n2) return;
                        
                        const res = results.elementResults[elemId];
                        if (!res) return;
                        
                        // Scale moments (positive moment = diagram goes UP in Z)
                        const m1 = (res.M1 || 0) / maxM * diagramScale;
                        const m2 = (res.M2 || 0) / maxM * diagramScale;
                        const mMid = (res.Mmid || (res.M1 + res.M2) / 2) / maxM * diagramScale;
                        
                        // Get z positions (deformed if enabled)
                        let z1 = 0, z2 = 0, zMid = 0;
                        if (deformScale > 0 && results.displacements) {
                            const d1 = results.displacements[elem.n1];
                            const d2 = results.displacements[elem.n2];
                            if (d1) z1 = d1.Uz * deformScale;
                            if (d2) z2 = d2.Uz * deformScale;
                            zMid = (z1 + z2) / 2;
                        }
                        
                        // Midpoint
                        const midX = (n1.x + n2.x) / 2;
                        const midY = (n1.y + n2.y) / 2;
                        
                        // Points on beam (base of diagram)
                        const p1 = new THREE.Vector3(n1.x, n1.y, z1);
                        const p2 = new THREE.Vector3(n2.x, n2.y, z2);
                        const midP = new THREE.Vector3(midX, midY, zMid);
                        
                        // Offset points in Z direction (moment values)
                        const m1P = new THREE.Vector3(n1.x, n1.y, z1 + m1);
                        const m2P = new THREE.Vector3(n2.x, n2.y, z2 + m2);
                        const mMidP = new THREE.Vector3(midX, midY, zMid + mMid);
                        
                        // Create a filled shape using triangles
                        const vertices = new Float32Array([
                            // Triangle 1: p1 -> m1P -> mMidP
                            p1.x, p1.y, p1.z,
                            m1P.x, m1P.y, m1P.z,
                            mMidP.x, mMidP.y, mMidP.z,
                            // Triangle 2: p1 -> mMidP -> midP
                            p1.x, p1.y, p1.z,
                            mMidP.x, mMidP.y, mMidP.z,
                            midP.x, midP.y, midP.z,
                            // Triangle 3: midP -> mMidP -> m2P
                            midP.x, midP.y, midP.z,
                            mMidP.x, mMidP.y, mMidP.z,
                            m2P.x, m2P.y, m2P.z,
                            // Triangle 4: midP -> m2P -> p2
                            midP.x, midP.y, midP.z,
                            m2P.x, m2P.y, m2P.z,
                            p2.x, p2.y, p2.z
                        ]);
                        
                        const geometry = new THREE.BufferGeometry();
                        geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
                        geometry.computeVertexNormals();
                        
                        const mesh = new THREE.Mesh(geometry, momentMaterial);
                        mesh.userData.isModelObject = true;
                        threeScene.add(mesh);
                        
                        // Outline
                        const outlinePoints = [p1, m1P, mMidP, m2P, p2];
                        const outlineGeometry = new THREE.BufferGeometry().setFromPoints(outlinePoints);
                        const outline = new THREE.Line(outlineGeometry, momentLineMaterial);
                        outline.userData.isModelObject = true;
                        threeScene.add(outline);
                    });
                }
            }
            
            // Draw Shear Diagram in 3D (in Z direction - same as load direction)
            if (view.showShear && results && results.elementResults) {
                const shearMaterial = new THREE.MeshBasicMaterial({ 
                    color: 0x22d3ee, 
                    transparent: true, 
                    opacity: 0.6,
                    side: THREE.DoubleSide
                });
                const shearLineMaterial = new THREE.LineBasicMaterial({ color: 0x22d3ee, linewidth: 2 });
                
                // Find max shear for scaling
                let maxV = 0;
                Object.values(results.elementResults).forEach(res => {
                    maxV = Math.max(maxV, Math.abs(res.V1 || 0), Math.abs(res.V2 || 0));
                });
                
                if (maxV > 0) {
                    const diagramScale = 0.3 * view.diagramScale; // Scale factor for 3D
                    
                    Object.entries(model.elements).forEach(([elemId, elem]) => {
                        const n1 = model.nodes[elem.n1];
                        const n2 = model.nodes[elem.n2];
                        if (!n1 || !n2) return;
                        
                        const res = results.elementResults[elemId];
                        if (!res) return;
                        
                        // Scale shears (positive shear = diagram goes UP in Z)
                        const v1 = (res.V1 || 0) / maxV * diagramScale;
                        const v2 = (res.V2 || 0) / maxV * diagramScale;
                        
                        // Get z positions
                        let z1 = 0, z2 = 0;
                        if (deformScale > 0 && results.displacements) {
                            const d1 = results.displacements[elem.n1];
                            const d2 = results.displacements[elem.n2];
                            if (d1) z1 = d1.Uz * deformScale;
                            if (d2) z2 = d2.Uz * deformScale;
                        }
                        
                        // Points on beam (base of diagram)
                        const p1 = new THREE.Vector3(n1.x, n1.y, z1);
                        const p2 = new THREE.Vector3(n2.x, n2.y, z2);
                        
                        // Offset points in Z direction (shear values)
                        const v1P = new THREE.Vector3(n1.x, n1.y, z1 + v1);
                        const v2P = new THREE.Vector3(n2.x, n2.y, z2 + v2);
                        
                        const vertices = new Float32Array([
                            // Triangle 1
                            p1.x, p1.y, p1.z,
                            v1P.x, v1P.y, v1P.z,
                            v2P.x, v2P.y, v2P.z,
                            // Triangle 2
                            p1.x, p1.y, p1.z,
                            v2P.x, v2P.y, v2P.z,
                            p2.x, p2.y, p2.z
                        ]);
                        
                        const geometry = new THREE.BufferGeometry();
                        geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
                        geometry.computeVertexNormals();
                        
                        const mesh = new THREE.Mesh(geometry, shearMaterial);
                        mesh.userData.isModelObject = true;
                        threeScene.add(mesh);
                        
                        // Outline
                        const outlinePoints = [p1, v1P, v2P, p2, p1];
                        const outlineGeometry = new THREE.BufferGeometry().setFromPoints(outlinePoints);
                        const outline = new THREE.Line(outlineGeometry, shearLineMaterial);
                        outline.userData.isModelObject = true;
                        threeScene.add(outline);
                    });
                }
            }
            
            // ===== 3D LABELS (Node IDs, Element IDs, Section Labels, Coordinates) =====
            const baseLabelScale = Math.max(modelSize * 0.015, 0.08);
            const beamLabelScale = baseLabelScale * (window.labelSizes?.beam || 1.0);
            const loadLabelScale = baseLabelScale * (window.labelSizes?.load || 1.0);
            const coordLabelScale = baseLabelScale * (window.labelSizes?.coord || 1.0);
            
            // Node ID Labels
            if (view.showNodeIds) {
                Object.entries(model.nodes).forEach(([id, node]) => {
                    const labelSprite = createTextSprite(`N${id}`, '#38bdf8', coordLabelScale);
                    labelSprite.position.set(node.x, node.y, 0.05);
                    labelSprite.userData.isModelObject = true;
                    threeScene.add(labelSprite);
                });
            }
            
            // Node Coordinates Labels
            if (view.showNodeCoords) {
                Object.entries(model.nodes).forEach(([id, node]) => {
                    const coordText = `(${node.x.toFixed(2)}, ${node.y.toFixed(2)})`;
                    const labelSprite = createTextSprite(coordText, '#94a3b8', coordLabelScale * 0.7);
                    const offsetZ = view.showNodeIds ? -0.02 : 0.05;
                    labelSprite.position.set(node.x, node.y - coordLabelScale * 2, offsetZ);
                    labelSprite.userData.isModelObject = true;
                    threeScene.add(labelSprite);
                });
            }
            
            // Element ID Labels
            if (view.showElemIds) {
                Object.entries(model.elements).forEach(([id, elem]) => {
                    const n1 = model.nodes[elem.n1];
                    const n2 = model.nodes[elem.n2];
                    if (!n1 || !n2) return;
                    
                    const midX = (n1.x + n2.x) / 2;
                    const midY = (n1.y + n2.y) / 2;
                    
                    const labelSprite = createTextSprite(`E${id}`, '#f59e0b', beamLabelScale);
                    labelSprite.position.set(midX, midY, 0.08);
                    labelSprite.userData.isModelObject = true;
                    threeScene.add(labelSprite);
                });
            }
            
            // Section Labels (Beam labels)
            if (view.showLabels) {
                Object.entries(model.elements).forEach(([id, elem]) => {
                    const n1 = model.nodes[elem.n1];
                    const n2 = model.nodes[elem.n2];
                    if (!n1 || !n2) return;
                    
                    const midX = (n1.x + n2.x) / 2;
                    const midY = (n1.y + n2.y) / 2;
                    const offsetY = view.showElemIds ? -beamLabelScale * 1.5 : 0;
                    
                    // Kesiti olmayan kirise 3B etikette 'HP200x10' yazmak,
                    // olmayan bir secimi varmis gibi gostermek demek. Kesit
                    // yoksa etiket hic basilmaz - sessiz, ama yalan degil.
                    if (!elem.section) return;
                    const labelSprite = createTextSprite(elem.section, '#22c55e', beamLabelScale);
                    labelSprite.position.set(midX, midY + offsetY * 0.05, 0.06);
                    labelSprite.userData.isModelObject = true;
                    threeScene.add(labelSprite);
                });
            }

            // Kullanici calisma duzlemleri (planes.js). Model sinirlarini
            // kullandiklari icin sahne kurulduktan SONRA cizilirler.
            if (typeof calismaDuzlemleriniCiz === 'function') calismaDuzlemleriniCiz();
            if (typeof duzlemSeritleriniTazele === 'function') duzlemSeritleriniTazele();

            // Sahne SECIMSIZ kuruldu; mevcut secimi simdi bas.
            secimVurgusunuTazele();
        }
        
        // Helper function to create text sprite
        function createTextSprite(text, color, scale) {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            // Larger canvas for better quality and longer text
            canvas.width = 512;
            canvas.height = 128;
            
            // Transparent background - no mask
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            // Text with outline for readability
            ctx.font = 'bold 48px Inter, Arial, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            
            // Dark outline/stroke
            ctx.strokeStyle = 'rgba(15, 23, 42, 0.95)';
            ctx.lineWidth = 6;
            ctx.strokeText(text, canvas.width / 2, canvas.height / 2);
            
            // Colored fill
            ctx.fillStyle = color;
            ctx.fillText(text, canvas.width / 2, canvas.height / 2);
            
            const texture = new THREE.CanvasTexture(canvas);
            const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
            const sprite = new THREE.Sprite(material);
            sprite.scale.set(scale * 6, scale * 1.5, 1);
            
            return sprite;
        }
        window.gridSettings = {
            sizeX: 50,
            sizeY: 50,
            spacing: 1,
            originX: 0,
            originY: 0
        };
        
        function updateGridSettings() {
            const sizeX = parseFloat(document.getElementById('gridSizeX')?.value) || 50;
            const sizeY = parseFloat(document.getElementById('gridSizeY')?.value) || 50;
            const spacing = parseFloat(document.getElementById('gridSpacing')?.value) || 1;
            const originX = parseFloat(document.getElementById('gridOriginX')?.value) || 0;
            const originY = parseFloat(document.getElementById('gridOriginY')?.value) || 0;
            
            window.gridSettings = { sizeX, sizeY, spacing, originX, originY };
            
            recreateGrid();
        }
        

        // Izgara XY duzleminde kuruluyor ve orada kaliyordu; XZ ya da YZ
        // gorunusune gecince ekranda bir cizgiye dusup kayboluyordu. Bu bir 3B
        // kiris programi: Z yonunde calisilabilmesi icin izgaranin da o
        // duzleme donmesi gerekiyor. Grup XY'de kuruldugu icin dondurmek yeter.
        //
        // Serbest 3B gorunuste izgara zeminde (XY) kalir - referans duzlem odur.
        // Bir calisma duzlemi etkinse izgara onun uzerine oturur.
        // Uzerinde calisilan duzlem TEK yerden belirlenir: izgara ile fare
        // girdisi ayri ayri karar verirse birbirini tutmaz - izgara XZ'de
        // gorunurken tiklama XY'ye dusuyordu.
        //
        // Acik bir calisma duzlemi varsa o gecerlidir; yoksa gorunus belirler.
        // Serbest 3B'de zemin (XY) kullanilir.
        function aktifCalismaDuzlemi() {
            if (typeof activeWorkPlane !== 'undefined' && activeWorkPlane) {
                return { axis: activeWorkPlane.axis, offset: activeWorkPlane.offset || 0 };
            }
            if (typeof currentViewMode !== 'undefined') {
                if (currentViewMode === 'front') return { axis: 'Y', offset: 0 };
                if (currentViewMode === 'side') return { axis: 'X', offset: 0 };
            }
            return { axis: 'Z', offset: 0 };
        }

        function izgarayiDuzlemeGore() {
            const g = window.gridHelper;
            if (!g || !window.gridSettings) return;

            const { originX, originY } = window.gridSettings;
            const AYIRMA = 0.01;   // z-fighting olmasin diye kilpayi geri cek

            const duzlem = aktifCalismaDuzlemi();
            const eksen = duzlem.axis, kayma = duzlem.offset;

            if (eksen === 'Z') {
                // XY duzlemi: grup zaten boyle kuruldu.
                g.rotation.set(0, 0, 0);
                g.position.set(originX, originY, kayma - AYIRMA);
            } else if (eksen === 'Y') {
                // XZ duzlemi. X ekseni etrafinda 90 derece: yerel (x,y,0)
                // dunyada (x,0,y) olur.
                g.rotation.set(Math.PI / 2, 0, 0);
                g.position.set(originX, kayma - AYIRMA, 0);
            } else {
                // YZ duzlemi. Y ekseni etrafinda 90 derece: yerel (x,y,0)
                // dunyada (0,y,-x) olur.
                g.rotation.set(0, Math.PI / 2, 0);
                g.position.set(kayma - AYIRMA, originY, 0);
            }
        }

        function recreateGrid() {
            if (!threeInitialized || !threeScene) return;
            
            const { sizeX, sizeY, spacing, originX, originY } = window.gridSettings;
            
            // Remove old grid
            if (window.gridHelper) {
                threeScene.remove(window.gridHelper);
                window.gridHelper.geometry?.dispose();
                window.gridHelper.material?.dispose();
            }
            
            // Create new grid group
            const gridGroup = new THREE.Group();
            gridGroup.isGridHelper = true;
            
            const isLight = document.body.classList.contains('light-mode');
            const majorColor = isLight ? 0xcbd5e1 : 0x334155;
            const minorColor = isLight ? 0xe2e8f0 : 0x1e293b;
            
            // Calculate divisions
            const divisionsX = Math.round(sizeX / spacing);
            const divisionsY = Math.round(sizeY / spacing);
            
            // Create lines
            const majorMaterial = new THREE.LineBasicMaterial({ color: majorColor, transparent: true, opacity: 0.6 });
            const minorMaterial = new THREE.LineBasicMaterial({ color: minorColor, transparent: true, opacity: 0.4 });
            
            // X direction lines (parallel to Y)
            for (let i = 0; i <= divisionsX; i++) {
                const x = -sizeX/2 + i * spacing;
                const isMajor = i % 5 === 0;
                
                const geometry = new THREE.BufferGeometry();
                const points = [
                    new THREE.Vector3(x, -sizeY/2, 0),
                    new THREE.Vector3(x, sizeY/2, 0)
                ];
                geometry.setFromPoints(points);
                
                const line = new THREE.Line(geometry, isMajor ? majorMaterial : minorMaterial);
                gridGroup.add(line);
            }
            
            // Y direction lines (parallel to X)
            for (let j = 0; j <= divisionsY; j++) {
                const y = -sizeY/2 + j * spacing;
                const isMajor = j % 5 === 0;
                
                const geometry = new THREE.BufferGeometry();
                const points = [
                    new THREE.Vector3(-sizeX/2, y, 0),
                    new THREE.Vector3(sizeX/2, y, 0)
                ];
                geometry.setFromPoints(points);
                
                const line = new THREE.Line(geometry, isMajor ? majorMaterial : minorMaterial);
                gridGroup.add(line);
            }
            
            // Position grid at origin
            gridGroup.position.set(originX, originY, 0);
            window.gridHelper = gridGroup;
            
            window.gridHelper = gridGroup;
            window.gridHelper.visible = view.showGrid;
            threeScene.add(window.gridHelper);
            izgarayiDuzlemeGore();
            
            if (threeRenderer && threeCamera) {
                threeRenderer.render(threeScene, threeCamera);
            }
        }
        
        function centerGridOnModel() {
            if (Object.keys(model.nodes).length === 0) {
                showToast('No model to center on', true);
                return;
            }
            
            // Calculate model center
            const nodes = Object.values(model.nodes);
            const xs = nodes.map(n => n.x);
            const ys = nodes.map(n => n.y);
            const centerX = (Math.min(...xs) + Math.max(...xs)) / 2;
            const centerY = (Math.min(...ys) + Math.max(...ys)) / 2;
            
            // Update inputs
            document.getElementById('gridOriginX').value = centerX.toFixed(1);
            document.getElementById('gridOriginY').value = centerY.toFixed(1);
            
            updateGridSettings();
            showToast(`Grid centered at (${centerX.toFixed(1)}, ${centerY.toFixed(1)})`);
        }
        
        function fitGridToModel() {
            if (Object.keys(model.nodes).length === 0) {
                showToast('No model to fit', true);
                return;
            }
            
            // Calculate model bounds
            const nodes = Object.values(model.nodes);
            const xs = nodes.map(n => n.x);
            const ys = nodes.map(n => n.y);
            const minX = Math.min(...xs);
            const maxX = Math.max(...xs);
            const minY = Math.min(...ys);
            const maxY = Math.max(...ys);
            
            const modelWidth = maxX - minX;
            const modelHeight = maxY - minY;
            const centerX = (minX + maxX) / 2;
            const centerY = (minY + maxY) / 2;
            
            // Add 20% margin
            const sizeX = Math.max(modelWidth * 1.4, 5);
            const sizeY = Math.max(modelHeight * 1.4, 5);
            
            // Auto-calculate spacing
            const maxDim = Math.max(sizeX, sizeY);
            let spacing = 1;
            if (maxDim > 100) spacing = 5;
            else if (maxDim > 50) spacing = 2;
            else if (maxDim > 20) spacing = 1;
            else if (maxDim > 5) spacing = 0.5;
            else spacing = 0.2;
            
            // Update inputs
            document.getElementById('gridSizeX').value = Math.ceil(sizeX);
            document.getElementById('gridSizeY').value = Math.ceil(sizeY);
            document.getElementById('gridSpacing').value = spacing;
            document.getElementById('gridOriginX').value = centerX.toFixed(1);
            document.getElementById('gridOriginY').value = centerY.toFixed(1);
            
            updateGridSettings();
            showToast(`Grid fitted: ${Math.ceil(sizeX)}×${Math.ceil(sizeY)} m, spacing ${spacing} m`);
        }
        
