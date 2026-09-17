        // ============== COLOR THEME SYSTEM ==============
        
        // Color theme state (current applied theme)
        window.colorTheme = {
            bg: '#0f172a',
            beam: '#3b82f6',
            node: '#22d3ee',
            grid: '#1e3a5f',
            selection: '#fef08a'
        };
        
        // Saved theme (from localStorage, restored on Reset)
        window.savedColorTheme = null;
        
        // Select a color - immediately preview
        function selectColor(type, color) {
            window.colorTheme[type] = color;
            
            // Update swatch active state
            document.querySelectorAll(`.color-swatch[data-color="${type}"]`).forEach(btn => {
                btn.classList.toggle('active', btn.dataset.value === color);
            });
            
            // Immediately apply for preview
            applyColorTheme();
        }
        
        // Apply button - save to localStorage (make permanent)
        function applyColorThemeFromUI() {
            // Save current theme to localStorage
            try {
                localStorage.setItem('grillageColorTheme', JSON.stringify(window.colorTheme));
                window.savedColorTheme = { ...window.colorTheme };
            } catch(e) {}
            
            showToast('Color theme saved');
        }
        
        // For backwards compatibility / programmatic use
        function setColorTheme(type, color) {
            selectColor(type, color);
        }
        
        function applyColorTheme() {
            const theme = window.colorTheme;
            
            // Apply background color
            const threeContainer = document.getElementById('threeContainer');
            if (threeContainer) {
                threeContainer.style.background = theme.bg;
            }
            if (threeScene) {
                threeScene.background = new THREE.Color(theme.bg);
                // acik/koyu mod arka plani belirler; renk temasi izgara/eleman renklerini
                if (typeof applyThemeToScene === 'function') applyThemeToScene();
            }
            
            // Apply grid color - recreate grid with new color
            recreateGridWithColor(theme.grid);
            
            // Rebuild 3D scene with new colors (this ensures beams get new materials)
            if (threeInitialized) {
                update3DScene();
            }
            
            // Force render
            if (threeRenderer && threeScene && threeCamera) {
                threeRenderer.render(threeScene, threeCamera);
            }
        }
        
        function recreateGridWithColor(gridColorHex) {
            if (!threeInitialized || !threeScene) return;
            if (!window.gridSettings) return;
            
            const { sizeX, sizeY, spacing, originX, originY } = window.gridSettings;
            
            // Remove old grid
            if (window.gridHelper) {
                threeScene.remove(window.gridHelper);
                window.gridHelper.traverse(child => {
                    if (child.geometry) child.geometry.dispose();
                    if (child.material) child.material.dispose();
                });
            }
            
            // Create new grid group
            const gridGroup = new THREE.Group();
            gridGroup.isGridHelper = true;
            
            const gridColor = new THREE.Color(gridColorHex);
            const majorColor = gridColor;
            const minorColor = gridColor.clone().multiplyScalar(0.6);
            
            // Calculate divisions
            const divisionsX = Math.round(sizeX / spacing);
            const divisionsY = Math.round(sizeY / spacing);
            
            // Create lines
            // Opaklik piksel oranina gore (canvas3d.js -> izgaraOpakligi).
            const majorMaterial = new THREE.LineBasicMaterial({ color: majorColor, transparent: true, opacity: izgaraOpakligi(0.6) });
            const minorMaterial = new THREE.LineBasicMaterial({ color: minorColor, transparent: true, opacity: izgaraOpakligi(0.4) });
            
            // X direction lines
            for (let i = 0; i <= divisionsX; i++) {
                const x = -sizeX/2 + i * spacing;
                const isMajor = i % 5 === 0;
                const geometry = new THREE.BufferGeometry();
                geometry.setFromPoints([
                    new THREE.Vector3(x, -sizeY/2, 0),
                    new THREE.Vector3(x, sizeY/2, 0)
                ]);
                gridGroup.add(new THREE.Line(geometry, isMajor ? majorMaterial : minorMaterial));
            }
            
            // Y direction lines
            for (let i = 0; i <= divisionsY; i++) {
                const y = -sizeY/2 + i * spacing;
                const isMajor = i % 5 === 0;
                const geometry = new THREE.BufferGeometry();
                geometry.setFromPoints([
                    new THREE.Vector3(-sizeX/2, y, 0),
                    new THREE.Vector3(sizeX/2, y, 0)
                ]);
                gridGroup.add(new THREE.Line(geometry, isMajor ? majorMaterial : minorMaterial));
            }
            
            window.gridHelper = gridGroup;
            threeScene.add(gridGroup);
            // Konum ve donme aktif duzleme gore verilir (canvas3d.js).
            if (typeof izgarayiDuzlemeGore === 'function') izgarayiDuzlemeGore();
            else gridGroup.position.set(originX, originY, -0.01);
        }
        
        function updateBeamNodeColors() {
            if (!threeScene) return;
            
            const theme = window.colorTheme;
            const beamColor = new THREE.Color(theme.beam);
            const nodeColor = new THREE.Color(theme.node);
            const selectionColor = new THREE.Color(theme.selection);
            
            threeScene.traverse((obj) => {
                if (obj.userData.isModelObject) {
                    if (obj.userData.elemId && obj.material) {
                        // It's a beam
                        const isSelected = selectedElements.has(obj.userData.elemId);
                        if (!isSelected && !obj.userData.isStressColored) {
                            obj.material.color = beamColor;
                            obj.material.emissive = beamColor.clone().multiplyScalar(0.2);
                        } else if (isSelected) {
                            obj.material.color = selectionColor;
                            obj.material.emissive = selectionColor.clone().multiplyScalar(0.3);
                        }
                    }
                    if (obj.userData.nodeId && obj.material) {
                        // It's a node
                        const isSelected = selectedNodes.has(obj.userData.nodeId);
                        if (!isSelected) {
                            obj.material.color = nodeColor;
                            obj.material.emissive = nodeColor.clone().multiplyScalar(0.3);
                        } else {
                            obj.material.color = selectionColor;
                            obj.material.emissive = selectionColor.clone().multiplyScalar(0.4);
                        }
                    }
                }
            });
        }
        
        function resetColorTheme() {
            const defaults = {
                bg: '#0f172a',
                beam: '#3b82f6',
                node: '#22d3ee',
                grid: '#1e3a5f',
                selection: '#fef08a'
            };
            
            window.colorTheme = { ...defaults };
            window.savedColorTheme = { ...defaults };
            
            // Update all swatches
            Object.keys(window.colorTheme).forEach(type => {
                document.querySelectorAll(`.color-swatch[data-color="${type}"]`).forEach(btn => {
                    btn.classList.toggle('active', btn.dataset.value === window.colorTheme[type]);
                });
            });
            
            applyColorTheme();
            
            // Clear localStorage
            try {
                localStorage.removeItem('grillageColorTheme');
            } catch(e) {}
            
            showToast('Colors reset to default');
        }
        
        function loadColorTheme() {
            try {
                const saved = localStorage.getItem('grillageColorTheme');
                if (saved) {
                    const parsed = safeJsonParse(saved, null);
                    if (parsed) {
                        window.colorTheme = { ...window.colorTheme, ...parsed };
                    }
                    window.savedColorTheme = { ...window.colorTheme };
                    
                    // Update all swatches
                    Object.keys(window.colorTheme).forEach(type => {
                        document.querySelectorAll(`.color-swatch[data-color="${type}"]`).forEach(btn => {
                            btn.classList.toggle('active', btn.dataset.value === window.colorTheme[type]);
                        });
                    });
                } else {
                    window.savedColorTheme = { ...window.colorTheme };
                }
            } catch(e) {
                window.savedColorTheme = { ...window.colorTheme };
            }
        }
        
        function fit3DView() {
            if (!threeInitialized) return;

            // Z GOZ ARDI EDILMIYOR. Eskiden cerceve yalnizca x-y sinirlarindan
            // hesaplaniyor, hedef de hep z = 0 aliniyordu: bu bir 3B kiris
            // programi, z = 5000'deki bir kat ya da o yukseklikteki bir calisma
            // duzlemi ekranin disinda kaliyordu.
            const dugumler = Object.values(model.nodes);
            const duzlemler = (typeof calismaDuzlemleri === 'function') ? calismaDuzlemleri() : [];

            if (dugumler.length === 0 && duzlemler.length === 0) {
                threeControls.setTarget(0, 0, 0);
                threeControls.setRadius(10);
                return;
            }

            const enAz = { x: Infinity, y: Infinity, z: Infinity };
            const enCok = { x: -Infinity, y: -Infinity, z: -Infinity };
            const kat = (e, d) => { enAz[e] = Math.min(enAz[e], d); enCok[e] = Math.max(enCok[e], d); };

            dugumler.forEach(n => { kat('x', n.x); kat('y', n.y); kat('z', n.z || 0); });

            // Calisma duzlemleri de cerceveye girer: yeni bir duzlem
            // olusturuldugunda "Fit" onu da gostersin.
            const EKSEN = { X: 'x', Y: 'y', Z: 'z' };
            duzlemler.forEach(d => { if (EKSEN[d.axis]) kat(EKSEN[d.axis], d.offset); });

            ['x', 'y', 'z'].forEach(e => {
                if (!isFinite(enAz[e])) { enAz[e] = 0; enCok[e] = 0; }
            });

            const size = Math.max(enCok.x - enAz.x, enCok.y - enAz.y, enCok.z - enAz.z);

            threeControls.setTarget((enAz.x + enCok.x) / 2,
                                    (enAz.y + enCok.y) / 2,
                                    (enAz.z + enCok.z) / 2);

            // Set radius with padding (1.5x for comfortable view)
            const radius = Math.max(size * 1.5, 2);
            threeControls.setRadius(radius);
        }
        
        let animating3D = false;
        
        function animate3D() {
            if (!threeInitialized || !threeRenderer || !threeScene || !threeCamera) return;
            if (animating3D) return;  // Already running
            
            animating3D = true;
            
            function renderLoop() {
                if (!threeInitialized) {
                    animating3D = false;
                    return;
                }
                requestAnimationFrame(renderLoop);
                if (typeof deformeAnimAdim === 'function') deformeAnimAdim(performance.now());
                threeRenderer.render(threeScene, threeCamera);
                if (typeof renderGizmo === 'function') renderGizmo();
            }
            
            renderLoop();
        }
        
        function setView(type) {
            // Wrapper for backward compatibility - use setViewMode
            setViewMode(type);
        }
        
        // Toggle 3D Section view - switches to 3D and enables section display
        function toggle3DSection() {
            const btn = document.getElementById('btnSection');
            
            // Toggle section visibility
            view.showSection = !view.showSection;
            if (btn) {
                if (view.showSection) btn.classList.add('active');
                else btn.classList.remove('active');
            }
            
            // If turning on and not in 3D, switch to 3D
            if (view.showSection && currentViewMode !== '3d') {
                setView('3d');
                showToast('3D Section view enabled - showing beam cross-sections');
            } else if (currentViewMode === '3d') {
                update3DScene();
                showToast(view.showSection ? 'Section view ON' : 'Section view OFF');
            } else {
                showToast('Section view only works in 3D mode');
            }
        }
        
        function toggleStressVisualization() {
            if (!results) {
                showToast('No results - run SOLVE first', true);
                return;
            }
            
            view.showStress = !view.showStress;
            
            const btn = document.getElementById('btnStressViz');
            const legend = document.getElementById('stressLegend');
            
            if (view.showStress) {
                if (btn) btn.classList.add('active');
                if (legend) legend.style.display = 'block';
                updateStressLegend();
                showToast('Stress visualization ON');
            } else {
                if (btn) btn.classList.remove('active');
                if (legend) legend.style.display = 'none';
                showToast('Stress visualization OFF');
            }
            
            // Redraw
            if (currentViewMode === '3d') {
                update3DScene();
            } else {
                draw();
            }
        }
        
        function toggleMomentDiagram() {
            if (!results) {
                showToast('No results - run SOLVE first', true);
                return;
            }
            
            view.showMoment = !view.showMoment;
            if (view.showMoment) view.showShear = false; // Only one at a time
            
            const btnM = document.getElementById('btnMomentViz');
            const btnV = document.getElementById('btnShearViz');
            
            if (view.showMoment) {
                if (btnM) btnM.classList.add('active');
                if (btnV) btnV.classList.remove('active');
                
                // Switch to 3D if not already (diagrams only in 3D)
                if (currentViewMode !== '3d') {
                    setView('3d');
                    showToast('Moment diagram ON - switched to 3D view');
                } else {
                    update3DScene();
                    showToast('Moment diagram ON [M]');
                }
            } else {
                if (btnM) btnM.classList.remove('active');
                showToast('Moment diagram OFF');
                if (currentViewMode === '3d') {
                    update3DScene();
                }
            }
        }
        
        function toggleShearDiagram() {
            if (!results) {
                showToast('No results - run SOLVE first', true);
                return;
            }
            
            view.showShear = !view.showShear;
            if (view.showShear) view.showMoment = false; // Only one at a time
            
            const btnM = document.getElementById('btnMomentViz');
            const btnV = document.getElementById('btnShearViz');
            
            if (view.showShear) {
                if (btnV) btnV.classList.add('active');
                if (btnM) btnM.classList.remove('active');
                
                // Switch to 3D if not already (diagrams only in 3D)
                if (currentViewMode !== '3d') {
                    setView('3d');
                    showToast('Shear diagram ON - switched to 3D view');
                } else {
                    update3DScene();
                    showToast('Shear diagram ON [V]');
                }
            } else {
                if (btnV) btnV.classList.remove('active');
                showToast('Shear diagram OFF');
                if (currentViewMode === '3d') {
                    update3DScene();
                }
            }
        }
        
        function updateDiagramScale(value) {
            view.diagramScale = parseFloat(value);
            document.getElementById('diagramScaleValue').textContent = value + 'x';
            
            if (currentViewMode === '3d') {
                update3DScene();
            } else {
                draw();
            }
        }
        
        
        function applyLoadCombination() {
            const lcSelect = document.getElementById('loadCombSelect');
            if (!lcSelect) return;
            
            const lc = lcSelect.value;
            // The factors themselves live with the solver (currentLoadFactors), applied per
            // load category. This used to set a variable nothing ever read, so every
            // combination gave identical results.
            model.activeCombination = lc;
            yukSecicileriniTazele();
            showToast('Solving ' + kombinasyonEtiketi(etkinKombinasyon()));
            
            // Re-solve with new factor
            solveModel();
        }
        
        // Lejant SINIRA gore olceklenir - kirislerin rengi de oyle.
        // Eskiden etiketler results.maxVonMises'i yaziyordu (0 / max/2 / max),
        // renkler ise sigmaLimit'e gore boyaniyordu: lejant "1563 MPa = ust"
        // derken kiris 235'te kirmiziya donuyordu. Cubuk da tek renkti.
        function updateStressLegend() {
            if (!results) return;

            const maxStress = results.maxVonMises || 0;
            const sinir = parseFloat(document.getElementById('sigmaLimit')?.value) || 355;
            const grade = document.getElementById('steelGrade')?.value;
            const yieldStress = (MATERIALS[grade] ? MATERIALS[grade].yield / 1e6 : 355);

            const yaz = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
            yaz('legendMax', 'Limit ' + sinir.toFixed(0) + ' MPa');
            yaz('legendMid', (sinir / 2).toFixed(0) + ' MPa');
            // Asim ayri satirda: tek satir kutudan tasiyordu.
            const maxEl0 = document.getElementById('legendMaxVal');
            if (maxEl0) maxEl0.innerHTML = maxStress.toFixed(1) + ' MPa' +
                (maxStress >= sinir ? '<br>' + (maxStress / sinir * 100).toFixed(0) + '% of limit - OVER' : '');
            yaz('legendYield', yieldStress + ' MPa');

            // Cubuk: canvas3d'deki duraklarin aynisi; ustte "sinir asildi" bandi.
            const cubuk = document.getElementById('legendBar');
            if (cubuk) {
                cubuk.style.background = 'linear-gradient(to top, rgb(34,197,94) 0%, rgb(234,179,8) 50%, rgb(249,115,22) 80%, rgb(220,38,38) 100%)';
            }
            const band = document.getElementById('legendOver');
            if (band) {
                band.style.display = 'block';
                band.style.background = maxStress >= sinir ? '#ff0000' : 'rgba(255,0,0,0.25)';
                band.title = 'Above limit';
            }
            const maxEl = document.getElementById('legendMaxVal');
            if (maxEl) maxEl.style.color = maxStress >= sinir ? '#ff4d4d' : 'var(--success)';
        }

        function getStressColor(stress, maxStress) {
            // Returns color based on stress ratio (0 to 1)
            // Green (low) -> Yellow (medium) -> Orange -> Red (high)
            if (!maxStress || maxStress === 0) return 'var(--success)';
            
            const ratio = Math.min(stress / maxStress, 1);
            
            if (ratio < 0.25) {
                // Green to Lime
                const t = ratio / 0.25;
                return lerpColor('var(--success)', '#84cc16', t);
            } else if (ratio < 0.5) {
                // Lime to Yellow
                const t = (ratio - 0.25) / 0.25;
                return lerpColor('#84cc16', 'var(--warning)', t);
            } else if (ratio < 0.75) {
                // Yellow to Orange
                const t = (ratio - 0.5) / 0.25;
                return lerpColor('var(--warning)', 'var(--warning)', t);
            } else {
                // Orange to Red
                const t = (ratio - 0.75) / 0.25;
                return lerpColor('var(--warning)', 'var(--danger)', t);
            }
        }
        
        function lerpColor(color1, color2, t) {
            // Linear interpolation between two hex colors
            const c1 = hexToRgb(color1);
            const c2 = hexToRgb(color2);
            
            const r = Math.round(c1.r + (c2.r - c1.r) * t);
            const g = Math.round(c1.g + (c2.g - c1.g) * t);
            const b = Math.round(c1.b + (c2.b - c1.b) * t);
            
            return `rgb(${r},${g},${b})`;
        }
        
        function hexToRgb(hex) {
            const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
            return result ? {
                r: parseInt(result[1], 16),
                g: parseInt(result[2], 16),
                b: parseInt(result[3], 16)
            } : { r: 0, g: 0, b: 0 };
        }
        
        function toggleDisplay(what) {
            const btn = document.getElementById('btn' + what.charAt(0).toUpperCase() + what.slice(1));
            
            if (what === 'grid') {
                view.showGrid = !view.showGrid;
                if (btn) {
                    if (view.showGrid) btn.classList.add('active');
                    else btn.classList.remove('active');
                }
            }
            if (what === 'beams') {
                view.showBeams = !view.showBeams;
                if (btn) {
                    if (view.showBeams) btn.classList.add('active');
                    else btn.classList.remove('active');
                }
            }
            if (what === 'nodes') {
                view.showNodes = !view.showNodes;
                if (btn) {
                    if (view.showNodes) btn.classList.add('active');
                    else btn.classList.remove('active');
                }
            }
            if (what === 'loads') {
                view.showLoads = !view.showLoads;
                if (btn) {
                    if (view.showLoads) btn.classList.add('active');
                    else btn.classList.remove('active');
                }
            }
            if (what === 'labels') {
                view.showLabels = !view.showLabels;
                const chk = document.getElementById('chkShowLabels');
                if (chk) chk.checked = view.showLabels;
                showToast(`Section Labels: ${view.showLabels ? 'ON' : 'OFF'}`);
            }
            if (what === 'nodeIds') {
                view.showNodeIds = !view.showNodeIds;
                const chk = document.getElementById('chkShowNodeIds');
                if (chk) chk.checked = view.showNodeIds;
                showToast(`Node IDs: ${view.showNodeIds ? 'ON' : 'OFF'}`);
            }
            if (what === 'nodeCoords') {
                view.showNodeCoords = !view.showNodeCoords;
                const chk = document.getElementById('chkShowNodeCoords');
                if (chk) chk.checked = view.showNodeCoords;
                showToast(`Node Coords: ${view.showNodeCoords ? 'ON' : 'OFF'}`);
            }
            if (what === 'elemIds') {
                view.showElemIds = !view.showElemIds;
                const chk = document.getElementById('chkShowElemIds');
                if (chk) chk.checked = view.showElemIds;
                showToast(`Element IDs: ${view.showElemIds ? 'ON' : 'OFF'}`);
            }
            if (what === 'deformed') {
                // Check if results exist
                if (!results && !view.showDeformed) {
                    showToast('Run SOLVE first to see deformed shape', true);
                    return;
                }
                view.showDeformed = !view.showDeformed;
                if (btn) {
                    btn.classList.remove('active', 'success');
                    if (view.showDeformed) btn.classList.add('success');
                }
                // Statik deforme sekil ile animasyon ayni anda degil.
                if (view.showDeformed && typeof deformeAnimAcikMi === 'function' && deformeAnimAcikMi()) deformeAnimToggle();
                
                // Show/hide exaggeration control
                const exagControl = document.getElementById('exaggerationControl');
                if (exagControl) {
                    const animAcik = (typeof deformeAnimAcikMi === 'function') && deformeAnimAcikMi();
                    exagControl.style.display = (view.showDeformed || animAcik) ? 'flex' : 'none';
                }
            }
            if (what === 'section') {
                view.showSection = !view.showSection;
                if (btn) {
                    if (view.showSection) btn.classList.add('active');
                    else btn.classList.remove('active');
                }
            }
            
            if (currentViewMode === '3d') {
                update3DScene();
            } else {
                draw();
            }
        }
        
        function updateDeformScale(value) {
            view.deformationScale = parseInt(value);
            document.getElementById('deformScaleValue').textContent = value + '×';
            
            if (view.showDeformed) {
                if (currentViewMode === '3d') {
                    update3DScene();
                } else {
                    draw();
                }
            }
        }
        
