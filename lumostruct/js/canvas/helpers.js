        // ============== THEME TOGGLE ==============
        // Sahnenin arka planini temaya gore ayarlayan TEK yer. Iki dosyada iki farkli
        // koyu ton ve iki ayri atama vardi; hangisinin kazandigi cagri sirasina kaliyordu
        // ve acik temada kanvas koyu kalabiliyordu.
        function applyThemeToScene() {
            if (typeof threeScene === 'undefined' || !threeScene || typeof THREE === 'undefined') return;
            const isLight = document.body.classList.contains('light-mode');
            threeScene.background = new THREE.Color(isLight ? 0xf8fafc : 0x0a0e17);
            if (typeof rebuildGizmoDisk === 'function') rebuildGizmoDisk();
        }

        function toggleTheme() {
            const body = document.body;
            const btn = document.getElementById('themeToggle');
            
            body.classList.toggle('light-mode');
            
            const isLight = body.classList.contains('light-mode');
            // textContent HTML ayristirmaz: ham <svg> kaynagi basliga metin olarak dokuluyordu
            btn.innerHTML = isLight ? '<span class="icon"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg></span>' : '<span class="icon"><svg viewBox="0 0 24 24"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg></span>';
            btn.title = isLight ? 'Switch to Dark Mode' : 'Switch to Light Mode';
            
            // Save preference
            localStorage.setItem('theme', isLight ? 'light' : 'dark');
            
            // Update Three.js scene colors
            if (threeScene) {
                applyThemeToScene();
                
                // Update grid colors - use recreateGrid if available
                if (typeof recreateGrid === 'function') {
                    recreateGrid();
                } else if (window.gridHelper) {
                    threeScene.remove(window.gridHelper);
                    window.gridHelper = new THREE.GridHelper(500, 500, 
                        isLight ? 0xcbd5e1 : 0x334155, 
                        isLight ? 0xe2e8f0 : 0x1e293b
                    );
                    window.gridHelper.rotation.x = Math.PI / 2;
                    window.gridHelper.isGridHelper = true;
                    threeScene.add(window.gridHelper);
                }
            }
            
            // Redraw canvas with new colors
            if (currentViewMode === '3d') {
                update3DScene();
            } else {
                draw();
            }
        }
        
        // Initialize theme from localStorage
        (function initTheme() {
            const saved = localStorage.getItem('theme');
            if (saved === 'light') {
                document.body.classList.add('light-mode');
                const btn = document.getElementById('themeToggle');
                if (btn) {
                    btn.innerHTML = '<span class="icon"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg></span>';
                    btn.title = 'Switch to Dark Mode';
                }
            }
            // Sahne henuz yoksa initThreeJS zaten temaya bakar; varsa burada guncellenir.
            applyThemeToScene();
        })();
        
        // PURGE - Merge overlapping nodes
        function purgeOverlappingNodes(tolerance = 0.001) {
            // tolerance in meters (default 1mm)
            const nodeIds = Object.keys(model.nodes).map(id => parseInt(id));
            if (nodeIds.length < 2) {
                showToast('Not enough nodes to purge', 'info');
                return 0;
            }
            
            saveState();
            
            let mergedCount = 0;
            const nodeMap = {}; // oldId -> newId mapping
            const keepNodes = new Set();
            
            // Find overlapping nodes
            for (let i = 0; i < nodeIds.length; i++) {
                const id1 = nodeIds[i];
                if (nodeMap[id1] !== undefined) continue; // Already merged
                
                const n1 = model.nodes[id1];
                if (!n1) continue;
                
                keepNodes.add(id1);
                nodeMap[id1] = id1; // Maps to itself
                
                for (let j = i + 1; j < nodeIds.length; j++) {
                    const id2 = nodeIds[j];
                    if (nodeMap[id2] !== undefined) continue; // Already merged
                    
                    const n2 = model.nodes[id2];
                    if (!n2) continue;
                    
                    // Uzaklik UC BOYUTLU: eskiden z'ye bakilmiyordu, kolonun
                    // iki ucu (ayni x,y) birlestirilip kolon siliniyordu.
                    const dx = n1.x - n2.x;
                    const dy = n1.y - n2.y;
                    const dz = (n1.z || 0) - (n2.z || 0);
                    const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
                    
                    if (dist <= tolerance) {
                        // Merge n2 into n1
                        nodeMap[id2] = id1;
                        mergedCount++;
                    }
                }
            }
            
            if (mergedCount === 0) {
                showToast('No overlapping nodes found', 'info');
                return 0;
            }
            
            // Update all elements to use new node IDs
            Object.values(model.elements).forEach(elem => {
                if (nodeMap[elem.n1] !== undefined && nodeMap[elem.n1] !== elem.n1) {
                    elem.n1 = nodeMap[elem.n1];
                }
                if (nodeMap[elem.n2] !== undefined && nodeMap[elem.n2] !== elem.n2) {
                    elem.n2 = nodeMap[elem.n2];
                }
            });
            
            // Update constraints
            if (model.constraints) {
                const newConstraints = {};
                Object.entries(model.constraints).forEach(([nodeId, constraint]) => {
                    const id = parseInt(nodeId);
                    const newId = nodeMap[id] !== undefined ? nodeMap[id] : id;
                    // Birlesen dugumlerin mesnetleri TOPLANIR (sonuncu kazanmaz)
                    newConstraints[newId] = mesnetleriTopla(newConstraints[newId], constraint);
                });
                model.constraints = newConstraints;
            }
            
            // Update loads
            if (model.loads) {
                model.loads.forEach(load => {
                    if (load.nodeId && nodeMap[load.nodeId] !== undefined) {
                        load.nodeId = nodeMap[load.nodeId];
                    }
                });
            }
            
            // Delete merged nodes
            Object.keys(nodeMap).forEach(oldId => {
                const id = parseInt(oldId);
                if (nodeMap[id] !== id) {
                    delete model.nodes[id];
                }
            });
            
            // Remove duplicate beams (same n1-n2 pair)
            const beamKeys = new Set();
            const duplicateBeams = [];
            Object.entries(model.elements).forEach(([elemId, elem]) => {
                const key1 = `${elem.n1}-${elem.n2}`;
                const key2 = `${elem.n2}-${elem.n1}`;
                if (beamKeys.has(key1) || beamKeys.has(key2)) {
                    duplicateBeams.push(parseInt(elemId));
                } else {
                    beamKeys.add(key1);
                }
            });
            
            duplicateBeams.forEach(id => delete model.elements[id]);
            
            // Remove zero-length beams (n1 === n2)
            const zeroLengthBeams = [];
            Object.entries(model.elements).forEach(([elemId, elem]) => {
                if (elem.n1 === elem.n2) {
                    zeroLengthBeams.push(parseInt(elemId));
                }
            });
            zeroLengthBeams.forEach(id => delete model.elements[id]);
            
            // Update display
            updateModelSummary();
            if (currentViewMode === '3d') update3DScene();
            else draw();
            
            const totalRemoved = mergedCount + duplicateBeams.length + zeroLengthBeams.length;
            let msg = `Purged: ${mergedCount} overlapping node(s)`;
            if (duplicateBeams.length > 0) msg += `, ${duplicateBeams.length} duplicate beam(s)`;
            if (zeroLengthBeams.length > 0) msg += `, ${zeroLengthBeams.length} zero-length beam(s)`;
            showToast(msg, 'success');
            
            return totalRemoved;
        }
        
        // PURGE command with custom tolerance
        function purgeModel(toleranceMM = 1) {
            const tolerance = toleranceMM / 1000; // mm to m
            return purgeOverlappingNodes(tolerance);
        }
        
        // Custom confirm modal - Promise based
        let confirmResolve = null;
        
        function showConfirm(title, message, subtext = '', buttonText = 'OK', isDanger = false, cancelText = 'Cancel') {
            return new Promise((resolve) => {
                confirmResolve = resolve;
                
                document.getElementById('confirmModalTitle').textContent = title;
                document.getElementById('confirmModalMessage').textContent = message;
                document.getElementById('confirmModalSubtext').textContent = subtext;
                
                // Onay dugmesi: metin yeter, tik ikonu bilgi tasimiyordu.
                const okBtn = document.getElementById('confirmModalOkBtn');
                okBtn.textContent = buttonText;
                const cancelBtn = document.getElementById('confirmModalCancelBtn');
                if (cancelBtn) cancelBtn.textContent = cancelText;
                okBtn.classList.toggle('btn-danger', !!isDanger);

                document.getElementById('confirmModal').classList.add('active');
            });
        }
        
        function resolveConfirm(result) {
            document.getElementById('confirmModal').classList.remove('active');
            if (confirmResolve) {
                confirmResolve(result);
                confirmResolve = null;
            }
        }
        
        async function clearAll() {
            if (Object.keys(model.nodes).length === 0 && Object.keys(model.elements).length === 0) {
                showToast('Model is already empty', 'info');
                return;
            }
            
            const confirmed = await showConfirm(
                'Clear Entire Model',
                'Are you sure you want to clear the entire model?',
                'This action can be undone with Ctrl+Z.',
                'Clear All',
                true
            );
            if (!confirmed) return;
            
            saveState(); // Save before clearing
            
            model = {
                nodes: {},
                elements: {},
                constraints: {},
                loads: [],
                pressure: []
            };
            results = null;
            nextNodeId = 1;
            nextElementId = 1;
            
            updateModelSummary();
            clearSelection();
            
            // Hide results panel (with null checks)
            const resultsPanel = document.getElementById('resultsPanel');
            const noResults = document.getElementById('noResults');
            const noResultsMsg = document.getElementById('noResultsMsg');
            if (resultsPanel) resultsPanel.style.display = 'none';
            if (noResults) noResults.style.display = 'block';
            if (noResultsMsg) noResultsMsg.style.display = 'block';
            
            // Reset deformed view
            view.showDeformed = false;
            const btnDeformed = document.getElementById('btnDeformed');
            if (btnDeformed) btnDeformed.style.background = '';
            const exagControl = document.getElementById('exaggerationControl');
            if (exagControl) exagControl.style.display = 'none';
            
            // Reset stress visualization
            view.showStress = false;
            view.showMoment = false;
            view.showShear = false;
            const btnStressViz = document.getElementById('btnStressViz');
            const btnMomentViz = document.getElementById('btnMomentViz');
            const btnShearViz = document.getElementById('btnShearViz');
            const stressLegend = document.getElementById('stressLegend');
            if (btnStressViz) btnStressViz.classList.remove('active');
            if (btnMomentViz) btnMomentViz.classList.remove('active');
            if (btnShearViz) btnShearViz.classList.remove('active');
            if (stressLegend) stressLegend.style.display = 'none';
            
            if (currentViewMode === '3d') {
                update3DScene();
            } else {
                draw();
            }
            
            showToast('Model cleared', 'success');
            saveState(); // Save empty state
        }
        
        // Clear only model geometry (also clears loads and boundaries)
        async function clearModel() {
            if (Object.keys(model.nodes).length === 0 && Object.keys(model.elements).length === 0) {
                showToast('Model is already empty', 'info');
                return;
            }
            
            const confirmed = await showConfirm(
                'Clear Model',
                'Clear entire model?',
                'This will also remove all loads and boundary conditions.\nThis action can be undone with Ctrl+Z.',
                'Clear Model',
                true
            );
            if (!confirmed) return;
            
            saveState();
            
            model.nodes = {};
            model.elements = {};
            model.constraints = {};
            model.loads = [];
            model.pressure = [];
            if (Array.isArray(model.planes)) model.planes = [];
            results = null;
            nextNodeId = 1;
            nextElementId = 1;
            
            // ACILIS DURUMU. saveState yukarida sonucu "bayat" isaretledi,
            // results de sonra sifirlandi: bos modelde "Re-solve" uyarisi
            // kaliyordu. Bayraklar sifirlanir, gorunus General sekmesine ve
            // kalan panel/lejant temizlenir - ilk acilistaki ekran.
            modelChangedAfterSolve = false;
            showResultsVisualization = false;
            if (typeof updateResultsWarning === 'function') updateResultsWarning();
            const lejant = document.getElementById('stressLegend');
            if (lejant) lejant.style.display = 'none';
            if (typeof clearWorkPlane === 'function' && typeof activeWorkPlane !== 'undefined' && activeWorkPlane) clearWorkPlane();
            if (typeof cancelCommand === 'function') cancelCommand();
            
            updateModelSummary();
            updateLoadsList();
            clearSelection();
            if (typeof updateEntityInfoPanel === 'function') updateEntityInfoPanel();
            if (typeof updateResultsBottomPanel === 'function') updateResultsBottomPanel();
            // Sonuc sekmesi "henuz cozum yok" haline doner (displayResults sonuc ister).
            const yok = document.getElementById('noResults'), var_ = document.getElementById('resultsPanel');
            if (yok) yok.style.display = 'block';
            if (var_) var_.style.display = 'none';
            if (typeof switchMainTab === 'function') switchMainTab('general');
            if (typeof updateCommandUI === 'function') updateCommandUI();   // "1 selected" kalintisi
            
            if (currentViewMode === '3d') {
                update3DScene();
            } else {
                draw();
            }
            
            showToast('Model cleared - new model', 'success');
        }
        
        // Clear only boundary conditions
        async function clearBoundaries() {
            if (Object.keys(model.constraints).length === 0) {
                showToast('No boundary conditions to clear', 'info');
                return;
            }
            
            const confirmed = await showConfirm(
                'Clear Boundaries',
                'Clear all boundary conditions?',
                'This action can be undone with Ctrl+Z.',
                'Clear Boundaries',
                true
            );
            if (!confirmed) return;
            
            saveState();
            
            model.constraints = {};
            results = null;
            
            updateModelSummary();
            
            if (currentViewMode === '3d') {
                update3DScene();
            } else {
                draw();
            }
            
            showToast(`Boundary conditions cleared`, 'success');
        }
        
        // Clear only loads
        async function clearLoads() {
            // Check if there are any loads (point loads, pressure, or line loads)
            const hasPointLoads = model.loads.length > 0;
            const hasPressure = model.pressure && model.pressure.length > 0;
            const hasLineLoads = Object.values(model.elements).some(elem => elem.lineLoads && elem.lineLoads.length > 0);
            
            if (!hasPointLoads && !hasPressure && !hasLineLoads) {
                showToast('No loads to clear', 'info');
                return;
            }
            
            const confirmed = await showConfirm(
                'Clear Loads',
                'Clear all loads?',
                'This will remove point loads, line loads, and pressure loads. This action can be undone with Ctrl+Z.',
                'Clear Loads',
                true
            );
            if (!confirmed) return;
            
            saveState();
            
            model.loads = [];
            model.pressure = [];
            
            // Clear line loads from elements
            Object.values(model.elements).forEach(elem => {
                if (elem.lineLoads) elem.lineLoads = [];
            });
            
            results = null;
            
            updateModelSummary();
            updateLoadsList();
            
            if (currentViewMode === '3d') {
                update3DScene();
            } else {
                draw();
            }
            
            showToast('All loads cleared', 'success');
        }
        
        // Keyboard shortcuts for undo/redo
        document.addEventListener('keydown', function(e) {
            // Don't trigger shortcuts when typing in inputs
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') {
                return;
            }
            
            // Ctrl+Z: Undo
            if (e.ctrlKey && e.key === 'z') {
                e.preventDefault();
                undo();
                return;
            }
            
            // Ctrl+Y: Redo
            if (e.ctrlKey && e.key === 'y') {
                e.preventDefault();
                redo();
                return;
            }
            
            // Ctrl+A: Select All
            if (e.ctrlKey && e.key === 'a') {
                e.preventDefault();
                selectAll();
                return;
            }
            
            // Ctrl+D: Duplicate (open modal)
            if (e.ctrlKey && e.key === 'd') {
                e.preventDefault();
                showCopyModal();
                return;
            }
            
            // Ctrl+S: Export (Save)
            if (e.ctrlKey && e.key === 's') {
                e.preventDefault();
                exportJSON();
                return;
            }
            
            // Delete/Backspace: Delete Selected
            if (e.key === 'Delete' || e.key === 'Backspace') {
                e.preventDefault();
                deleteSelected();
                return;
            }
            
            // Escape: Close modals or Clear Selection
            if (e.key === 'Escape') {
                // Check if any modal is open
                const copyModal = document.getElementById('copyModal');
                const mirrorModal = document.getElementById('mirrorModal');
                const splitModal = document.getElementById('splitModal');
                
                // Acik olmanin olcusu 'active' sinifi, display DEGIL.
                // display'e bakan eski kontrol, pencere hic acilmamisken bile
                // 'none' olmadigi icin "acik" sanip Escape'i yutacakti:
                // secim temizlenmezdi.
                if (copyModal && copyModal.classList.contains('active')) {
                    closeCopyModal();
                    return;
                }
                if (mirrorModal && mirrorModal.classList.contains('active')) {
                    closeMirrorModal();
                    return;
                }
                if (splitModal && splitModal.classList.contains('active')) {
                    closeSplitModal();
                    return;
                }
                
                clearSelection();
                return;
            }
            
            // F: Fit View
            if (e.key === 'f' || e.key === 'F') {
                fitView();
                return;
            }
            
            // 1: Plan View (2D)
            if (e.key === '1') {
                setViewMode('plan');
                return;
            }
            
            // 2: Front View
            if (e.key === '2') {
                setViewMode('front');
                return;
            }
            
            // 3: 3D View
            if (e.key === '3') {
                setViewMode('3d');
                return;
            }
            
            // D: Toggle Deformed
            if (e.key === 'd' || e.key === 'D') {
                toggleDisplay('deformed');
                return;
            }
            
            // N: Toggle Nodes
            // G: Toggle Grid
            if (e.key === 'g' || e.key === 'G') {
                toggleDisplay('grid');
                return;
            }
            
            // N: Toggle Nodes
            if (e.key === 'n' || e.key === 'N') {
                toggleDisplay('nodes');
                return;
            }
            
            // B: Toggle Beams
            if (e.key === 'b' || e.key === 'B') {
                toggleDisplay('beams');
                return;
            }
            
            // L: Toggle Loads
            if (e.key === 'l' || e.key === 'L') {
                toggleDisplay('loads');
                return;
            }
            
            // T: Toggle Labels
            if (e.key === 't' || e.key === 'T') {
                toggleDisplay('labels');
                return;
            }
            
            // I: Toggle Node IDs
            if (e.key === 'i' || e.key === 'I') {
                toggleDisplay('nodeIds');
                return;
            }
            
            // P: Toggle Snap
            if (e.key === 'p' || e.key === 'P') {
                toggleSnap();
                return;
            }
            
            // S: Toggle Stress Visualization
            if (e.key === 's' || e.key === 'S') {
                if (!e.ctrlKey) {
                    toggleStressVisualization();
                    return;
                }
            }
            
            // M: Toggle Moment Diagram
            if (e.key === 'm' || e.key === 'M') {
                toggleMomentDiagram();
                return;
            }
            
            // V: Toggle Shear Diagram
            if (e.key === 'v' || e.key === 'V') {
                toggleShearDiagram();
                return;
            }
            
            // +/=: Zoom In
            if (e.key === '+' || e.key === '=') {
                zoomIn();
                return;
            }
            
            // -: Zoom Out
            if (e.key === '-') {
                zoomOut();
                return;
            }
            
            // Space: Solve
            if (e.key === ' ') {
                e.preventDefault();
                solveModel();
                return;
            }
            
            // ?: Show Help
            if (e.key === '?' || (e.shiftKey && e.key === '/')) {
                showHelp();
                return;
            }
        });
        
        let results = null;
        let modelChangedAfterSolve = false;  // Track if model changed after last solve
        let showResultsVisualization = false;  // Only show results in Results tab
        
        let view = {
            offsetX: 0,
            offsetY: 0,
            scale: 50,
            showGrid: true,
            showBeams: true,
            showNodes: true,
            showLoads: true,
            showLabels: false,   // Show beam section labels
            showNodeIds: false,  // Show node ID numbers
            showNodeCoords: false, // Show node coordinates
            showElemIds: false,  // Show element IDs
            showDeformed: false,
            showSection: false,  // Show real beam cross-sections in 3D
            showStress: false,   // Color beams by stress level
            showMoment: false,   // Show bending moment diagram
            showShear: false,    // Show shear force diagram
            diagramScale: 1.0,   // Scale factor for diagrams
            deformationScale: 50,  // Exaggeration factor for deformed shape
            snapEnabled: true,   // Snap to existing nodes
            snapDistance: 15     // Snap distance in pixels
        };
        
