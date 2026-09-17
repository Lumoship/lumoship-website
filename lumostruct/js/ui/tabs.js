        // ============== MAIN TAB SWITCHING ==============
        // Results sekmesinden cikinca animasyon durur, gerilme/deforme/moment/
        // kesme boyamasi kalkar (kullanici: "model sekmesine gectim, animasyon
        // durmali, sonuc renklendirmesi gitmeli"); Results'a donunce ayni
        // gorunum geri gelir (sonuc hala gecerliyse).
        let sonucGorunumYedek = null;
        function sonucGorunumunuKapat() {
            const yedek = {
                anim: (typeof deformeAnimAcikMi === 'function') && deformeAnimAcikMi(),
                deformed: !!view.showDeformed, stress: !!view.showStress, moment: !!view.showMoment, shear: !!view.showShear
            };
            if (yedek.anim && typeof deformeAnimToggle === 'function') deformeAnimToggle();
            view.showDeformed = false; view.showStress = false; view.showMoment = false; view.showShear = false;
            const bd = document.getElementById('btnDeformed'); if (bd) bd.classList.remove('active', 'success');
            ['btnStressViz', 'btnMomentViz', 'btnShearViz'].forEach(id => { const b = document.getElementById(id); if (b) b.classList.remove('active'); });
            const exag = document.getElementById('exaggerationControl'); if (exag) exag.style.display = 'none';
            return yedek;
        }
        function sonucGorunumunuGeriGetir(yedek) {
            if (!yedek || !results || modelChangedAfterSolve) return;
            view.showDeformed = yedek.deformed; view.showStress = yedek.stress; view.showMoment = yedek.moment; view.showShear = yedek.shear;
            const bd = document.getElementById('btnDeformed'); if (bd && yedek.deformed) bd.classList.add('success');
            const bs = document.getElementById('btnStressViz'); if (bs && yedek.stress) bs.classList.add('active');
            const bm = document.getElementById('btnMomentViz'); if (bm && yedek.moment) bm.classList.add('active');
            const bk = document.getElementById('btnShearViz'); if (bk && yedek.shear) bk.classList.add('active');
            const exag = document.getElementById('exaggerationControl'); if (exag && yedek.deformed) exag.style.display = 'flex';
            if (yedek.anim && typeof deformeAnimToggle === 'function' && !deformeAnimAcikMi()) deformeAnimToggle();
        }

        function switchMainTab(tabName) {
            const oncekiSekme = (document.querySelector('.main-tab.active') || {}).id || '';
            const resultsTanCikis = /Results$/.test(oncekiSekme) && tabName !== 'results';
            const resultsAGiris = !/Results$/.test(oncekiSekme) && tabName === 'results';
            if (resultsTanCikis) sonucGorunumYedek = sonucGorunumunuKapat();
            // Update tab buttons
            document.querySelectorAll('.main-tab').forEach(t => t.classList.remove('active'));
            document.getElementById(`mainTab${tabName.charAt(0).toUpperCase() + tabName.slice(1)}`).classList.add('active');
            
            // Update tab contents
            document.querySelectorAll('.main-tab-content').forEach(c => c.classList.remove('active'));
            document.getElementById(`tabContent${tabName.charAt(0).toUpperCase() + tabName.slice(1)}`).classList.add('active');
            
            // Results sekmesi salt okunur (css: body.sonuc-kipi)
            document.body.classList.toggle('sonuc-kipi', tabName === 'results');

            // Control results visualization based on tab
            const wasShowingResults = showResultsVisualization;
            showResultsVisualization = (tabName === 'results') && results && !modelChangedAfterSolve;
            
            // Show/hide stress legend based on tab - ONLY show in Results tab
            const stressLegend = document.getElementById('stressLegend');
            if (stressLegend) {
                if (tabName === 'results' && results && results.elementResults) {
                    stressLegend.style.display = 'block';
                    // Update legend values
                    updateStressLegend();
                } else {
                    stressLegend.style.display = 'none';
                }
            }
            
            // Show/hide results bottom panel
            const bottomPanel = document.getElementById('resultsBottomPanel');
            if (bottomPanel) {
                // Panel COZUMDEN ONCE de acilir: Beams / Nodes / Profiles /
                // Beam loads / Node loads sekmeleri modelin kendisini listeler,
                // bunlar icin analiz gerekmiyor. Yanit sekmeleri cozum yoksa
                // "Run Solve" der.
                // 'block' CSS'teki flex sutununu eziyordu: icerik alani (overflow:auto)
                // yukseklik siniri alamayip panelin altindan tasiyor, tablo satirlari
                // komut cubugunun uzerine biniyordu. Panel flex kalir.
                bottomPanel.style.display = (tabName === 'results') ? 'flex' : 'none';
                if (tabName === 'results' && typeof updateResultsBottomPanel === 'function') {
                    updateResultsBottomPanel();
                }
                if (typeof syncResultsPanelSpace === 'function') syncResultsPanelSpace();
            }
            
            if (resultsAGiris && sonucGorunumYedek) { sonucGorunumunuGeriGetir(sonucGorunumYedek); sonucGorunumYedek = null; }

            // Redraw if visualization state changed (or a result view was switched off / restored)
            if (wasShowingResults !== showResultsVisualization || resultsTanCikis || resultsAGiris) {
                if (currentViewMode === '3d') {
                    update3DScene();
                } else {
                    draw();
                }
                updateEntityInfoPanel();
            }
        }
        
        // ============== ENTITY INFO PANEL ==============
        let currentInfoNode = null;
        let currentInfoBeam = null;
        
        // Secim yokken sag sutun bos duruyordu. Bunun yerine modelin kendisini ozetler:
        // ne kadar celik, nerede mesnet, hangi profiller.
        function updateEntityInfoSummary() {
            const box = document.getElementById('entityInfoSummary');
            if (!box) return;

            const nodes = model.nodes || {};
            const elements = model.elements || {};
            const nodeIds = Object.keys(nodes);
            const elemList = Object.values(elements);

            if (nodeIds.length === 0) { box.style.display = 'none'; return; }
            box.style.display = 'block';

            let totalLength = 0, mass = 0;
            const profiles = new Set();
            let loadedBeams = 0;
            elemList.forEach(el => {
                const n1 = nodes[el.n1], n2 = nodes[el.n2];
                if (!n1 || !n2) return;
                const L = Math.sqrt(Math.pow(n2.x - n1.x, 2) + Math.pow(n2.y - n1.y, 2) +
                                    Math.pow((n2.z || 0) - (n1.z || 0), 2));
                totalLength += L;
                const sec = SECTIONS[el.section];
                if (sec && sec.A > 0) mass += sec.A * L * 7850;      // kg
                // RIGID profil degil: sayilmaz.
                if (el.section && !(typeof kesitRijitMi === 'function' && kesitRijitMi(el.section))) profiles.add(el.section);
                if ((el.lineLoads && el.lineLoads.length > 0) || (el.pointLoads && el.pointLoads.length > 0)) loadedBeams++;
            });

            const xs = nodeIds.map(id => nodes[id].x);
            const ys = nodeIds.map(id => nodes[id].y);
            const dx = Math.max(...xs) - Math.min(...xs);
            const dy = Math.max(...ys) - Math.min(...ys);

            const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
            set('sumNodes', nodeIds.length);
            set('sumBeams', elemList.length);
            set('sumLength', totalLength.toFixed(1) + ' m');
            set('sumWeight', mass >= 1000 ? (mass / 1000).toFixed(2) + ' t' : mass.toFixed(0) + ' kg');
            set('sumProfiles', profiles.size);
            set('sumSupports', Object.keys(model.constraints || {}).length);
            // Basinc yamasindan yuk alan kirisler de "yuklu" sayilir
            const basincli = (typeof basincYukleriniHazirla === 'function' && (model.pressure || []).length) ? Object.keys(basincYukleriniHazirla()).length : 0;
            set('sumLoadedBeams', loadedBeams + (basincli ? ' (+' + basincli + ' by pressure)' : ''));
            set('sumPointLoads', (model.loads || []).length);
            set('sumExtents', dx.toFixed(1) + ' x ' + dy.toFixed(1) + ' m');
        }

        function updateEntityInfoPanel() {
            const nodeCount = selectedNodes.size;
            const beamCount = selectedElements.size;
            
            // Update status bar selection count
            updateStatusBar();
            
            // Helper for safe style access
            const setDisplay = (id, value) => {
                const el = document.getElementById(id);
                if (el) el.style.display = value;
            };
            
            const setColor = (id, value) => {
                const el = document.getElementById(id);
                if (el) el.style.color = value;
            };
            
            // Hide all
            setDisplay('entityInfoEmpty', 'none');
            setDisplay('entityInfoNode', 'none');
            setDisplay('entityInfoBeam', 'none');
            setDisplay('entityInfoMulti', 'none');
            
            if (nodeCount === 0 && beamCount === 0) {
                // Empty state
                setDisplay('entityInfoEmpty', 'block');
                updateEntityInfoSummary();
                currentInfoNode = null;
                currentInfoBeam = null;
            } else if (nodeCount === 1 && beamCount === 0) {
                // Single node selected
                const nodeId = Array.from(selectedNodes)[0];
                showNodeInfo(nodeId);
            } else if (nodeCount === 0 && beamCount === 1) {
                // Single beam selected
                const beamId = Array.from(selectedElements)[0];
                showBeamInfo(beamId);
            } else {
                // Multi selection
                showMultiInfo(nodeCount, beamCount);
            }
            // Alt tablo secimi izler (Results sekmesinde sekme + vurgu).
            if (typeof altTabloSecimiIzle === 'function') altTabloSecimiIzle();
        }
        
        function showNodeInfo(nodeId) {
            const node = model.nodes[nodeId];
            if (!node) return;
            
            currentInfoNode = nodeId;
            currentInfoBeam = null;
            
            setStyle('entityInfoNode', 'display', 'block');
            
            // Basic info
            setText('infoNodeId', nodeId);
            
            // Set input values for editable coordinates
            const nodeXInput = document.getElementById('infoNodeX');
            const nodeYInput = document.getElementById('infoNodeY');
            const nodeZInput = document.getElementById('infoNodeZ');
            if (nodeXInput) nodeXInput.value = (node.x * 1000).toFixed(0);
            if (nodeYInput) nodeYInput.value = (node.y * 1000).toFixed(0);
            if (nodeZInput) nodeZInput.value = ((node.z || 0) * 1000).toFixed(0);
            
            // BC info
            const bc = model.constraints[nodeId];
            if (bc) {
                if (typeof bc === 'object') {
                    const constrained = [];
                    if (bc.Ux) constrained.push('Ux');
                    if (bc.Uy) constrained.push('Uy');
                    if (bc.Uz) constrained.push('Uz');
                    if (bc.Rx) constrained.push('Rx');
                    if (bc.Ry) constrained.push('Ry');
                    if (bc.Rz) constrained.push('Rz');
                    setText('infoNodeBC', constrained.length > 0 ? constrained.join(', ') : 'Free');
                    setStyle('infoNodeBC', 'color', constrained.length > 0 ? 'var(--success)' : 'var(--text-3)');
                    
                    // Update checkboxes
                    setChecked('infoBcUx', bc.Ux || false);
                    setChecked('infoBcUy', bc.Uy || false);
                    setChecked('infoBcUz', bc.Uz || false);
                    setChecked('infoBcRx', bc.Rx || false);
                    setChecked('infoBcRy', bc.Ry || false);
                    setChecked('infoBcRz', bc.Rz || false);
                    // Zorlanmis yer degistirme kutulari (m -> mm).
                    const zr = bc.prescribed || {};
                    setValue('infoBcSetX', ((zr.Ux || 0) * 1000).toFixed(0));
                    setValue('infoBcSetY', ((zr.Uy || 0) * 1000).toFixed(0));
                    setValue('infoBcSetZ', ((zr.Uz || 0) * 1000).toFixed(0));
                } else {
                    setText('infoNodeBC', bc);
                    setStyle('infoNodeBC', 'color', 'var(--success)');
                }
            } else {
                setText('infoNodeBC', 'Free');
                setStyle('infoNodeBC', 'color', 'var(--text-3)');
                ['infoBcUx', 'infoBcUy', 'infoBcUz', 'infoBcRx', 'infoBcRy', 'infoBcRz'].forEach(id => {
                    setChecked(id, false);
                });
                ['infoBcSetX', 'infoBcSetY', 'infoBcSetZ'].forEach(id => setValue(id, '0'));
            }
            
            // Loads - show in container and populate inputs
            const nodeLoads = model.loads.filter(l => l.nodeId === nodeId);
            const loadsContainer = document.getElementById('infoNodeLoadsContainer');
            
            if (nodeLoads.length > 0) {
                const load = nodeLoads[0]; // İlk load'u al
                
                // Container'da mevcut load'u göster
                loadsContainer.innerHTML = `
                    <div style="background:rgba(239,68,68,0.1); border:1px solid rgba(239,68,68,0.3); border-radius:var(--r-ctl); padding:8px; margin-bottom:8px;">
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <span style="color:var(--danger-text); font-weight:600; font-size:var(--fs-md);">Current Load:</span>
                        </div>
                        <div style="display:flex; gap:8px; margin-top:4px; font-size:var(--fs-sm);">
                            ${load.Fx ? `<span style="color:var(--text-3);">Fx: <b style="color:var(--danger-text);">${load.Fx}</b></span>` : ''}
                            ${load.Fy ? `<span style="color:var(--text-3);">Fy: <b style="color:var(--danger-text);">${load.Fy}</b></span>` : ''}
                            ${load.Fz ? `<span style="color:var(--text-3);">Fz: <b style="color:var(--danger-text);">${load.Fz}</b></span>` : ''}
                            ${!load.Fx && !load.Fy && !load.Fz ? '<span style="color:var(--text-3);">No values set</span>' : ''}
                        </div>
                    </div>
                `;
                
                // Input'lara mevcut değerleri yaz
                const fxInput = document.getElementById('infoLoadFx');
                const fyInput = document.getElementById('infoLoadFy');
                const fzInput = document.getElementById('infoLoadFz');
                if (fxInput) fxInput.value = load.Fx || 0;
                if (fyInput) fyInput.value = load.Fy || 0;
                if (fzInput) fzInput.value = load.Fz || 0;
                ['Mx', 'My', 'Mz'].forEach(k => { const el = document.getElementById('infoLoad' + k); if (el) el.value = load[k] || 0; });
                const dEl = document.getElementById('infoLoadCase'); if (dEl && load.case) dEl.value = load.case;
            } else {
                loadsContainer.innerHTML = `<div style="color:var(--text-3); font-size:var(--fs-md);">No loads on this node</div>`;
                
                // Input'ları sıfırla
                const fxInput = document.getElementById('infoLoadFx');
                const fyInput = document.getElementById('infoLoadFy');
                const fzInput = document.getElementById('infoLoadFz');
                if (fxInput) fxInput.value = 0;
                if (fyInput) fyInput.value = 0;
                if (fzInput) fzInput.value = 0;
                ['Mx', 'My', 'Mz'].forEach(k => { const el = document.getElementById('infoLoad' + k); if (el) el.value = 0; });
            }
            
            // Results
            if (results && results.displacements && results.displacements[nodeId]) {
                const d = results.displacements[nodeId];
                setStyle('infoNodeResults', 'display', 'block');
                setText('infoNodeUz', (d.Uz * 1000).toFixed(3) + ' mm');
                setText('infoNodeRx', (d.Rx * 180 / Math.PI).toFixed(3) + '°');
                setText('infoNodeRy', (d.Ry * 180 / Math.PI).toFixed(3) + '°');
            } else {
                setStyle('infoNodeResults', 'display', 'none');
            }
        }
        
        // Alias for backward compatibility
        function updatePropertiesPanel() {
            updateEntityInfoPanel();
        }
        
        function showBeamInfo(beamId) {
            const elem = model.elements[beamId];
            if (!elem) return;
            
            currentInfoBeam = beamId;
            currentInfoNode = null;
            
            setStyle('entityInfoBeam', 'display', 'block');
            
            // Basic info
            const n1 = model.nodes[elem.n1];
            const n2 = model.nodes[elem.n2];
            // Uc boyutlu boy: kolonun boyu sifir gorunuyordu (z yoktu).
            const length = n1 && n2 ? Math.sqrt(Math.pow(n2.x - n1.x, 2) + Math.pow(n2.y - n1.y, 2) + Math.pow((n2.z || 0) - (n1.z || 0), 2)) : 0;

            setText('infoBeamId', beamId);
            const adEl = document.getElementById('infoBeamAd'); if (adEl) adEl.value = elem.ad || '';
            setText('infoBeamNodes', `${elem.n1} → ${elem.n2}`);
            // Burkulma carpanlari
            const kyEl = document.getElementById('infoBeamKy'), kzEl = document.getElementById('infoBeamKz'), egEl = document.getElementById('infoBeamCurve');
            if (kyEl) kyEl.value = elem.kY || 1;
            if (kzEl) kzEl.value = elem.kZ || 1;
            if (egEl) egEl.value = elem.burkulmaEgrisi || '';
            const kltEl = document.getElementById('infoBeamKlt'), yanalEl = document.getElementById('infoBeamYanal');
            if (kltEl) kltEl.value = elem.kLT || 1;
            if (yanalEl) yanalEl.value = (typeof elem.yanalTutulu === 'boolean') ? (elem.yanalTutulu ? '1' : '0') : '';
            const hsEl = document.getElementById('infoHingeStart'), heEl = document.getElementById('infoHingeEnd');
            if (hsEl) hsEl.checked = !!elem.hingeStart;
            if (heEl) heEl.checked = !!elem.hingeEnd;
            setText('infoBeamLength', (length * 1000).toFixed(0) + ' mm');
            setText('infoBeamSection', elem.section || 'no section');
            setText('infoBeamGrade', elem.grade || 'AH36');
            
            // Set editable node coordinates
            setText('infoBeamN1Id', `#${elem.n1}`);
            setText('infoBeamN2Id', `#${elem.n2}`);
            
            const n1xInput = document.getElementById('infoBeamN1X');
            const n1yInput = document.getElementById('infoBeamN1Y');
            const n2xInput = document.getElementById('infoBeamN2X');
            const n2yInput = document.getElementById('infoBeamN2Y');
            
            if (n1 && n1xInput && n1yInput) {
                n1xInput.value = (n1.x * 1000).toFixed(0);
                n1yInput.value = (n1.y * 1000).toFixed(0);
            }
            if (n2 && n2xInput && n2yInput) {
                n2xInput.value = (n2.x * 1000).toFixed(0);
                n2yInput.value = (n2.y * 1000).toFixed(0);
            }
            
            // Section properties with orientation consideration
            const sec = SECTIONS[elem.section];
            const orientation = elem.orientation || 0;
            
            if (sec) {
                // Use cm values if available, otherwise convert from SI
                const A_cm2 = sec.A_cm2 ?? (sec.A * 1e4);
                const Iy_cm4 = sec.Iy_cm4 ?? (sec.Iy * 1e8);
                const Iz_cm4 = sec.Iz_cm4 ?? (sec.Iz * 1e8);
                const Wy_cm3 = sec.Wy_cm3 ?? (sec.Wy * 1e6);
                const Wz_cm3 = sec.Wz_cm3 ?? (sec.Wz ? sec.Wz * 1e6 : 0);
                
                // Area
                setText('infoSectionA', A_cm2.toFixed(2) + ' cm²');
                
                // Strong axis (Y-Y)
                setText('infoSectionIy', Iy_cm4.toFixed(1) + ' cm⁴');
                setText('infoSectionWy', Wy_cm3.toFixed(1) + ' cm³');
                
                // Weak axis (Z-Z)
                setText('infoSectionIz', Iz_cm4 ? Iz_cm4.toFixed(1) + ' cm⁴' : '-');
                setText('infoSectionWz', Wz_cm3 ? Wz_cm3.toFixed(1) + ' cm³' : '-');
                
                // Show effective values with orientation
                const isRotated = Math.abs(orientation) === 90;
                const effectivePanel = document.getElementById('infoEffectiveAxis');
                
                if (orientation !== 0 && effectivePanel) {
                    effectivePanel.style.display = 'block';
                    
                    if (isRotated && sec.Iz) {
                        setText('infoEffectiveI', (sec.Iz * 1e8).toFixed(1) + ' cm⁴');
                        setText('infoEffectiveW', sec.Wz ? (sec.Wz * 1e6).toFixed(1) + ' cm³' : '-');
                    } else {
                        setText('infoEffectiveI', (sec.Iy * 1e8).toFixed(1) + ' cm⁴');
                        setText('infoEffectiveW', sec.Wy ? (sec.Wy * 1e6).toFixed(1) + ' cm³' : '-');
                    }
                } else if (effectivePanel) {
                    effectivePanel.style.display = 'none';
                }
            }
            
            // Draw section diagram with orientation
            drawSectionDiagram(elem.section, orientation);
            
            // Update section dropdown
            const select = $('infoEditSection');
            if (select) {
                for (let i = 0; i < select.options.length; i++) {
                    if (select.options[i].value === elem.section) {
                        select.selectedIndex = i;
                        break;
                    }
                }
            }
            
            // Update orientation controls
            const orientSlider = document.getElementById('infoBeamOrientation');
            const orientValue = document.getElementById('infoOrientationValue');
            if (orientSlider) orientSlider.value = orientation;
            if (orientValue) orientValue.textContent = orientation + '°';
            
            // Results
            // Only show results in Results tab
            if (showResultsVisualization && results && results.elementResults && results.elementResults[beamId]) {
                const r = results.elementResults[beamId];
                setStyle('infoBeamResults', 'display', 'block');
                
                // Moment and Shear values
                setText('infoBeamM1', (r.M1 || 0).toFixed(2) + ' kNm');
                setText('infoBeamM2', (r.M2 || 0).toFixed(2) + ' kNm');
                setText('infoBeamMmax', (r.Mmax || 0).toFixed(2) + ' kNm');
                setText('infoBeamV', (Math.abs(r.V1) || 0).toFixed(2) + ' kN');
                
                // Stress values
                setText('infoBeamSigma', (r.sigma || 0).toFixed(1) + ' MPa');
                setText('infoBeamTau', (r.tau || 0).toFixed(1) + ' MPa');
                setText('infoBeamVm', (r.vonMises || 0).toFixed(1) + ' MPa');
                
                // Draw mini diagram with current type and update buttons
                const diagType = currentMiniDiagramType || 'moment';
                drawBeamMiniDiagram(beamId, diagType);
                // Update button states
                ['moment', 'shear', 'stress'].forEach(t => {
                    const btn = document.getElementById('btnDiag' + t.charAt(0).toUpperCase() + t.slice(1));
                    if (btn) {
                        if (t === diagType) {
                            // Secili segment HANGISI olursa olsun ayni vurgu rengini alir;
                            // her secenege ayri renk vermek rengin anlamini yok ediyordu.
                            btn.style.background = 'var(--primary)';
                            btn.style.border = '1px solid var(--primary)';
                            btn.style.color = '#fff';
                        } else {
                            btn.style.background = 'transparent';
                            btn.style.border = '1px solid var(--border)';
                            btn.style.color = 'var(--text-2)';
                        }
                    }
                });
            } else if (showResultsVisualization && results && results.stresses && results.stresses[beamId]) {
                // Legacy support
                const s = results.stresses[beamId];
                setStyle('infoBeamResults', 'display', 'block');
                setText('infoBeamSigma', s.sigma.toFixed(1) + ' MPa');
                setText('infoBeamTau', s.tau.toFixed(1) + ' MPa');
                setText('infoBeamVm', s.vonMises.toFixed(1) + ' MPa');
            } else {
                setStyle('infoBeamResults', 'display', 'none');
            }
            
            // In Results tab, hide editing sections (show only results, section properties and diagrams)
            const isResultsTab = showResultsVisualization;
            const isModelTab = document.getElementById('mainTabModel')?.classList.contains('active');
            
            const nodeCoordsSection = document.getElementById('beamNodeCoordsSection');
            const editSectionSection = document.getElementById('beamEditSectionSection');
            const orientationSection = document.getElementById('beamOrientationSection');
            const actionsSection = document.getElementById('beamActionsSection');
            const diagramsSection = document.getElementById('beamDiagramsSection');
            
            // Node coords, edit section, orientation - only in Model tab
            if (nodeCoordsSection) nodeCoordsSection.style.display = isModelTab ? 'block' : 'none';
            if (editSectionSection) editSectionSection.style.display = isModelTab ? 'block' : 'none';
            if (orientationSection) orientationSection.style.display = isModelTab ? 'block' : 'none';
            
            // Actions (Copy, Split, Mirror) - only in Model tab
            if (actionsSection) actionsSection.style.display = isModelTab ? 'block' : 'none';
            
            // Diagrams (View Detailed Diagrams) - only in Results tab
            if (diagramsSection) diagramsSection.style.display = isResultsTab ? 'block' : 'none';
            
            // Line Load section - show in Loads tab or when no specific tab restriction
            const lineLoadSection = document.getElementById('beamLineLoadSection');
            const isLoadsTab = document.getElementById('mainTabLoads')?.classList.contains('active');
            if (lineLoadSection) {
                // Show line load section always (useful from any tab)
                lineLoadSection.style.display = 'block';
            }
            
            // Update line loads display
            updateInfoBeamLineLoads(); if (typeof updateInfoBeamPointLoads === 'function') updateInfoBeamPointLoads();
        }
        
        // Mini diagram state
        let currentMiniDiagramType = 'moment';
        
        function switchMiniDiagram(type) {
            currentMiniDiagramType = type;
            
            // Update button styles
            ['moment', 'shear', 'stress'].forEach(t => {
                const btn = document.getElementById('btnDiag' + t.charAt(0).toUpperCase() + t.slice(1));
                if (btn) {
                    if (t === type) {
                        btn.style.background = t === 'moment' ? 'var(--primary)' : t === 'shear' ? '#10b981' : 'var(--danger)';
                        btn.style.border = 'none';
                        btn.style.color = 'white';
                    } else {
                        btn.style.background = '#1e293b';
                        btn.style.border = '1px solid var(--border)';
                        btn.style.color = 'var(--text-2)';
                    }
                }
            });
            
            // Redraw diagram
            if (currentInfoBeam) {
                drawBeamMiniDiagram(currentInfoBeam, type);
            }
        }
        
        function drawBeamMiniDiagram(beamId, type = 'moment') {
            const canvas = document.getElementById('beamMiniDiagram');
            if (!canvas) return;
            
            const ctx = canvas.getContext('2d');
            const w = canvas.width;
            const h = canvas.height;
            
            // Clear canvas
            ctx.fillStyle = '#0f172a';
            ctx.fillRect(0, 0, w, h);
            
            const elem = model.elements[beamId];
            if (!elem || !results || !results.elementResults || !results.elementResults[beamId]) {
                return;
            }
            
            const r = results.elementResults[beamId];
            const n1 = model.nodes[elem.n1];
            const n2 = model.nodes[elem.n2];
            if (!n1 || !n2) return;
            
            const length = Math.sqrt(Math.pow(n2.x - n1.x, 2) + Math.pow(n2.y - n1.y, 2));
            
            // Padding
            const padX = 15;
            const padY = 10;
            const drawW = w - padX * 2;
            const drawH = h - padY * 2;
            
            // Get values based on type
            let values = [];
            let maxVal = 0;
            let color = 'var(--primary)';
            let label = '';
            
            // Check for line loads on this beam
            const hasLineLoad = elem.lineLoads && elem.lineLoads.length > 0;
            
            if (type === 'moment') {
                // Moment diagram - use Mmax to determine if there's a parabolic component
                const M1 = r.M1 || 0;
                const M2 = r.M2 || 0;
                const Mmax = r.Mmax || 0;
                
                // If Mmax > both end moments, there's a peak in the middle (distributed load or internal peak)
                const hasParabolicComponent = Math.abs(Mmax) > Math.max(Math.abs(M1), Math.abs(M2)) * 1.01;
                
                // Create points along beam
                const numPoints = 20;
                for (let i = 0; i <= numPoints; i++) {
                    const t = i / numPoints;
                    let M;
                    // Linear component
                    M = M1 * (1 - t) + M2 * t;
                    // Add parabolic component if there's a peak
                    if (hasParabolicComponent) {
                        const Madd = Mmax - (M1 + M2) / 2;
                        M = M1 * (1 - t) + M2 * t + 4 * Madd * t * (1 - t);
                    }
                    values.push(M);
                    if (Math.abs(M) > maxVal) maxVal = Math.abs(M);
                }
                color = 'var(--primary)';
                label = `Max: ${(r.Mmax || 0).toFixed(2)} kNm`;
            } else if (type === 'shear') {
                // Shear diagram - linear for UDL, constant otherwise
                const V1 = r.V1 || 0;
                const V2 = r.V2 || -V1;
                
                const numPoints = 20;
                for (let i = 0; i <= numPoints; i++) {
                    const t = i / numPoints;
                    const V = V1 * (1 - t) + V2 * t;
                    values.push(V);
                    if (Math.abs(V) > maxVal) maxVal = Math.abs(V);
                }
                color = '#10b981';
                label = `Max: ${Math.abs(r.V1 || 0).toFixed(2)} kN`;
            } else if (type === 'stress') {
                // Stress distribution - same as Beam Detail modal
                // Uses sin(π*t) shape which represents simply supported beam behavior
                const sigma = r.sigma || 0;
                
                const numPoints = 20;
                for (let i = 0; i <= numPoints; i++) {
                    const t = i / numPoints;
                    // Parabolic/sinusoidal shape: 0 at ends, max at middle
                    const stressVal = sigma * Math.abs(Math.sin(Math.PI * t));
                    values.push(stressVal);
                    if (stressVal > maxVal) maxVal = stressVal;
                }
                color = 'var(--danger)';
                label = `Max: ${sigma.toFixed(1)} MPa`;
            }
            
            if (maxVal === 0) maxVal = 1;
            
            // Draw baseline
            const baseY = padY + drawH / 2;
            ctx.strokeStyle = '#334155';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(padX, baseY);
            ctx.lineTo(w - padX, baseY);
            ctx.stroke();
            
            // Draw beam endpoints
            ctx.fillStyle = 'var(--text-3)';
            ctx.beginPath();
            ctx.arc(padX, baseY, 3, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(w - padX, baseY, 3, 0, Math.PI * 2);
            ctx.fill();
            
            // Draw diagram
            ctx.strokeStyle = color;
            ctx.fillStyle = color + '40'; // Semi-transparent fill
            ctx.lineWidth = 2;
            
            ctx.beginPath();
            ctx.moveTo(padX, baseY);
            
            for (let i = 0; i < values.length; i++) {
                const x = padX + (i / (values.length - 1)) * drawW;
                const y = baseY - (values[i] / maxVal) * (drawH / 2 - 5);
                if (i === 0) {
                    ctx.lineTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            }
            
            // Close path for fill
            ctx.lineTo(w - padX, baseY);
            ctx.closePath();
            ctx.fill();
            
            // Draw line on top
            ctx.beginPath();
            ctx.moveTo(padX, baseY - (values[0] / maxVal) * (drawH / 2 - 5));
            for (let i = 1; i < values.length; i++) {
                const x = padX + (i / (values.length - 1)) * drawW;
                const y = baseY - (values[i] / maxVal) * (drawH / 2 - 5);
                ctx.lineTo(x, y);
            }
            ctx.stroke();
            
            // Find and mark max point
            let maxIdx = 0;
            let maxValue = Math.abs(values[0]);
            for (let i = 1; i < values.length; i++) {
                if (Math.abs(values[i]) > maxValue) {
                    maxValue = Math.abs(values[i]);
                    maxIdx = i;
                }
            }
            
            const maxX = padX + (maxIdx / (values.length - 1)) * drawW;
            const maxY = baseY - (values[maxIdx] / maxVal) * (drawH / 2 - 5);
            
            // Max point marker
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(maxX, maxY, 4, 0, Math.PI * 2);
            ctx.fill();
            
            // Update label
            setText('miniDiagMaxLabel', label);
        }
        
        function showMultiInfo(nodeCount, beamCount) {
            setStyle('entityInfoMulti', 'display', 'block');
            setText('infoMultiNodes', nodeCount);
            setText('infoMultiBeams', beamCount);
            cokluDugumKartlariniYaz();
            cokluMesnetKutulariniOku();
            cokluKutleYaz();
            
            // Show/hide sections based on selection
            const nodeBCSection = document.getElementById('multiNodeBCSection');
            const nodeLoadSection = document.getElementById('multiNodeLoadSection');
            const beamLoadSection = document.getElementById('multiBeamLoadSection');
            const beamSectionSection = document.getElementById('multiBeamSectionSection');
            const beamActionsSection = document.getElementById('multiBeamActionsSection');
            
            // Node sections - only when nodes selected
            if (nodeBCSection) nodeBCSection.style.display = nodeCount > 0 ? 'block' : 'none';
            if (nodeLoadSection) nodeLoadSection.style.display = nodeCount > 0 ? 'block' : 'none';
            
            // Beam sections - only when beams selected
            if (beamLoadSection) beamLoadSection.style.display = beamCount > 0 ? 'block' : 'none';
            if (beamSectionSection) beamSectionSection.style.display = beamCount > 0 ? 'block' : 'none';
            if (beamActionsSection) beamActionsSection.style.display = beamCount > 0 ? 'block' : 'none';
        }
        
        // ---- Coklu secim: her dugum icin tek-dugum kartinin aynisi ----
        //
        // Kullanici iki dugum secince "tek sectigim gibi olsun ama alt alta
        // listelensin, es zamanli degistireyim" dedi. Kartlar tek-dugum
        // panelinin (koordinat / mesnet / yuk) kucultulmus kopyasi; her
        // kontrol dugum numarasini tasir, o dugume dogrudan yazar. Alttaki
        // "all selected" bolumu hepsine birden uygular.
        //
        // Ust uste binen ya da cok yakin dugumler ekranda tek gorunuyor:
        // iki dugumde aralarindaki uzaklik, 1 mm altinda SAME POSITION
        // uyarisi ayrica basilir.
        function cokluDugumKartlariniYaz() {
            const kap = document.getElementById('infoMultiNodeCards');
            const not = document.getElementById('infoMultiNodeNote');
            if (!kap) return;
            const ids = Array.from(selectedNodes).map(Number).sort((a, b) => a - b);
            if (ids.length === 0) { kap.innerHTML = ''; if (not) not.innerHTML = ''; return; }
            const mm = v => Math.round((v || 0) * 1000);
            const inp = (id, ad, deger) =>
                `<input type="number" id="kart${ad}_${id}" value="${deger}" step="1" onchange="kartKoordinatUygula(${id})" ` +
                `style="width:100%; padding:3px 4px; font-size:var(--fs-sm); text-align:right;">`;
            const kutu = (id, dof, isaretli) =>
                `<label style="display:flex; flex-direction:column; align-items:center; gap:2px; font-size:var(--fs-xs); color:var(--text-2);">` +
                `<input type="checkbox" id="kartBc${dof}_${id}" ${isaretli ? 'checked' : ''} onchange="kartBCUygula(${id})" style="width:14px; height:14px; accent-color:var(--success);">${dof}</label>`;
            const html = [];
            ids.slice(0, 20).forEach(id => {
                const n = model.nodes[id];
                if (!n) return;
                const bc = model.constraints[id] || {};
                const tutulu = ['Ux', 'Uy', 'Uz', 'Rx', 'Ry', 'Rz'].filter(k => bc[k]);
                const yuk = model.loads.find(l => l.nodeId === id) || {};
                html.push(`
                <div class="entity-section" style="padding:8px; margin-bottom:6px;">
                    <div style="display:flex; justify-content:space-between; align-items:baseline; margin-bottom:6px;">
                        <span class="entity-section-title" style="margin:0;">Node <span style="color:var(--primary)">${id}</span></span>
                        <span style="font-size:var(--fs-xs); color:${tutulu.length ? 'var(--success)' : 'var(--text-3)'}">${tutulu.length ? tutulu.join(', ') : 'Free'}</span>
                    </div>
                    <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:6px; margin-bottom:6px;">
                        <div><small style="color:var(--text-3); font-size:var(--fs-xs);">X (mm)</small>${inp(id, 'X', mm(n.x))}</div>
                        <div><small style="color:var(--text-3); font-size:var(--fs-xs);">Y (mm)</small>${inp(id, 'Y', mm(n.y))}</div>
                        <div><small style="color:var(--text-3); font-size:var(--fs-xs);">Z (mm)</small>${inp(id, 'Z', mm(n.z))}</div>
                    </div>
                    <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
                        ${['Ux', 'Uy', 'Uz', 'Rx', 'Ry', 'Rz'].map(d => kutu(id, d, !!bc[d])).join('')}
                    </div>
                    <div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:4px; margin-bottom:6px;">
                        <button class="btn-secondary btn-small" onclick="kartBCOnayar(${id}, 'fixed')">Fixed</button>
                        <button class="btn-secondary btn-small" onclick="kartBCOnayar(${id}, 'pinned')">Pinned</button>
                        <button class="btn-secondary btn-small" onclick="kartBCOnayar(${id}, 'simply')">Simply</button>
                        <button class="btn-secondary btn-small" onclick="kartBCOnayar(${id}, 'free')">Free</button>
                    </div>
                    <div style="display:grid; grid-template-columns:1fr 1fr 1fr auto auto; gap:4px; align-items:end;">
                        <div><small style="color:var(--text-3); font-size:var(--fs-xs);">Fx (kN)</small><input type="number" id="kartFx_${id}" value="${yuk.Fx || 0}" step="1" style="width:100%; padding:3px 4px; font-size:var(--fs-sm); text-align:right;"></div>
                        <div><small style="color:var(--text-3); font-size:var(--fs-xs);">Fy (kN)</small><input type="number" id="kartFy_${id}" value="${yuk.Fy || 0}" step="1" style="width:100%; padding:3px 4px; font-size:var(--fs-sm); text-align:right;"></div>
                        <div><small style="color:var(--text-3); font-size:var(--fs-xs);">Fz (kN)</small><input type="number" id="kartFz_${id}" value="${yuk.Fz || 0}" step="1" style="width:100%; padding:3px 4px; font-size:var(--fs-sm); text-align:right;"></div>
                        <button class="btn-primary btn-small" onclick="kartYukKaydet(${id})" title="Save load">Save</button>
                        <button class="btn-secondary btn-small" onclick="kartYukSil(${id})" title="Delete load" ${yuk.nodeId ? '' : 'disabled'}>✕</button>
                    </div>
                </div>`);
            });
            if (ids.length > 20) html.push(`<div style="font-size:var(--fs-xs); color:var(--text-3); margin-bottom:6px;">… +${ids.length - 20} more nodes (use the "all selected" controls below)</div>`);
            kap.innerHTML = html.join('');

            if (not) {
                if (ids.length === 2 && model.nodes[ids[0]] && model.nodes[ids[1]]) {
                    const a = model.nodes[ids[0]], b = model.nodes[ids[1]];
                    const d = Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + ((a.z || 0) - (b.z || 0)) ** 2);
                    not.innerHTML = d < 0.001
                        ? `<span style="color:var(--warning)">⚠ SAME POSITION (duplicate node)</span>`
                        : `distance N${ids[0]}–N${ids[1]}: <span style="color:var(--text-primary,#e2e8f0)">${(d * 1000).toFixed(0)} mm</span>`;
                } else not.innerHTML = '';
            }
        }

        // Secili kirislerin toplam boyu, kutlesi ve agirlik merkezi (DNV 3D
        // Beam'in "Selection: Beams / Mass / CoG" satirlari). Rijit kirisin
        // kutlesi yok; kutle profil alani x boy x 7850.
        function cokluKutleYaz() {
            const kap = document.getElementById('infoMultiMass');
            if (!kap) return;
            const ids = Array.from(selectedElements);
            if (ids.length === 0) { kap.innerHTML = ''; return; }
            let L = 0, m = 0, sx = 0, sy = 0, sz = 0, sL = 0;
            ids.forEach(id => {
                const e = model.elements[id]; if (!e) return;
                const a = model.nodes[e.n1], b = model.nodes[e.n2]; if (!a || !b) return;
                const l = Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2 + ((b.z || 0) - (a.z || 0)) ** 2);
                const sec = SECTIONS[e.section];
                const mi = (sec && sec.A > 0) ? sec.A * l * 7850 : 0;
                L += l; m += mi;
                const w = mi > 0 ? mi : l;          // kutlesizde boyla agirlikli
                sL += w; sx += w * (a.x + b.x) / 2; sy += w * (a.y + b.y) / 2; sz += w * ((a.z || 0) + (b.z || 0)) / 2;
            });
            const cog = sL > 0 ? `${Math.round(sx / sL * 1000)}, ${Math.round(sy / sL * 1000)}, ${Math.round(sz / sL * 1000)}` : '-';
            kap.innerHTML = `length: <span style="color:var(--text-primary,#e2e8f0)">${(L * 1000).toFixed(0)} mm</span> · mass: <span style="color:var(--text-primary,#e2e8f0)">${m.toFixed(1)} kg</span><br>CoG (mm): <span style="color:var(--text-primary,#e2e8f0)">${cog}</span>`;
        }

        // Kart degisince model ve ekran tazelenir; kartlar yeniden yazilir
        // (change olayi odak cikinca geldigi icin yazma kaybolmaz).
        function kartTazele() {
            results = null;
            updateModelSummary();
            if (typeof updateBCTable === 'function') updateBCTable();
            if (typeof updateLoadTable === 'function') updateLoadTable();
            cokluDugumKartlariniYaz();
            cokluMesnetKutulariniOku();
            if (currentViewMode === '3d') update3DScene(); else draw();
        }

        function kartKoordinatUygula(id) {
            const n = model.nodes[id];
            if (!n) return;
            const al = ad => parseFloat(document.getElementById(`kart${ad}_${id}`)?.value) / 1000;
            const x = al('X'), y = al('Y'), z = al('Z');
            if (![x, y, z].every(isFinite)) return;
            if (Math.abs(n.x - x) < 1e-4 && Math.abs(n.y - y) < 1e-4 && Math.abs((n.z || 0) - z) < 1e-4) return;
            saveState();
            n.x = x; n.y = y; n.z = z;
            kartTazele();
            showToast(`Node #${id} moved to (${Math.round(x*1000)}, ${Math.round(y*1000)}, ${Math.round(z*1000)}) mm`);
        }

        function kartBCUygula(id) {
            const bc = {};
            ['Ux', 'Uy', 'Uz', 'Rx', 'Ry', 'Rz'].forEach(d => { bc[d] = !!document.getElementById(`kartBc${d}_${id}`)?.checked; });
            saveState();
            if (Object.values(bc).some(v => v)) {
                // Zorlanmis yer degistirme varsa korunur.
                const eski = model.constraints[id];
                if (eski && eski.prescribed) bc.prescribed = eski.prescribed;
                model.constraints[id] = bc;
            } else delete model.constraints[id];
            kartTazele();
        }

        function kartBCOnayar(id, tip) {
            const desen = {
                'fixed':  [true, true, true, true, true, true],
                'pinned': [true, true, true, false, false, false],
                'simply': [false, false, true, false, false, false],
                'free':   [false, false, false, false, false, false]
            }[tip] || [false, false, false, false, false, false];
            ['Ux', 'Uy', 'Uz', 'Rx', 'Ry', 'Rz'].forEach((d, i) => {
                const el = document.getElementById(`kartBc${d}_${id}`);
                if (el) el.checked = desen[i];
            });
            kartBCUygula(id);
        }

        function kartYukKaydet(id) {
            const al = ad => parseFloat(document.getElementById(`kart${ad}_${id}`)?.value) || 0;
            const fx = al('Fx'), fy = al('Fy'), fz = al('Fz');
            if (fx === 0 && fy === 0 && fz === 0) { showToast('Enter at least one non-zero load value', 'warning'); return; }
            saveState();
            const i = model.loads.findIndex(l => l.nodeId === id);
            if (i >= 0) { Object.assign(model.loads[i], { Fx: fx, Fy: fy, Fz: fz }); }
            else model.loads.push({ case: etkinYukDurumu(), nodeId: id, Fx: fx, Fy: fy, Fz: fz, Mx: 0, My: 0, Mz: 0 });
            kartTazele();
            showToast(`Load saved on Node #${id}`);
        }

        function kartYukSil(id) {
            const i = model.loads.findIndex(l => l.nodeId === id);
            if (i < 0) return;
            saveState();
            model.loads.splice(i, 1);
            kartTazele();
            showToast(`Load deleted from Node #${id}`);
        }

        // Coklu mesnet kutulari secili dugumlerin GERCEK durumunu gosterir.
        // Eskiden son basilan dugmenin (Fixed) izini tasiyordu: serbest iki
        // dugum secilince alti kutu isaretli cikiyordu. Dugumler farkliysa
        // kutu "belirsiz" (indeterminate) olur.
        function cokluMesnetKutulariniOku() {
            const ids = Array.from(selectedNodes);
            ['Ux', 'Uy', 'Uz', 'Rx', 'Ry', 'Rz'].forEach(k => {
                const el = document.getElementById('multiBc' + k);
                if (!el) return;
                const degerler = ids.map(id => {
                    const bc = model.constraints[id];
                    return !!(bc && typeof bc === 'object' && bc[k]);
                });
                const hepsi = degerler.length > 0 && degerler.every(v => v);
                const hicbiri = degerler.every(v => !v);
                el.checked = hepsi;
                el.indeterminate = !hepsi && !hicbiri;
            });
        }

        // Select beams connected to selected nodes
        function selectConnectedBeams() {
            if (selectedNodes.size === 0) {
                showToast('Select nodes first', 'warning');
                return;
            }
            
            let count = 0;
            Object.entries(model.elements).forEach(([elemId, elem]) => {
                if (selectedNodes.has(elem.n1) || selectedNodes.has(elem.n2)) {
                    selectedElements.add(parseInt(elemId));
                    count++;
                }
            });
            
            if (count > 0) {
                updateEntityInfoPanel();
                if (currentViewMode === '3d') {
                    update3DScene();
                } else {
                    draw();
                }
                showToast(`${count} connected beam(s) selected`);
            } else {
                showToast('No beams connected to selected nodes', 'info');
            }
        }
        
        function drawSectionDiagram(sectionName, orientation = 0) {
            const svg = document.getElementById('sectionSvg');
            if (!svg) return;

            // Kesiti olmayan kiris BUTUN PANELI dusurmemeli. Adi okunamayinca
            // eskiden burada TypeError firliyor, cagri zinciri
            // updateEntityInfoPanel'e kadar kopuyor ve sag panel bos kaliyordu -
            // kullanici bir kirise tikliyor, hicbir sey olmuyor. Ice aktarilan
            // modelde kesitsiz eleman olabiliyor; soyle ve devam et.
            if (typeof sectionName !== 'string' || !sectionName) {
                svg.innerHTML = '<text x="50%" y="50%" text-anchor="middle" ' +
                    'fill="var(--text-2)" font-size="12">No section assigned</text>';
                return;
            }

            // Parse composite section: PROFILE_PLATEWxPLATET
            let profilePart = sectionName;
            let plateW = 0, plateT = 0;
            
            if (sectionName.includes('_')) {
                const parts = sectionName.split('_');
                profilePart = parts[0];
                const plateMatch = parts[1].match(/(\d+)[Xx](\d+)/);
                if (plateMatch) {
                    plateW = parseInt(plateMatch[1]);
                    plateT = parseInt(plateMatch[2]);
                }
            }
            
            // Parse profile dimensions
            const hpMatch = profilePart.match(/HP(\d+)[Xx](\d+)/);
            const fbMatch = profilePart.match(/FB(\d+)[Xx](\d+)/);
            const tMatch = profilePart.match(/T(\d+)[Xx](\d+)[\/\+](\d+)[Xx](\d+)/);
            const lMatch = profilePart.match(/L(\d+)[Xx](\d+)[Xx](\d+)/);
            // Boru: iki daire, plaka yok. Diger dallardan once.
            const pipeMatch = profilePart.match(/^PIPE(\d+(?:\.\d+)?)[Xx](\d+(?:\.\d+)?)/i);
            if (pipeMatch) {
                const D = parseFloat(pipeMatch[1]), tt = parseFloat(pipeMatch[2]);
                const R = 60, r = Math.max(0, R * (1 - 2 * tt / D));
                svg.innerHTML = `<circle cx="150" cy="80" r="${R}" fill="rgba(244,114,182,0.15)" stroke="var(--primary)" stroke-width="2"/>` +
                    `<circle cx="150" cy="80" r="${r}" fill="var(--bg-main)" stroke="var(--primary)" stroke-width="1.5"/>` +
                    `<text x="150" y="158" text-anchor="middle" fill="var(--text-3)" font-size="11">PIPE ${D} × ${tt}</text>`;
                return;
            }
            
            let profileData = null;
            let profileType = '';
            
            if (hpMatch) {
                const b = parseInt(hpMatch[1]);
                const t = parseInt(hpMatch[2]);
                const catalogHP = HP_CATALOG.find(hp => hp.b === b && hp.t === t);
                profileData = {
                    h: b,
                    t: t,
                    c: catalogHP?.c || t * 2.5,
                    r: catalogHP?.r || t * 0.8,
                    maxWidth: (catalogHP?.c || t * 2.5) + t
                };
                profileType = 'HP';
            } else if (fbMatch) {
                profileData = {
                    h: parseInt(fbMatch[1]),
                    t: parseInt(fbMatch[2]),
                    maxWidth: parseInt(fbMatch[2])
                };
                profileType = 'FB';
            } else if (tMatch) {
                profileData = {
                    h: parseInt(tMatch[1]),      // Web height
                    tw: parseInt(tMatch[2]),
                    bf: parseInt(tMatch[3]),
                    tf: parseInt(tMatch[4]),
                    maxWidth: parseInt(tMatch[3])
                };
                profileType = 'T';
            } else if (lMatch) {
                profileData = {
                    a: parseInt(lMatch[1]),
                    b: parseInt(lMatch[2]),
                    t: parseInt(lMatch[3]),
                    h: parseInt(lMatch[1]),
                    maxWidth: parseInt(lMatch[2])
                };
                profileType = 'L';
            }
            
            if (!profileData) {
                svg.innerHTML = `<text x="140" y="90" text-anchor="middle" fill="var(--text-3)" font-size="12">${sectionName}</text>`;
                return;
            }
            
            const viewWidth = 280;
            const viewHeight = 180;
            const plateEnabled = plateW > 0 && plateT > 0;
            
            // Calculate total dimensions
            let totalHeight = profileData.h;
            let totalWidth = profileData.maxWidth || profileData.t || 50;
            
            // T profile: h = web height, totalHeight = h + tf
            if (profileType === 'T') {
                totalHeight = profileData.h + profileData.tf;
            }
            
            if (plateEnabled) {
                totalHeight += plateT;
                totalWidth = Math.max(totalWidth, plateW);
            }
            
            // Calculate scale with better margins
            const marginX = 70;
            const marginY = 50;
            const scaleH = (viewHeight - marginY) / totalHeight;
            const scaleW = (viewWidth - marginX) / totalWidth;
            const scale = Math.min(scaleH, scaleW, 1.5);
            
            // Center the drawing
            const drawnWidth = totalWidth * scale;
            const drawnHeight = totalHeight * scale;
            const cx = viewWidth / 2;
            const startY = (viewHeight - drawnHeight) / 2;
            
            let svgContent = '';
            let topY = startY;
            
            // Section title
            svgContent += `<text x="${cx}" y="14" text-anchor="middle" fill="var(--text-2)" font-size="11" font-weight="600">${sectionName}</text>`;
            
            // Draw plate if enabled
            if (plateEnabled) {
                const plateWS = plateW * scale;
                const plateTS = plateT * scale;
                svgContent += `<rect x="${cx - plateWS/2}" y="${topY}" width="${plateWS}" height="${plateTS}" 
                    fill="rgba(255,255,255,0.05)" stroke="#e2e8f0" stroke-width="2"/>`;
                
                // Plate width dimension - above
                svgContent += drawDimLine(cx - plateWS/2, topY - 12, cx + plateWS/2, topY - 12, plateW, false);
                
                topY += plateTS;
            }
            
            // Draw profile
            switch (profileType) {
                case 'HP':
                    svgContent += drawHPProfile(profileData, cx, topY, scale, plateEnabled);
                    break;
                case 'FB':
                    svgContent += drawFBProfile(profileData, cx, topY, scale, plateEnabled);
                    break;
                case 'T':
                    svgContent += drawTProfile(profileData, cx, topY, scale, plateEnabled);
                    break;
                case 'L':
                    svgContent += drawLProfile(profileData, cx, topY, scale, plateEnabled);
                    break;
            }
            
            // Centroid marker with nice styling
            if (plateEnabled) {
                let profileH = profileData.h;
                if (profileType === 'T') {
                    profileH = profileData.h + profileData.tf;
                }
                const totalH = (plateT + profileH) * scale;
                const centY = startY + totalH * 0.35;
                svgContent += `<circle cx="${cx}" cy="${centY}" r="4" fill="var(--danger)" stroke="#fff" stroke-width="1.5"/>`;
            }
            
            // Apply rotation if needed
            if (orientation !== 0) {
                const centerY = startY + drawnHeight / 2;
                svg.innerHTML = `<g transform="rotate(${orientation}, ${cx}, ${centerY})">${svgContent}</g>`;
                svg.innerHTML += `<text x="${cx}" y="${viewHeight - 3}" text-anchor="middle" fill="var(--primary)" font-size="10" font-weight="500">↻ ${orientation}°</text>`;
            } else {
                svg.innerHTML = svgContent;
            }
        }
        
        // Apply coordinate changes from Entity Info panel
        function applyInfoNodeCoords() {
            if (currentInfoNode == null) return;
            
            const node = model.nodes[currentInfoNode];
            if (!node) return;
            
            const xInput = document.getElementById('infoNodeX');
            const yInput = document.getElementById('infoNodeY');
            const zInput = document.getElementById('infoNodeZ');
            
            if (!xInput || !yInput || !zInput) return;
            
            const newX = parseFloat(xInput.value) / 1000;
            const newY = parseFloat(yInput.value) / 1000;
            const newZ = parseFloat(zInput.value) / 1000;
            
            // Only save state and update if values changed
            if (Math.abs(node.x - newX) > 0.0001 || Math.abs(node.y - newY) > 0.0001 || Math.abs((node.z || 0) - newZ) > 0.0001) {
                saveState();
                
                node.x = newX;
                node.y = newY;
                node.z = newZ;
                
                results = null;
                updateModelSummary();
                
                if (currentViewMode === '3d') {
                    update3DScene();
                } else {
                    draw();
                }
                
                showToast(`Node #${currentInfoNode} moved to (${xInput.value}, ${yInput.value}, ${zInput.value}) mm`);
            }
        }
        
        // Apply beam node coordinate changes from Entity Info panel
        function applyInfoBeamCoords() {
            if (currentInfoBeam == null) return;
            
            const elem = model.elements[currentInfoBeam];
            if (!elem) return;
            
            const n1 = model.nodes[elem.n1];
            const n2 = model.nodes[elem.n2];
            if (!n1 || !n2) return;
            
            const n1xInput = document.getElementById('infoBeamN1X');
            const n1yInput = document.getElementById('infoBeamN1Y');
            const n2xInput = document.getElementById('infoBeamN2X');
            const n2yInput = document.getElementById('infoBeamN2Y');
            
            if (!n1xInput || !n1yInput || !n2xInput || !n2yInput) return;
            
            saveState();
            
            // Update node coordinates
            n1.x = parseFloat(n1xInput.value) / 1000;
            n1.y = parseFloat(n1yInput.value) / 1000;
            n2.x = parseFloat(n2xInput.value) / 1000;
            n2.y = parseFloat(n2yInput.value) / 1000;
            
            // Calculate new length
            const newLength = Math.sqrt(Math.pow(n2.x - n1.x, 2) + Math.pow(n2.y - n1.y, 2));
            
            results = null;
            updateModelSummary();
            
            if (currentViewMode === '3d') {
                update3DScene();
            } else {
                draw();
            }
            
            // Update display
            showBeamInfo(currentInfoBeam);
            
            showToast(`Beam #${currentInfoBeam} coordinates updated. Length: ${(newLength * 1000).toFixed(0)} mm`);
        }
        
        function setInfoBC(type) {
            if (currentInfoNode == null) return;
            
            saveState();
            
            const checks = {
                'fixed': [true, true, true, true, true, true],
                'pinned': [true, true, true, false, false, false],
                'simply': [false, false, true, false, false, false],
                'free': [false, false, false, false, false, false]
            };
            
            const [ux, uy, uz, rx, ry, rz] = checks[type] || checks['free'];
            
            document.getElementById('infoBcUx').checked = ux;
            document.getElementById('infoBcUy').checked = uy;
            document.getElementById('infoBcUz').checked = uz;
            document.getElementById('infoBcRx').checked = rx;
            document.getElementById('infoBcRy').checked = ry;
            document.getElementById('infoBcRz').checked = rz;
            
            applyInfoBC();
        }
        
        function applyInfoBC() {
            if (currentInfoNode == null) return;
            
            const bc = {
                Ux: document.getElementById('infoBcUx').checked,
                Uy: document.getElementById('infoBcUy').checked,
                Uz: document.getElementById('infoBcUz').checked,
                Rx: document.getElementById('infoBcRx').checked,
                Ry: document.getElementById('infoBcRy').checked,
                Rz: document.getElementById('infoBcRz').checked
            };
            
            // Zorlanmis yer degistirme (mm -> m). Yalnizca TUTULU yonde anlamli:
            // serbest birakilmis bir yone deger vermek celiski olur, cozucu de
            // onu yok sayip uyariyor. Sifirdan farkli deger yoksa alan hic
            // yazilmaz - eski modeller aynen calisir.
            const setAl = (id) => {
                const el = document.getElementById(id);
                const v = el ? parseFloat(el.value) : 0;
                return (isFinite(v) && v !== 0) ? v / 1000 : 0;
            };
            const zorla = {};
            if (bc.Ux && setAl('infoBcSetX')) zorla.Ux = setAl('infoBcSetX');
            if (bc.Uy && setAl('infoBcSetY')) zorla.Uy = setAl('infoBcSetY');
            if (bc.Uz && setAl('infoBcSetZ')) zorla.Uz = setAl('infoBcSetZ');
            if (Object.keys(zorla).length) bc.prescribed = zorla;
            
            // Tutulmayan yone yazilmis bir deger sessizce kaybolmasin.
            const kayip = [['Ux', 'infoBcSetX'], ['Uy', 'infoBcSetY'], ['Uz', 'infoBcSetZ']]
                .filter(([k, id]) => !bc[k] && setAl(id)).map(([k]) => k);
            const not = document.getElementById('infoBcSetNot');
            if (not) {
                not.textContent = kayip.length
                    ? kayip.join(', ') + ' is free - that value is ignored. Hold the direction first.'
                    : 'Only applies to directions that are held.';
                not.style.color = kayip.length ? 'var(--warning)' : 'var(--text-3)';
            }
            
            // Check if any DOF is constrained
            const hasConstraint = ['Ux', 'Uy', 'Uz', 'Rx', 'Ry', 'Rz'].some(k => bc[k]);
            
            if (hasConstraint) {
                model.constraints[currentInfoNode] = bc;
                // Switch to Boundary tab when BC is applied
                switchMainTab('boundary');
                showToast(`BC applied to Node #${currentInfoNode}`, 'success');
            } else {
                delete model.constraints[currentInfoNode];
            }
            
            updateModelSummary();
            updateBCTable();
            showNodeInfo(currentInfoNode);
            
            if (currentViewMode === '3d') {
                update3DScene();
            } else {
                draw();
            }
        }
        
        function addOrUpdateInfoLoad() {
            if (currentInfoNode == null) return;
            
            const fx = parseFloat($('infoLoadFx')?.value) || 0;
            const fy = parseFloat($('infoLoadFy')?.value) || 0;
            const fz = parseFloat($('infoLoadFz')?.value) || 0;
            const mx = parseFloat($('infoLoadMx')?.value) || 0;
            const my = parseFloat($('infoLoadMy')?.value) || 0;
            const mz = parseFloat($('infoLoadMz')?.value) || 0;

            if (fx === 0 && fy === 0 && fz === 0 && mx === 0 && my === 0 && mz === 0) {
                showToast('Enter at least one non-zero load value', 'warning');
                return;
            }
            
            saveState();
            
            // Check if load already exists for this node
            const existingLoadIndex = model.loads.findIndex(l => l.nodeId === currentInfoNode);
            
            if (existingLoadIndex >= 0) {
                // Update existing load
                Object.assign(model.loads[existingLoadIndex], { Fx: fx, Fy: fy, Fz: fz, Mx: mx, My: my, Mz: mz, case: (document.getElementById('infoLoadCase')?.value || etkinYukDurumu()) });
                showToast(`Load updated on Node #${currentInfoNode}`);
            } else {
                // Add new load
                model.loads.push({ case: (document.getElementById('infoLoadCase')?.value || etkinYukDurumu()),
                    nodeId: currentInfoNode,
                    Fx: fx, Fy: fy, Fz: fz,
                    Mx: mx, My: my, Mz: mz
                });
                
                // Build load description
                const loadParts = [];
                if (fx !== 0) loadParts.push(`Fx=${fx}`);
                if (fy !== 0) loadParts.push(`Fy=${fy}`);
                if (fz !== 0) loadParts.push(`Fz=${fz}`);
                if (mx !== 0) loadParts.push(`Mx=${mx} kNm`);
                if (my !== 0) loadParts.push(`My=${my} kNm`);
                if (mz !== 0) loadParts.push(`Mz=${mz} kNm`);
                showToast(`Load ${loadParts.join(', ')} kN added to Node #${currentInfoNode}`);
            }
            
            updateModelSummary();
            updateLoadTable();
            showNodeInfo(currentInfoNode);
            
            // Switch to Loads tab
            switchMainTab('loads');
            
            if (currentViewMode === '3d') {
                update3DScene();
            } else {
                draw();
            }
        }
        
        function deleteInfoLoad() {
            if (currentInfoNode == null) return;
            
            const existingLoadIndex = model.loads.findIndex(l => l.nodeId === currentInfoNode);
            
            if (existingLoadIndex < 0) {
                showToast('No load to delete on this node', true);
                return;
            }
            
            saveState();
            
            model.loads.splice(existingLoadIndex, 1);
            
            updateModelSummary();
            updateLoadTable();
            showNodeInfo(currentInfoNode);
            
            if (currentViewMode === '3d') {
                update3DScene();
            } else {
                draw();
            }
            
            showToast(`Load deleted from Node #${currentInfoNode}`);
        }
        
        // Legacy function for compatibility
        function addInfoLoad() {
            addOrUpdateInfoLoad();
        }
        
        // Add line load from Entity Info panel
        function addInfoLineLoad() {
            if (currentInfoBeam == null) {
                showToast('No beam selected', 'warning');
                return;
            }
            
            const q = parseFloat(document.getElementById('infoLineLoadQ')?.value) || 10;   // + = asagi (cozucu: lineLoadDirection)
            // Trapez yuk: son siddet bos birakilirsa sabit yuk. Cozucu value2'yi
            // zaten isliyordu (fem.js), giris yoktu.
            const q2Ham = document.getElementById('infoLineLoadQ2')?.value;
            const q2 = (q2Ham !== undefined && String(q2Ham).trim() !== '' && isFinite(parseFloat(q2Ham))) ? parseFloat(q2Ham) : null;
            const direction = document.getElementById('infoLineLoadDir')?.value || 'global';
            const startPct = parseFloat(document.getElementById('infoLineLoadStart')?.value) || 0;
            const endPct = parseFloat(document.getElementById('infoLineLoadEnd')?.value) || 100;
            
            if (q === 0) {
                showToast('Enter a non-zero load value', 'warning');
                return;
            }
            
            saveState();
            
            const elem = model.elements[currentInfoBeam];
            if (!elem.lineLoads) elem.lineLoads = [];
            
            elem.lineLoads.push({ case: (document.getElementById('infoLineLoadCase')?.value || etkinYukDurumu()),
                value: q,
                q: q,
                value2: (q2 !== null && q2 !== q) ? q2 : undefined,
                direction: direction,
                start: startPct / 100,
                end: endPct / 100,
                startPct: startPct,
                endPct: endPct
            });
            
            updateModelSummary();
            updateBCLoadsTable();
            updateInfoBeamLineLoads(); if (typeof updateInfoBeamPointLoads === 'function') updateInfoBeamPointLoads();
            
            // Switch to Loads tab
            switchMainTab('loads');
            
            if (currentViewMode === '3d') {
                update3DScene();
            } else {
                draw();
            }
            
            showToast(`Line load q=${q} kN/m added to Beam #${currentInfoBeam}`, 'success');
        }
        
        // Update beam line loads display in Entity Info
        function updateInfoBeamLineLoads() {
            const container = document.getElementById('infoBeamLineLoads');
            if (!container || currentInfoBeam == null) return;
            
            const elem = model.elements[currentInfoBeam];
            if (!elem || !elem.lineLoads || elem.lineLoads.length === 0) {
                container.innerHTML = '<div style="color:var(--text-3);">No line loads on this beam</div>';
                return;
            }
            
            container.innerHTML = elem.lineLoads.map((ll, idx) => {
                const q = ll.value || ll.q || 0;
                const start = (ll.startPct !== undefined ? ll.startPct : (ll.start || 0) * 100).toFixed(0);
                const end = (ll.endPct !== undefined ? ll.endPct : (ll.end || 1) * 100).toFixed(0);
                return `
                    <div style="display:flex; justify-content:space-between; align-items:center; background:var(--bg-elev); padding:4px 8px; border-radius:var(--r-ctl); margin-bottom:4px;">
                        <span style="color:var(--danger-text);">q=${q}${(typeof ll.value2 === 'number' && ll.value2 !== q) ? '→' + ll.value2 : ''} kN/m</span>
                        <span style="color:var(--text-3);">${start}-${end}%</span>
                        <button onclick="removeInfoLineLoad(${idx})" style="background:#b91c1c; border:none; color:white; width:18px; height:18px; border-radius:var(--r-ctl); cursor:pointer; font-size:var(--fs-xs);">✕</button>
                    </div>
                `;
            }).join('');
        }
        
        // ---- Kiris ustu tekil yukler (panel) ----
        function updateInfoBeamPointLoads() {
            const container = document.getElementById('infoBeamPointLoads');
            if (!container || currentInfoBeam == null) return;
            const elem = model.elements[currentInfoBeam];
            const n1 = elem && model.nodes[elem.n1], n2 = elem && model.nodes[elem.n2];
            const L = (n1 && n2) ? Math.hypot(n2.x - n1.x, n2.y - n1.y, (n2.z || 0) - (n1.z || 0)) : 0;
            const xEl = document.getElementById('infoPointLoadX');
            if (xEl && L > 0 && (!xEl.value || +xEl.value > L * 1000)) xEl.value = Math.round(L * 500);
            if (!elem || !elem.pointLoads || elem.pointLoads.length === 0) {
                container.innerHTML = '<div style="color:var(--text-3);">No point loads on this beam</div>';
                return;
            }
            container.innerHTML = elem.pointLoads.map((p, idx) => `
                    <div style="display:flex; justify-content:space-between; align-items:center; background:var(--bg-elev); padding:4px 8px; border-radius:var(--r-ctl); margin-bottom:4px;">
                        <span style="color:var(--danger-text);">P=${p.P} kN</span>
                        <span style="color:var(--text-3);">x=${Math.round((p.pos || 0) * L * 1000)} mm · ${p.case || 'L'}</span>
                        <button onclick="removeInfoPointLoad(${idx})" style="background:#b91c1c; border:none; color:white; width:18px; height:18px; border-radius:var(--r-ctl); cursor:pointer; font-size:var(--fs-xs);">✕</button>
                    </div>`).join('');
        }
        function addInfoPointLoad() {
            if (currentInfoBeam == null) return;
            const P = parseFloat(document.getElementById('infoPointLoadP')?.value);
            const x = parseFloat(document.getElementById('infoPointLoadX')?.value);
            const durum = document.getElementById('infoPointLoadCase')?.value || etkinYukDurumu();
            if (!kirisNoktaYukuEkle(currentInfoBeam, P, x, durum, 'global')) return;
            updateModelSummary(); updateBCLoadsTable(); updateInfoBeamPointLoads();
            if (currentViewMode === '3d') update3DScene(); else draw();
            showToast(`Point load ${P} kN at ${Math.round(x)} mm on Beam #${currentInfoBeam}`);
        }
        function removeInfoPointLoad(idx) {
            if (currentInfoBeam == null) return;
            kirisNoktaYukuSil(currentInfoBeam, idx);
            updateModelSummary(); updateBCLoadsTable(); updateInfoBeamPointLoads();
            if (currentViewMode === '3d') update3DScene(); else draw();
        }

        // Remove line load from Entity Info
        function removeInfoLineLoad(idx) {
            if (currentInfoBeam == null) return;
            
            const elem = model.elements[currentInfoBeam];
            if (!elem || !elem.lineLoads) return;
            
            saveState();
            elem.lineLoads.splice(idx, 1);
            
            updateModelSummary();
            updateBCLoadsTable();
            updateInfoBeamLineLoads(); if (typeof updateInfoBeamPointLoads === 'function') updateInfoBeamPointLoads();
            
            if (currentViewMode === '3d') {
                update3DScene();
            } else {
                draw();
            }
            
            showToast(`Line load removed from Beam #${currentInfoBeam}`, 'success');
        }
        
        // Info panel orientation functions
        function applyInfoBuckling() {
            if (currentInfoBeam == null) return;
            const elem = model.elements[currentInfoBeam];
            if (!elem) return;
            const ky = parseFloat(document.getElementById('infoBeamKy')?.value), kz = parseFloat(document.getElementById('infoBeamKz')?.value);
            const eg = document.getElementById('infoBeamCurve')?.value || '';
            saveState();
            if (ky > 0 && ky !== 1) elem.kY = ky; else delete elem.kY;
            if (kz > 0 && kz !== 1) elem.kZ = kz; else delete elem.kZ;
            if (eg) elem.burkulmaEgrisi = eg; else delete elem.burkulmaEgrisi;
            const klt = parseFloat(document.getElementById('infoBeamKlt')?.value);
            if (klt > 0 && klt !== 1) elem.kLT = klt; else delete elem.kLT;
            const yanal = document.getElementById('infoBeamYanal')?.value;
            if (yanal === '1') elem.yanalTutulu = true; else if (yanal === '0') elem.yanalTutulu = false; else delete elem.yanalTutulu;
            if (results && typeof updateResultsBottomPanel === 'function') updateResultsBottomPanel();
            if (results && typeof displayResults === 'function') displayResults();
        }

        // Mafsal kutulari: elem.hingeStart / hingeEnd. Sonuc varsa bayatlar;
        // sahne yeniden cizilir (mafsal isareti icin).
        function applyInfoHinges() {
            if (currentInfoBeam == null) return;
            const elem = model.elements[currentInfoBeam];
            if (!elem) return;
            saveState();
            const hs = !!document.getElementById('infoHingeStart')?.checked;
            const he = !!document.getElementById('infoHingeEnd')?.checked;
            if (hs) elem.hingeStart = true; else delete elem.hingeStart;
            if (he) elem.hingeEnd = true; else delete elem.hingeEnd;
            results = null;
            if (currentViewMode === '3d') update3DScene(); else draw();
            updateEntityInfoPanel();
        }

        function updateInfoOrientation(value) {
            const orientValue = document.getElementById('infoOrientationValue');
            if (orientValue) orientValue.textContent = value + '°';
            
            if (currentInfoBeam && model.elements[currentInfoBeam]) {
                model.elements[currentInfoBeam].orientation = parseInt(value);
                
                // Update section diagram and properties
                const elem = model.elements[currentInfoBeam];
                const sec = SECTIONS[elem.section];
                const orientation = parseInt(value);
                
                // Update diagram with rotation
                drawSectionDiagram(elem.section, orientation);
                
                // Update section properties for rotated orientation
                if (sec) {
                    // Static values
                    setText('infoSectionIy', (sec.Iy * 1e8).toFixed(1) + ' cm⁴');
                    setText('infoSectionWy', sec.Wy ? (sec.Wy * 1e6).toFixed(1) + ' cm³' : '-');
                    setText('infoSectionIz', sec.Iz ? (sec.Iz * 1e8).toFixed(1) + ' cm⁴' : '-');
                    setText('infoSectionWz', sec.Wz ? (sec.Wz * 1e6).toFixed(1) + ' cm³' : '-');
                    
                    // Effective values with orientation
                    const isRotated = Math.abs(orientation) === 90;
                    const effectivePanel = document.getElementById('infoEffectiveAxis');
                    
                    if (orientation !== 0 && effectivePanel) {
                        effectivePanel.style.display = 'block';
                        if (isRotated && sec.Iz) {
                            setText('infoEffectiveI', (sec.Iz * 1e8).toFixed(1) + ' cm⁴');
                            setText('infoEffectiveW', sec.Wz ? (sec.Wz * 1e6).toFixed(1) + ' cm³' : '-');
                        } else {
                            setText('infoEffectiveI', (sec.Iy * 1e8).toFixed(1) + ' cm⁴');
                            setText('infoEffectiveW', sec.Wy ? (sec.Wy * 1e6).toFixed(1) + ' cm³' : '-');
                        }
                    } else if (effectivePanel) {
                        effectivePanel.style.display = 'none';
                    }
                }
                
                if (currentViewMode === '3d') {
                    update3DScene();
                } else {
                    draw();
                }
            }
        }
        
        function setInfoOrientation(angle) {
            const orientSlider = document.getElementById('infoBeamOrientation');
            const orientValue = document.getElementById('infoOrientationValue');
            
            if (orientSlider) orientSlider.value = angle;
            if (orientValue) orientValue.textContent = angle + '°';
            
            if (currentInfoBeam && model.elements[currentInfoBeam]) {
                saveState();
                model.elements[currentInfoBeam].orientation = angle;
                
                // Update section diagram and properties
                const elem = model.elements[currentInfoBeam];
                const sec = SECTIONS[elem.section];
                
                drawSectionDiagram(elem.section, angle);
                
                if (sec) {
                    // Static values
                    setText('infoSectionIy', (sec.Iy * 1e8).toFixed(1) + ' cm⁴');
                    setText('infoSectionWy', sec.Wy ? (sec.Wy * 1e6).toFixed(1) + ' cm³' : '-');
                    setText('infoSectionIz', sec.Iz ? (sec.Iz * 1e8).toFixed(1) + ' cm⁴' : '-');
                    setText('infoSectionWz', sec.Wz ? (sec.Wz * 1e6).toFixed(1) + ' cm³' : '-');
                    
                    // Effective values with orientation
                    const isRotated = Math.abs(angle) === 90;
                    const effectivePanel = document.getElementById('infoEffectiveAxis');
                    
                    if (angle !== 0 && effectivePanel) {
                        effectivePanel.style.display = 'block';
                        if (isRotated && sec.Iz) {
                            setText('infoEffectiveI', (sec.Iz * 1e8).toFixed(1) + ' cm⁴');
                            setText('infoEffectiveW', sec.Wz ? (sec.Wz * 1e6).toFixed(1) + ' cm³' : '-');
                        } else {
                            setText('infoEffectiveI', (sec.Iy * 1e8).toFixed(1) + ' cm⁴');
                            setText('infoEffectiveW', sec.Wy ? (sec.Wy * 1e6).toFixed(1) + ' cm³' : '-');
                        }
                    } else if (effectivePanel) {
                        effectivePanel.style.display = 'none';
                    }
                }
                
                if (currentViewMode === '3d') {
                    update3DScene();
                } else {
                    draw();
                }
                
                showToast(`Orientation set to ${angle}°`);
            }
        }
        
        function applyInfoSection() {
            if (currentInfoBeam == null) return;
            
            saveState();
            
            const newSection = document.getElementById('infoEditSection').value;
            model.elements[currentInfoBeam].section = newSection;
            
            // Ensure section exists
            layerToSection(newSection);
            
            updateModelSummary();
            updateSectionTable();
            showBeamInfo(currentInfoBeam);
            
            if (currentViewMode === '3d') {
                update3DScene();
            } else {
                draw();
            }
            
            showToast(`Beam #${currentInfoBeam} section changed to ${newSection}`);
        }
        
        function applyBCToSelected(type) {
            if (selectedNodes.size === 0) {
                showToast('Select nodes first', 'warning');
                return;
            }
            
            saveState();
            
            const bcMap = {
                'fixed': { Ux: true, Uy: true, Uz: true, Rx: true, Ry: true, Rz: true },
                'pinned': { Ux: true, Uy: true, Uz: true, Rx: false, Ry: false, Rz: false },
                'simply': { Ux: false, Uy: false, Uz: true, Rx: false, Ry: false, Rz: false },
                'free': null
            };
            
            selectedNodes.forEach(nodeId => {
                if (type === 'free') {
                    delete model.constraints[nodeId];
                } else {
                    model.constraints[nodeId] = { ...bcMap[type] };
                }
            });
            
            updateModelSummary();
            updateBCTable();
            updateEntityInfoPanel();
            
            if (currentViewMode === '3d') {
                update3DScene();
            } else {
                draw();
            }
            
            // Switch to Boundary tab when BC is applied (not for 'free')
            if (type !== 'free') {
                switchMainTab('boundary');
            }
            
            showToast(`${type.toUpperCase()} applied to ${selectedNodes.size} nodes`);
        }
        
        // Set multi-selection BC with checkboxes
        function setMultiBC(type) {
            const bcMap = {
                'fixed': [true, true, true, true, true, true],
                'pinned': [true, true, true, false, false, false],
                'simply': [false, false, true, false, false, false],
                'free': [false, false, false, false, false, false]
            };
            
            const [ux, uy, uz, rx, ry, rz] = bcMap[type] || bcMap['free'];
            
            // Update checkboxes
            const setCheck = (id, val) => {
                const el = document.getElementById(id);
                if (el) el.checked = val;
            };
            
            setCheck('multiBcUx', ux);
            setCheck('multiBcUy', uy);
            setCheck('multiBcUz', uz);
            setCheck('multiBcRx', rx);
            setCheck('multiBcRy', ry);
            setCheck('multiBcRz', rz);
            
            // Apply to selected nodes
            applyMultiBC();
        }
        
        // Apply BC from checkboxes to selected nodes
        function applyMultiBC() {
            if (selectedNodes.size === 0) {
                showToast('Select nodes first', 'warning');
                return;
            }
            
            const bc = {
                Ux: document.getElementById('multiBcUx')?.checked || false,
                Uy: document.getElementById('multiBcUy')?.checked || false,
                Uz: document.getElementById('multiBcUz')?.checked || false,
                Rx: document.getElementById('multiBcRx')?.checked || false,
                Ry: document.getElementById('multiBcRy')?.checked || false,
                Rz: document.getElementById('multiBcRz')?.checked || false
            };
            
            const hasConstraint = Object.values(bc).some(v => v);
            
            saveState();
            
            selectedNodes.forEach(nodeId => {
                if (hasConstraint) {
                    model.constraints[nodeId] = { ...bc };
                } else {
                    delete model.constraints[nodeId];
                }
            });
            
            updateModelSummary();
            updateBCTable();
            updateEntityInfoPanel();
            
            if (currentViewMode === '3d') {
                update3DScene();
            } else {
                draw();
            }
            
            if (hasConstraint) {
                switchMainTab('boundary');
            }
            
            showToast(`BC applied to ${selectedNodes.size} nodes`);
        }
        
        // Apply point load to selected nodes
        function applyLoadToSelectedNodes() {
            if (selectedNodes.size === 0) {
                showToast('Select nodes first', 'warning');
                return;
            }
            
            const fx = parseFloat(document.getElementById('multiLoadFx')?.value) || 0;
            const fy = parseFloat(document.getElementById('multiLoadFy')?.value) || 0;
            const fz = parseFloat(document.getElementById('multiLoadFz')?.value) || 0;
            
            if (fx === 0 && fy === 0 && fz === 0) {
                showToast('Enter at least one non-zero load value', 'warning');
                return;
            }
            
            saveState();
            
            let count = 0;
            selectedNodes.forEach(nodeId => {
                // Check if load already exists for this node
                const existingIdx = model.loads.findIndex(l => l.nodeId === nodeId);
                
                if (existingIdx >= 0) {
                    // Update existing
                    model.loads[existingIdx].Fx = fx;
                    model.loads[existingIdx].Fy = fy;
                    model.loads[existingIdx].Fz = fz;
                } else {
                    // Add new
                    model.loads.push({ case: etkinYukDurumu(),
                        nodeId: nodeId,
                        Fx: fx, Fy: fy, Fz: fz,
                        Mx: 0, My: 0, Mz: 0
                    });
                }
                count++;
            });
            
            updateModelSummary();
            updateBCLoadsTable();
            
            if (currentViewMode === '3d') {
                update3DScene();
            } else {
                draw();
            }
            
            switchMainTab('loads');
            showToast(`Load applied to ${count} nodes`);
        }
        
        // Apply line load to selected beams
        function applyLineLoadToSelectedBeams() {
            if (selectedElements.size === 0) {
                showToast('Select beams first', 'warning');
                return;
            }
            
            const q = parseFloat(document.getElementById('multiLineLoadQ')?.value) || 10;
            const direction = document.getElementById('multiLineLoadDir')?.value || 'global';
            
            if (q === 0) {
                showToast('Enter a non-zero load value', 'warning');
                return;
            }
            
            saveState();
            
            let count = 0;
            selectedElements.forEach(elemId => {
                const elem = model.elements[elemId];
                if (elem) {
                    if (!elem.lineLoads) elem.lineLoads = [];
                    elem.lineLoads.push({ case: etkinYukDurumu(),
                        value: q,
                        q: q,
                        direction: direction,
                        start: 0,
                        end: 1,
                        startPct: 0,
                        endPct: 100
                    });
                    count++;
                }
            });
            
            updateModelSummary();
            updateBCLoadsTable();
            
            if (currentViewMode === '3d') {
                update3DScene();
            } else {
                draw();
            }
            
            switchMainTab('loads');
            showToast(`Line load q=${q} kN/m applied to ${count} beams`);
        }
        
        function applySectionToSelected() {
            if (selectedElements.size === 0) {
                showToast('Select beams first', true);
                return;
            }
            
            saveState();
            
            const newSection = document.getElementById('infoMultiSection').value;
            layerToSection(newSection);
            
            selectedElements.forEach(elemId => {
                model.elements[elemId].section = newSection;
            });
            
            updateModelSummary();
            updateSectionTable();
            updateEntityInfoPanel();
            
            if (currentViewMode === '3d') {
                update3DScene();
            } else {
                draw();
            }
            
            showToast(`${newSection} applied to ${selectedElements.size} beams`);
        }
        
        function addQuickLoad() {
            if (selectedNodes.size !== 1) {
                showToast('Select exactly one node first', true);
                return;
            }
            
            const nodeId = Array.from(selectedNodes)[0];
            const fz = parseFloat(document.getElementById('quickLoadFz').value) || 0;
            
            if (fz === 0) {
                showToast('Enter a non-zero load value', true);
                return;
            }
            
            saveState();
            
            model.loads.push({ case: etkinYukDurumu(),
                nodeId: nodeId,
                Fx: 0, Fy: 0, Fz: fz,
                Mx: 0, My: 0, Mz: 0
            });
            
            updateModelSummary();
            updateLoadTable();
            updateEntityInfoPanel();
            
            if (currentViewMode === '3d') {
                update3DScene();
            } else {
                draw();
            }
            
            showToast(`Load Fz=${fz}kN added to Node #${nodeId}`);
        }
        
        function addQuickLineLoad() {
            if (selectedElements.size === 0) {
                showToast('Select at least one element first', 'warning');
                return;
            }
            
            // If multiple selected, use the first one
            const elemId = Array.from(selectedElements)[0];
            const elem = model.elements[elemId];
            
            if (!elem) {
                showToast('Element not found', 'error');
                return;
            }
            
            const q = parseFloat(document.getElementById('quickLineLoadQ').value) || 0;
            const direction = document.getElementById('quickLineLoadDir').value;
            const startPercent = parseFloat(document.getElementById('quickLineLoadStart').value) || 0;
            const endPercent = parseFloat(document.getElementById('quickLineLoadEnd').value) || 100;
            
            if (q === 0) {
                showToast('Enter a non-zero load value', 'warning');
                return;
            }
            
            if (startPercent >= endPercent) {
                showToast('Start must be less than End', 'warning');
                return;
            }
            
            saveState();
            
            // Initialize lineLoads array if not exists
            if (!elem.lineLoads) {
                elem.lineLoads = [];
            }
            
            elem.lineLoads.push({ case: etkinYukDurumu(),
                value: q,              // Primary property
                q: q,                  // Keep for compatibility
                direction: direction,
                start: startPercent / 100,
                end: endPercent / 100
            });
            
            updateModelSummary();
            updateLineLoadTable();
            updateEntityInfoPanel();
            
            if (currentViewMode === '3d') {
                update3DScene();
            } else {
                draw();
            }
            
            showToast(`Line load q=${q}kN/m added to Element #${elemId}`);
        }
        
        function addLineLoadToAllSelected() {
            if (selectedElements.size === 0) {
                showToast('Select elements first (use Ctrl+Click or box select)', 'warning');
                return;
            }
            
            const q = parseFloat(document.getElementById('quickLineLoadQ').value) || 0;
            const direction = document.getElementById('quickLineLoadDir').value;
            const startPercent = parseFloat(document.getElementById('quickLineLoadStart').value) || 0;
            const endPercent = parseFloat(document.getElementById('quickLineLoadEnd').value) || 100;
            
            if (q === 0) {
                showToast('Enter a non-zero load value', 'warning');
                return;
            }
            
            if (startPercent >= endPercent) {
                showToast('Start must be less than End', 'warning');
                return;
            }
            
            saveState();
            
            let count = 0;
            selectedElements.forEach(elemId => {
                const elem = model.elements[elemId];
                if (elem) {
                    if (!elem.lineLoads) {
                        elem.lineLoads = [];
                    }
                    elem.lineLoads.push({ case: etkinYukDurumu(),
                        value: q,
                        q: q,
                        direction: direction,
                        start: startPercent / 100,
                        end: endPercent / 100
                    });
                    count++;
                }
            });
            
            updateModelSummary();
            updateLineLoadTable();
            updateEntityInfoPanel();
            
            if (currentViewMode === '3d') {
                update3DScene();
            } else {
                draw();
            }
            
            showToast(`Line load q=${q}kN/m added to ${count} element(s)`, 'success');
        }
        
        // ============== OLD TAB SWITCHING (kept for compatibility) ==============
        function switchTab(name) {
            document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            const tabEl = document.getElementById(`tab-${name}`);
            if (tabEl) tabEl.classList.add('active');
            if (event && event.target) event.target.classList.add('active');
        }
        
