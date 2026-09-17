        // ============== IMPORT WIZARD ==============
        let pendingImportFile = null;
        let pendingImportType = 'steel';  // 'steel' or 'dxf'
        let importStructureType = 'deck';  // 'deck' or 'bulkhead'
        let bulkheadOrientation = 'YZ';    // 'YZ' or 'XZ'
        
        function openImportWizard(file, type) {
            if (!file) {
                debugError('No file provided to openImportWizard');
                return;
            }
            
            pendingImportFile = file;
            pendingImportType = type;
            
            // Update file name display
            document.getElementById('importFileName').textContent = file.name;
            
            // Reset to defaults
            selectImportType('deck');
            
            // Show modal
            document.getElementById('importWizardModal').classList.add('active');
        }
        
        function closeImportWizard(event) {
            if (event && event.target !== event.currentTarget) return;
            document.getElementById('importWizardModal').classList.remove('active');
            pendingImportFile = null;
            
            // Reset file inputs
            document.getElementById('importSteelFile').value = '';
            document.getElementById('dxfFile').value = '';
        }
        
        function selectImportType(type) {
            importStructureType = type;
            
            // Update buttons
            document.getElementById('importTypeDeck').classList.toggle('active', type === 'deck');
            document.getElementById('importTypeBulkhead').classList.toggle('active', type === 'bulkhead');
            
            // Show/hide options
            document.getElementById('deckOptions').style.display = type === 'deck' ? 'block' : 'none';
            document.getElementById('bulkheadOptions').style.display = type === 'bulkhead' ? 'block' : 'none';
        }
        
        function selectBulkheadOrient(orient) {
            bulkheadOrientation = orient;
            document.getElementById('bulkheadOrientYZ').classList.toggle('active', orient === 'YZ');
            document.getElementById('bulkheadOrientXZ').classList.toggle('active', orient === 'XZ');
        }
        
        function confirmImport() {
            if (!pendingImportFile) {
                showToast('No file selected', 'error');
                return;
            }
            
            // Get position values
            const deckZ = parseFloat(document.getElementById('deckZLevel').value) / 1000;  // Convert mm to m
            const bulkheadX = parseFloat(document.getElementById('bulkheadXPos').value) / 1000;  // Convert mm to m
            
            // Save file and type before closing (closeImportWizard sets pendingImportFile to null)
            const fileToProcess = pendingImportFile;
            const typeToProcess = pendingImportType;
            const structType = importStructureType;
            const bhOrient = bulkheadOrientation;
            
            // Close wizard
            closeImportWizard();
            
            // Process import based on type
            if (typeToProcess === 'steel') {
                processImportSteelFile(fileToProcess, structType, deckZ, bulkheadX, bhOrient);
            } else if (typeToProcess === 'dxf') {
                processImportDXF(fileToProcess, structType, deckZ, bulkheadX, bhOrient);
            }
        }
        
        // ============== STEEL FILE IMPORT (Only Geometry) ==============
        function importSteelFile(event) {
            const file = event.target.files[0];
            if (!file) return;
            
            // Open wizard instead of direct import
            openImportWizard(file, 'steel');
        }
        
        function processImportSteelFile(file, structureType, deckZ, bulkheadX, bulkheadOrient) {
            showLoading('Importing Steel geometry...');
            const reader = new FileReader();
            
            reader.onload = e => {
                try {
                    const xmlText = e.target.result;
                    const parser = new DOMParser();
                    const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
                    
                    // Check for parse errors
                    const parseError = xmlDoc.querySelector('parsererror');
                    if (parseError) {
                        throw new Error('Invalid XML format');
                    }
                    
                    // Parse Steel XML - only nodes and beams
                    const importedData = parseSteelXML(xmlDoc);
                    
                    if (importedData.nodes.length === 0) {
                        throw new Error('No nodes found in Steel file');
                    }
                    
                    // Ask user whether to replace or merge
                    const hasExistingModel = Object.keys(model.nodes).length > 0;
                    let mergeMode = false;
                    
                    if (hasExistingModel) {
                        mergeMode = confirm('Merge with existing model?\n\nYes = Add to current model\nNo = Replace current model');
                    }
                    
                    if (!mergeMode) {
                        // Clear existing model
                        model.nodes = {};
                        model.elements = {};
                        model.constraints = {};
                        model.loads = [];
                        model.pressure = [];
                        nextNodeId = 1;
                        nextElementId = 1;
                    }
                    
                    // Import nodes with ID mapping and coordinate transformation
                    const nodeIdMap = {}; // oldId -> newId
                    
                    importedData.nodes.forEach(n => {
                        const newId = nextNodeId++;
                        nodeIdMap[n.id] = newId;
                        
                        // Apply coordinate transformation based on structure type
                        let finalX, finalY;
                        
                        if (structureType === 'deck') {
                            // Deck: XY plane at Z=deckZ
                            // Input coords (x, y) stay as (x, y)
                            finalX = n.x;
                            finalY = n.y;
                            // Note: Z (deckZ) would be used in 3D but grillage is 2D
                        } else if (structureType === 'bulkhead') {
                            // Bulkhead: transform based on orientation
                            if (bulkheadOrient === 'YZ') {
                                // YZ plane at X=bulkheadX (transverse bulkhead)
                                // Input (x, y) becomes (y, z) in model coords
                                // x from input -> Y in model
                                // y from input -> could be Z (vertical)
                                finalX = n.x;  // Y position
                                finalY = n.y;  // Z position
                            } else {
                                // XZ plane (longitudinal bulkhead)
                                // Input (x, y) becomes (x, z)
                                finalX = n.x;
                                finalY = n.y;
                            }
                        }
                        
                        model.nodes[newId] = {
                            id: newId,
                            x: finalX,
                            y: finalY
                        };
                    });
                    
                    // Import beams with default section (geometry only)
                    importedData.beams.forEach(b => {
                        const newN1 = nodeIdMap[b.n1];
                        const newN2 = nodeIdMap[b.n2];
                        
                        if (newN1 && newN2) {
                            const newId = nextElementId++;
                            model.elements[newId] = {
                                id: newId,
                                n1: newN1,
                                n2: newN2,
                                section: 'HP200x10',  // Default section
                                orientation: 0,
                                lineLoads: []
                            };
                        }
                    });
                    
                    results = null;
                    clearSelection();
                    updateModelSummary();
                    updateSectionDropdowns();
                    fitView();
                    saveState();
                    hideLoading();
                    
                    const structName = structureType === 'deck' ? 'Deck' : 'Bulkhead';
                    const posInfo = structureType === 'deck' ? 
                        `Z=${(deckZ * 1000).toFixed(0)}mm` : 
                        `X=${(bulkheadX * 1000).toFixed(0)}mm (${bulkheadOrient})`;
                    const msg = `Imported ${structName}: ${importedData.nodes.length} nodes, ${importedData.beams.length} beams [${posInfo}]`;
                    showToast(msg, 'success');
                    
                } catch (err) {
                    hideLoading();
                    debugError('Steel import error:', err);
                    showToast('Steel import error: ' + err.message, 'error');
                }
            };
            
            reader.onerror = () => {
                hideLoading();
                showToast('Error reading file', 'error');
            };
            
            reader.readAsText(file);
        }
        
        function parseSteelXML(xmlDoc) {
            const result = {
                nodes: [],
                beams: []
            };
            
            // Parse nodes from model
            const modelNode = xmlDoc.querySelector('model');
            if (modelNode) {
                const nodes = modelNode.querySelectorAll('node');
                nodes.forEach(n => {
                    const pAttr = n.getAttribute('p');
                    if (pAttr) {
                        const coords = pAttr.split(';').map(parseFloat);
                        result.nodes.push({
                            id: parseInt(n.getAttribute('id')),
                            x: coords[0] || 0,
                            y: coords[1] || 0
                        });
                    }
                });
                
                // Parse beams (geometry only)
                const beams = modelNode.querySelectorAll('beam');
                beams.forEach(b => {
                    result.beams.push({
                        id: parseInt(b.getAttribute('id')),
                        n1: parseInt(b.getAttribute('n1')),
                        n2: parseInt(b.getAttribute('n2'))
                    });
                });
            }
            
            return result;
        }
        
        // ============== SECTION LIBRARY ==============
        
        function showSectionLibrary() {
            const existingModal = document.getElementById('sectionLibraryModal');
            if (existingModal) existingModal.remove();
            
            const modal = document.createElement('div');
            modal.id = 'sectionLibraryModal';
            modal.innerHTML = `
                <div style="position:fixed; inset:0; background:rgba(0,0,0,0.7); z-index:10000; display:flex; align-items:center; justify-content:center;" onclick="if(event.target===this)this.remove()">
                    <div style="background:var(--bg-elev); border-radius:var(--r-ovl); width:90%; max-width:900px; max-height:85vh; overflow:hidden;">
                        <div style="display:flex; justify-content:space-between; align-items:center; padding:16px; border-bottom:1px solid var(--border);">
                            <h3 style="margin:0; color:var(--text); font-size:var(--fs-md);">Section Library</h3>
                            <button onclick="this.closest('#sectionLibraryModal').remove()" style="background:none; border:none; color:var(--text-2); cursor:pointer; font-size:var(--fs-lg);">&times;</button>
                        </div>
                        
                        <!-- Tab Navigation -->
                        <div style="display:flex; border-bottom:1px solid var(--border); background:var(--bg-main);">
                            <button class="lib-tab active" onclick="showLibraryTab('hp')" data-tab="hp" style="flex:1; padding:12px; background:transparent; border:none; color:var(--accent-info); cursor:pointer; border-bottom:2px solid var(--primary); font-weight:600;">HP Bulb</button>
                            <button class="lib-tab" onclick="showLibraryTab('fb')" data-tab="fb" style="flex:1; padding:12px; background:transparent; border:none; color:var(--text-2); cursor:pointer; border-bottom:2px solid transparent;">Flat Bar</button>
                            <button class="lib-tab" onclick="showLibraryTab('l')" data-tab="l" style="flex:1; padding:12px; background:transparent; border:none; color:var(--text-2); cursor:pointer; border-bottom:2px solid transparent;">L-Angle</button>
                            <button class="lib-tab" onclick="showLibraryTab('t')" data-tab="t" style="flex:1; padding:12px; background:transparent; border:none; color:var(--text-2); cursor:pointer; border-bottom:2px solid transparent;">T-Section</button>
                            <button class="lib-tab" onclick="showLibraryTab('pipe')" data-tab="pipe" style="flex:1; padding:12px; background:transparent; border:none; color:var(--text-2); cursor:pointer; border-bottom:2px solid transparent;">Pipe</button>
                            <button class="lib-tab" onclick="showLibraryTab('custom')" data-tab="custom" style="flex:1; padding:12px; background:transparent; border:none; color:var(--text-2); cursor:pointer; border-bottom:2px solid transparent;">Custom</button>
                        </div>
                        
                        <div style="padding:16px; max-height:calc(85vh - 140px); overflow-y:auto;">
                            <!-- HP Tab -->
                            <div id="libTab_hp" class="lib-tab-content">
                                <div style="margin-bottom:12px; color:var(--text-2); font-size:var(--fs-md);">HP Bulb Flat profiles per EN 10067. Click to add to model.</div>
                                <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(130px, 1fr)); gap:8px;">
                                    ${HP_CATALOG.map(hp => `
                                        <div class="section-card" onclick="addSectionFromCatalog('HP', '${hp.name}')" style="padding:8px; background:var(--bg-main); border-radius:var(--r-ovl); cursor:pointer; text-align:center; border:2px solid ${SECTIONS[hp.name] ? 'var(--success)' : '#334155'}; transition:all 0.2s;">
                                            <div style="font-weight:600; color:var(--accent-info); font-size:var(--fs-md);">${hp.name}</div>
                                            <div style="font-size:var(--fs-xs); color:var(--text-2); margin-top:4px;">A: ${hp.A.toFixed(1)} cm²</div>
                                            ${SECTIONS[hp.name] ? '<div style="font-size:var(--fs-xs); color:var(--success); margin-top:2px;">✓ In model</div>' : ''}
                                        </div>
                                    `).join('')}
                                </div>
                            </div>
                            
                            <!-- FB Tab -->
                            <div id="libTab_fb" class="lib-tab-content" style="display:none;">
                                <div style="margin-bottom:12px; color:var(--text-2); font-size:var(--fs-md);">Flat Bar profiles. Click to add to model.</div>
                                <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(130px, 1fr)); gap:8px;">
                                    ${FB_CATALOG.map(fb => {
                                        const A = (fb.h * fb.t / 100).toFixed(1);
                                        return `
                                        <div class="section-card" onclick="addSectionFromCatalog('FB', '${fb.name}')" style="padding:8px; background:var(--bg-main); border-radius:var(--r-ovl); cursor:pointer; text-align:center; border:2px solid ${SECTIONS[fb.name] ? 'var(--success)' : '#334155'}; transition:all 0.2s;">
                                            <div style="font-weight:600; color:var(--success); font-size:var(--fs-md);">${fb.name}</div>
                                            <div style="font-size:var(--fs-xs); color:var(--text-2); margin-top:4px;">${fb.h}×${fb.t} mm</div>
                                            ${SECTIONS[fb.name] ? '<div style="font-size:var(--fs-xs); color:var(--success); margin-top:2px;">✓ In model</div>' : ''}
                                        </div>
                                    `}).join('')}
                                </div>
                            </div>
                            
                            <!-- Pipe Tab -->
                            <div id="libTab_pipe" class="lib-tab-content" style="display:none;">
                                <div style="margin-bottom:12px; color:var(--text-2); font-size:var(--fs-md);">Circular hollow sections per EN 10220 (D × t). No attached plate. Click to add to model.</div>
                                <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(130px, 1fr)); gap:8px;">
                                    ${PIPE_CATALOG.map(p => {
                                        const pr = profileProperties('PIPE', { d: p.d, t: p.t });
                                        return `
                                        <div class="section-card" onclick="addSectionFromCatalog('PIPE', '${p.name}')" style="padding:8px; background:var(--bg-main); border-radius:var(--r-ovl); cursor:pointer; text-align:center; border:2px solid ${SECTIONS[p.name] ? 'var(--success)' : '#334155'}; transition:all 0.2s;">
                                            <div style="font-weight:600; color:#f472b6; font-size:var(--fs-md);">${p.d} × ${p.t}</div>
                                            <div style="font-size:var(--fs-xs); color:var(--text-2); margin-top:4px;">A: ${pr.A.toFixed(1)} cm²</div>
                                            ${SECTIONS[p.name] ? '<div style="font-size:var(--fs-xs); color:var(--success); margin-top:2px;">✓ In model</div>' : ''}
                                        </div>
                                    `}).join('')}
                                </div>
                            </div>

                            <!-- L Tab -->
                            <div id="libTab_l" class="lib-tab-content" style="display:none;">
                                <div style="margin-bottom:12px; color:var(--text-2); font-size:var(--fs-md);">Equal L-Angle profiles per EN 10056. Click to add to model.</div>
                                <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(130px, 1fr)); gap:8px;">
                                    ${L_CATALOG.map(l => `
                                        <div class="section-card" onclick="addSectionFromCatalog('L', '${l.name}')" style="padding:8px; background:var(--bg-main); border-radius:var(--r-ovl); cursor:pointer; text-align:center; border:2px solid ${SECTIONS[l.name] ? 'var(--success)' : '#334155'}; transition:all 0.2s;">
                                            <div style="font-weight:600; color:var(--warning); font-size:var(--fs-md);">${l.name}</div>
                                            <div style="font-size:var(--fs-xs); color:var(--text-2); margin-top:4px;">A: ${l.A.toFixed(1)} cm²</div>
                                            ${SECTIONS[l.name] ? '<div style="font-size:var(--fs-xs); color:var(--success); margin-top:2px;">✓ In model</div>' : ''}
                                        </div>
                                    `).join('')}
                                </div>
                            </div>
                            
                            <!-- T Tab -->
                            <div id="libTab_t" class="lib-tab-content" style="display:none;">
                                <div style="margin-bottom:12px; color:var(--text-2); font-size:var(--fs-md);">Welded T-Section profiles. Click to add to model.</div>
                                <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(150px, 1fr)); gap:8px;">
                                    ${T_CATALOG.map(t => `
                                        <div class="section-card" onclick="addSectionFromCatalog('T', '${t.name}')" style="padding:8px; background:var(--bg-main); border-radius:var(--r-ovl); cursor:pointer; text-align:center; border:2px solid ${SECTIONS[t.name] ? 'var(--success)' : '#334155'}; transition:all 0.2s;">
                                            <div style="font-weight:600; color:var(--accent-info); font-size:var(--fs-md);">${t.name}</div>
                                            <div style="font-size:var(--fs-xs); color:var(--text-2); margin-top:4px;">A: ${t.A.toFixed(1)} cm²</div>
                                            ${SECTIONS[t.name] ? '<div style="font-size:var(--fs-xs); color:var(--success); margin-top:2px;">✓ In model</div>' : ''}
                                        </div>
                                    `).join('')}
                                </div>
                            </div>
                            
                            <!-- Custom Tab -->
                            <div id="libTab_custom" class="lib-tab-content" style="display:none;">
                                <div style="display:grid; grid-template-columns:1fr 1fr; gap:20px;">
                                    <!-- Custom Section Form -->
                                    <div style="background:var(--bg-main); padding:16px; border-radius:var(--r-ovl);">
                                        <h4 style="color:var(--text); margin:0 0 16px 0;">➕ Add Custom Section</h4>
                                        <div style="display:grid; gap:12px;">
                                            <div>
                                                <label style="color:var(--text-2); font-size:var(--fs-sm);">Section Name *</label>
                                                <input type="text" id="customSectionName" placeholder="e.g. CUSTOM_200x15" style="width:100%; padding:8px; background:var(--bg-elev); border:1px solid var(--border); color:var(--text); border-radius:var(--r-ctl); box-sizing:border-box;">
                                            </div>
                                            <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
                                                <div>
                                                    <label style="color:var(--text-2); font-size:var(--fs-sm);">Area (cm²) *</label>
                                                    <input type="number" id="customSectionA" placeholder="30.0" step="0.1" style="width:100%; padding:8px; background:var(--bg-elev); border:1px solid var(--border); color:var(--text); border-radius:var(--r-ctl); box-sizing:border-box;">
                                                </div>
                                                <div>
                                                    <label style="color:var(--text-2); font-size:var(--fs-sm);">Height (mm) *</label>
                                                    <input type="number" id="customSectionH" placeholder="200" style="width:100%; padding:8px; background:var(--bg-elev); border:1px solid var(--border); color:var(--text); border-radius:var(--r-ctl); box-sizing:border-box;">
                                                </div>
                                            </div>
                                            <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
                                                <div>
                                                    <label style="color:var(--text-2); font-size:var(--fs-sm);">Iy - Strong (cm⁴) *</label>
                                                    <input type="number" id="customSectionIy" placeholder="2500" step="1" style="width:100%; padding:8px; background:var(--bg-elev); border:1px solid var(--border); color:var(--text); border-radius:var(--r-ctl); box-sizing:border-box;">
                                                </div>
                                                <div>
                                                    <label style="color:var(--text-2); font-size:var(--fs-sm);">Iz - Weak (cm⁴)</label>
                                                    <input type="number" id="customSectionIz" placeholder="50" step="1" style="width:100%; padding:8px; background:var(--bg-elev); border:1px solid var(--border); color:var(--text); border-radius:var(--r-ctl); box-sizing:border-box;">
                                                </div>
                                            </div>
                                            <div>
                                                <label style="color:var(--text-2); font-size:var(--fs-sm);">Wy - Section Modulus (cm³)</label>
                                                <input type="number" id="customSectionWy" placeholder="Auto-calculated" step="0.1" style="width:100%; padding:8px; background:var(--bg-elev); border:1px solid var(--border); color:var(--text); border-radius:var(--r-ctl); box-sizing:border-box;">
                                            </div>
                                            <button onclick="addCustomSection()" style="width:100%; padding:12px; background:var(--primary-fill); color:white; border:none; border-radius:var(--r-ctl); cursor:pointer; font-weight:600;">
                                                Add Custom Section
                                            </button>
                                        </div>
                                    </div>
                                    
                                    <!-- Current Sections in Model -->
                                    <div style="background:var(--bg-main); padding:16px; border-radius:var(--r-ovl);">
                                        <h4 style="color:var(--text); margin:0 0 16px 0;">📋 Sections in Model</h4>
                                        <div id="currentSectionsList" style="max-height:300px; overflow-y:auto;">
                                            ${Object.keys(SECTIONS).length === 0 ? 
                                                '<div style="color:var(--text-3); font-size:var(--fs-md); text-align:center; padding:20px;">No sections added yet</div>' :
                                                Object.entries(SECTIONS).map(([name, sec]) => `
                                                    <div style="display:flex; justify-content:space-between; align-items:center; padding:8px; background:var(--bg-elev); border-radius:var(--r-ctl); margin-bottom:4px;">
                                                        <div>
                                                            <div style="color:var(--text); font-size:var(--fs-md);">${name}</div>
                                                            <div style="color:var(--text-3); font-size:var(--fs-xs);">A: ${(sec.A * 1e4).toFixed(1)} cm²</div>
                                                        </div>
                                                        <button onclick="deleteSection('${name}')" style="background:var(--danger); color:white; border:none; padding:4px 8px; border-radius:var(--r-ctl); cursor:pointer; font-size:var(--fs-sm);">Remove</button>
                                                    </div>
                                                `).join('')
                                            }
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            
            document.body.appendChild(modal);
            
            // Add hover effect
            modal.querySelectorAll('.section-card').forEach(card => {
                card.addEventListener('mouseenter', () => {
                    card.style.transform = 'scale(1.02)';
                    card.style.borderColor = 'var(--primary)';
                });
                card.addEventListener('mouseleave', () => {
                    card.style.transform = 'scale(1)';
                    if (!card.querySelector('div[style*="color:var(--success)"]')) {
                        card.style.borderColor = '#334155';
                    } else {
                        card.style.borderColor = 'var(--success)';
                    }
                });
            });
        }
        
        function showLibraryTab(tabName) {
            // Hide all tabs
            document.querySelectorAll('.lib-tab-content').forEach(tab => {
                tab.style.display = 'none';
            });
            
            // Show selected tab
            const targetTab = document.getElementById('libTab_' + tabName);
            if (targetTab) targetTab.style.display = 'block';
            
            // Update tab buttons
            document.querySelectorAll('.lib-tab').forEach(btn => {
                const isActive = btn.dataset.tab === tabName;
                btn.style.color = isActive ? 'var(--primary)' : 'var(--text-2)';
                btn.style.borderBottomColor = isActive ? 'var(--primary)' : 'transparent';
                btn.style.fontWeight = isActive ? 'bold' : 'normal';
            });
        }
        
        function addSectionFromCatalog(type, name) {
            let props = null;

            // Boru: plaka penceresi acilmaz, dogrudan eklenir.
            if (type === 'PIPE') {
                const p = PIPE_CATALOG.find(x => x.name === name);
                if (!p) return;
                if (SECTIONS[name]) { showToast(`Profile ${name} already exists!`, true); return; }
                SECTIONS[name] = Object.assign(profilePropertiesSI(profileProperties('PIPE', { d: p.d, t: p.t })), {
                    profileName: name, plateWidth: 0, plateThick: 0, isComposite: false, type: 'PIPE'
                });
                if (typeof updateProfilesTable === 'function') updateProfilesTable();
                if (typeof updateSectionDropdowns === 'function') updateSectionDropdowns();
                showToast(`Profile ${name} added`);
                showSectionLibrary();
                return;
            }
            
            if (type === 'HP') {
                const hp = HP_CATALOG.find(h => h.name === name);
                if (hp) {
                    const bM = hp.b / 1000;
                    const tM = hp.t / 1000;
                    const dx = hp.dx / 100;
                    props = {
                        A: hp.A * 1e-4,
                        Iy: hp.Ixx * 1e-8,
                        Iz: hp.A * 1e-4 * 0.001,
                        J: hp.A * 1e-4 * 0.0001,
                        Wy: (hp.Ixx * 1e-8) / dx,
                        Wz: (hp.A * 1e-4 * 0.001) / (tM / 2),
                        h: bM,
                        centroidY: bM - dx
                    };
                }
            } else if (type === 'FB') {
                const fb = FB_CATALOG.find(f => f.name === name);
                if (fb) {
                    const h = fb.h / 1000;
                    const t = fb.t / 1000;
                    props = {
                        A: h * t,
                        Iy: t * Math.pow(h, 3) / 12,
                        Iz: h * Math.pow(t, 3) / 12,
                        J: h * Math.pow(t, 3) / 3,
                        Wy: t * Math.pow(h, 2) / 6,
                        Wz: h * Math.pow(t, 2) / 6,
                        h: h,
                        centroidY: h / 2
                    };
                }
            } else if (type === 'L') {
                const l = L_CATALOG.find(x => x.name === name);
                if (l) {
                    const a = l.a / 1000;
                    const t = l.t / 1000;
                    props = {
                        A: l.A * 1e-4,
                        Iy: l.Ixx * 1e-8,
                        Iz: l.Ixx * 1e-8,
                        J: l.A * 1e-4 * Math.pow(t, 2) / 3,
                        Wy: l.Ixx * 1e-8 / (a * 0.7),
                        Wz: l.Ixx * 1e-8 / (a * 0.7),
                        h: a,
                        centroidY: a * 0.3
                    };
                }
            } else if (type === 'T') {
                const t = T_CATALOG.find(x => x.name === name);
                if (t) {
                    const h = t.h / 1000;
                    const bf = t.bf / 1000;
                    const tw = t.tw / 1000;
                    const tf = t.tf / 1000;
                    // T-section centroid calculation
                    const Aw = (h - tf) * tw;
                    const Af = bf * tf;
                    const yBar = (Aw * (h - tf) / 2 + Af * (h - tf / 2)) / (Aw + Af);
                    props = {
                        A: t.A * 1e-4,
                        Iy: t.Ixx * 1e-8,
                        Iz: (tf * Math.pow(bf, 3) + (h - tf) * Math.pow(tw, 3)) / 12,
                        J: (bf * Math.pow(tf, 3) + (h - tf) * Math.pow(tw, 3)) / 3,
                        Wy: t.Ixx * 1e-8 / yBar,
                        Wz: ((tf * Math.pow(bf, 3) + (h - tf) * Math.pow(tw, 3)) / 12) / (bf / 2),
                        h: h,
                        centroidY: yBar
                    };
                }
            }
            
            if (props) {
                // Close section library modal
                const libModal = document.getElementById('sectionLibraryModal');
                if (libModal) libModal.remove();
                
                // Open effective breadth dialog
                showEffectiveBreadthDialog(type, name, props);
            }
        }
        
        // ============== EFFECTIVE BREADTH DIALOG ==============
        
        function showEffectiveBreadthDialog(profileType, profileName, baseProps) {
            const existingModal = document.getElementById('effBreadthModal');
            if (existingModal) existingModal.remove();
            
            const modal = document.createElement('div');
            modal.id = 'effBreadthModal';
            modal.innerHTML = `
                <div style="position:fixed; inset:0; background:rgba(0,0,0,0.7); z-index:10001; display:flex; align-items:center; justify-content:center;" onclick="if(event.target===this)this.remove()">
                    <div style="background:var(--bg-elev); border-radius:var(--r-ovl); width:450px; max-height:85vh; overflow:hidden;">
                        <div style="display:flex; justify-content:space-between; align-items:center; padding:16px; border-bottom:1px solid var(--border); background:var(--bg-main);">
                            <h3 style="margin:0; color:var(--text); font-size:var(--fs-md);">
                                <span style="color:var(--accent-info);">${profileName}</span> + Attached Plate
                            </h3>
                            <button onclick="this.closest('#effBreadthModal').remove()" style="background:none; border:none; color:var(--text-2); cursor:pointer; font-size:var(--fs-lg);">&times;</button>
                        </div>
                        
                        <div style="padding:20px;">
                            <!-- Profile Info -->
                            <div style="background:var(--bg-main); padding:12px; border-radius:var(--r-ovl); margin-bottom:16px;">
                                <div style="color:var(--text-2); font-size:var(--fs-sm); margin-bottom:4px;">Base Profile Properties</div>
                                <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; font-size:var(--fs-sm);">
                                    <div><span style="color:var(--text-3);">A:</span> <span style="color:var(--text);">${(baseProps.A * 1e4).toFixed(1)} cm²</span></div>
                                    <div><span style="color:var(--text-3);">h:</span> <span style="color:var(--text);">${(baseProps.h * 1000).toFixed(0)} mm</span></div>
                                    <div><span style="color:var(--text-3);">Iy:</span> <span style="color:var(--text);">${(baseProps.Iy * 1e8).toFixed(0)} cm⁴</span></div>
                                    <div><span style="color:var(--text-3);">Wy:</span> <span style="color:var(--text);">${(baseProps.Wy * 1e6).toFixed(1)} cm³</span></div>
                                </div>
                            </div>
                            
                            <!-- Effective Breadth Method -->
                            <div style="margin-bottom:16px;">
                                <div style="color:var(--text-2); font-size:var(--fs-sm); margin-bottom:8px; font-weight:600;">Effective Breadth Method</div>
                                <div style="display:flex; gap:8px;">
                                    <label style="flex:1; display:flex; align-items:center; gap:8px; padding:8px; background:var(--bg-main); border-radius:var(--r-ctl); cursor:pointer; border:2px solid var(--border);" id="labelRuleBased">
                                        <input type="radio" name="beffMethod" value="rule" checked onchange="toggleBeffMethod()">
                                        <div>
                                            <div style="color:var(--accent-info); font-size:var(--fs-sm); font-weight:600;">BV NR467 Rule</div>
                                            <div style="color:var(--text-3); font-size:var(--fs-xs);">Auto-calculate from span & spacing</div>
                                        </div>
                                    </label>
                                    <label style="flex:1; display:flex; align-items:center; gap:8px; padding:8px; background:var(--bg-main); border-radius:var(--r-ctl); cursor:pointer; border:2px solid var(--border);" id="labelCustom">
                                        <input type="radio" name="beffMethod" value="custom" onchange="toggleBeffMethod()">
                                        <div>
                                            <div style="color:var(--warning); font-size:var(--fs-sm); font-weight:600;">Custom</div>
                                            <div style="color:var(--text-3); font-size:var(--fs-xs);">Enter values manually</div>
                                        </div>
                                    </label>
                                </div>
                            </div>
                            
                            <!-- Rule-based Inputs -->
                            <div id="beffRuleInputs">
                                <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:12px;">
                                    <div>
                                        <label style="color:var(--text-2); font-size:var(--fs-sm);">ℓ - Span (m)</label>
                                        <input type="number" id="beffSpan" value="2.5" step="0.1" style="width:100%; padding:8px; background:var(--bg-main); border:1px solid var(--border); color:var(--text); border-radius:var(--r-ctl); box-sizing:border-box;" oninput="updateBeffCalculation()">
                                    </div>
                                    <div>
                                        <label style="color:var(--text-2); font-size:var(--fs-sm);">s - Spacing (mm)</label>
                                        <input type="number" id="beffSpacing" value="600" step="50" style="width:100%; padding:8px; background:var(--bg-main); border:1px solid var(--border); color:var(--text); border-radius:var(--r-ctl); box-sizing:border-box;" oninput="updateBeffCalculation()">
                                    </div>
                                </div>
                                <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:12px;">
                                    <div>
                                        <label style="color:var(--text-2); font-size:var(--fs-sm);">tp - Plate Thickness (mm)</label>
                                        <input type="number" id="beffPlateThick" value="12" step="1" style="width:100%; padding:8px; background:var(--bg-main); border:1px solid var(--border); color:var(--text); border-radius:var(--r-ctl); box-sizing:border-box;" oninput="updateBeffCalculation()">
                                    </div>
                                    <div style="display:flex; align-items:end; padding-bottom:8px;">
                                        <label style="display:flex; align-items:center; gap:8px; color:var(--text-2); font-size:var(--fs-sm); cursor:pointer;">
                                            <input type="checkbox" id="beffOneSide" onchange="updateBeffCalculation()">
                                            One side only
                                        </label>
                                    </div>
                                </div>
                                
                                <!-- Calculated beff -->
                                <div style="background:linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%); padding:12px; border-radius:var(--r-ovl); margin-bottom:12px;">
                                    <div style="display:flex; justify-content:space-between; align-items:center;">
                                        <span style="color:var(--text-2); font-size:var(--fs-sm);">Calculated b<sub>eff</sub></span>
                                        <span style="color:var(--success); font-size:var(--fs-lg); font-weight:600;" id="beffCalculated">500 mm</span>
                                    </div>
                                    <div style="color:var(--text-3); font-size:var(--fs-xs); margin-top:4px;" id="beffFormula">beff = min(s, ℓ/6) = min(600, 2500/6) = 416.7 mm</div>
                                </div>
                            </div>
                            
                            <!-- Custom Inputs -->
                            <div id="beffCustomInputs" style="display:none;">
                                <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:12px;">
                                    <div>
                                        <label style="color:var(--text-2); font-size:var(--fs-sm);">b<sub>eff</sub> - Width (mm)</label>
                                        <input type="number" id="beffCustomWidth" value="500" step="10" style="width:100%; padding:8px; background:var(--bg-main); border:1px solid var(--border); color:var(--text); border-radius:var(--r-ctl); box-sizing:border-box;" oninput="updateBeffCalculation()">
                                    </div>
                                    <div>
                                        <label style="color:var(--text-2); font-size:var(--fs-sm);">tp - Plate Thickness (mm)</label>
                                        <input type="number" id="beffCustomThick" value="12" step="1" style="width:100%; padding:8px; background:var(--bg-main); border:1px solid var(--border); color:var(--text); border-radius:var(--r-ctl); box-sizing:border-box;" oninput="updateBeffCalculation()">
                                    </div>
                                </div>
                            </div>
                            
                            <!-- Composite Section Results -->
                            <div style="background:var(--bg-main); padding:12px; border-radius:var(--r-ovl); margin-bottom:16px; border:1px solid var(--border);">
                                <div style="color:var(--accent-info); font-size:var(--fs-sm); margin-bottom:8px; font-weight:600;">📐 Composite Section Properties</div>
                                <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; font-size:var(--fs-md);">
                                    <div><span style="color:var(--text-3);">A<sub>comp</sub>:</span> <span style="color:var(--success); font-weight:600;" id="compA">--</span></div>
                                    <div><span style="color:var(--text-3);">h<sub>total</sub>:</span> <span style="color:var(--text);" id="compH">--</span></div>
                                    <div><span style="color:var(--text-3);">I<sub>y,comp</sub>:</span> <span style="color:var(--success); font-weight:600;" id="compIy">--</span></div>
                                    <div><span style="color:var(--text-3);">ȳ (from plate):</span> <span style="color:var(--text);" id="compYbar">--</span></div>
                                    <div><span style="color:var(--text-3);">W<sub>y,deck</sub>:</span> <span style="color:var(--warning); font-weight:600;" id="compWyDeck">--</span></div>
                                    <div><span style="color:var(--text-3);">W<sub>y,flange</sub>:</span> <span style="color:var(--warning); font-weight:600;" id="compWyFlange">--</span></div>
                                </div>
                            </div>
                            
                            <!-- Buttons -->
                            <div style="display:flex; gap:12px;">
                                <button onclick="document.getElementById('effBreadthModal').remove(); showSectionLibrary();" style="flex:1; padding:12px; background:var(--bg-hover); color:var(--text); border:none; border-radius:var(--r-ctl); cursor:pointer;">
                                    ← Back to Library
                                </button>
                                <button onclick="addSectionWithPlate('${profileType}', '${profileName}')" style="flex:1; padding:12px; background:var(--success-fill); color:white; border:none; border-radius:var(--r-ctl); cursor:pointer; font-weight:600;">
                                    ✓ Add to Model
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            
            document.body.appendChild(modal);
            
            // Store base props for later
            window._pendingBaseProps = baseProps;
            
            // Initial calculation
            updateBeffCalculation();
        }
        
        function toggleBeffMethod() {
            const isRule = document.querySelector('input[name="beffMethod"]:checked')?.value === 'rule';
            document.getElementById('beffRuleInputs').style.display = isRule ? 'block' : 'none';
            document.getElementById('beffCustomInputs').style.display = isRule ? 'none' : 'block';
            
            // Update label borders
            document.getElementById('labelRuleBased').style.borderColor = isRule ? 'var(--primary)' : '#334155';
            document.getElementById('labelCustom').style.borderColor = isRule ? '#334155' : 'var(--warning)';
            
            updateBeffCalculation();
        }
        
        function updateBeffCalculation() {
            const baseProps = window._pendingBaseProps;
            if (!baseProps) return;
            
            const isRule = document.querySelector('input[name="beffMethod"]:checked')?.value === 'rule';
            
            let beff, tp;
            
            if (isRule) {
                const span = parseFloat(document.getElementById('beffSpan')?.value) || 2.5;
                const spacing = parseFloat(document.getElementById('beffSpacing')?.value) || 600;
                tp = parseFloat(document.getElementById('beffPlateThick')?.value) || 12;
                const oneSide = document.getElementById('beffOneSide')?.checked || false;
                
                // BV NR467 rule for stiffeners: beff = min(s, ℓ/6)
                const spanMm = span * 1000;
                const beffCalc = Math.min(spacing, spanMm / 6);
                beff = oneSide ? beffCalc / 2 : beffCalc;
                
                document.getElementById('beffCalculated').textContent = beff.toFixed(0) + ' mm';
                document.getElementById('beffFormula').textContent = 
                    `beff = min(s, ℓ/6) = min(${spacing}, ${spanMm.toFixed(0)}/6) = ${beffCalc.toFixed(1)} mm` +
                    (oneSide ? ' ÷ 2 (one side)' : '');
            } else {
                beff = parseFloat(document.getElementById('beffCustomWidth')?.value) || 500;
                tp = parseFloat(document.getElementById('beffCustomThick')?.value) || 12;
            }
            
            // Calculate composite section properties
            const composite = compositeFromPlateBottom(baseProps, beff / 1000, tp / 1000);
            
            // Update display
            document.getElementById('compA').textContent = (composite.A * 1e4).toFixed(1) + ' cm²';
            document.getElementById('compH').textContent = (composite.h * 1000).toFixed(0) + ' mm';
            document.getElementById('compIy').textContent = (composite.Iy * 1e8).toFixed(0) + ' cm⁴';
            document.getElementById('compYbar').textContent = (composite.yBar * 1000).toFixed(1) + ' mm';
            document.getElementById('compWyDeck').textContent = (composite.WyDeck * 1e6).toFixed(1) + ' cm³';
            document.getElementById('compWyFlange').textContent = (composite.WyFlange * 1e6).toFixed(1) + ' cm³';
            
            // Store for later
            window._pendingBeff = beff;
            window._pendingTp = tp;
            window._pendingComposite = composite;
        }
        
        // Plaka ALTI referansli kompozit kesit (yBar / WyDeck / WyFlange dondurur).
        // Import onizlemesi bu anahtarlari okur.
        function compositeFromPlateBottom(profile, beff, tp) {
            // Profile properties
            const Ap = profile.A;           // Profile area (m²)
            const hp = profile.h;           // Profile height (m)
            const Ip = profile.Iy;          // Profile Iy (m⁴)
            const yp = profile.centroidY || hp / 2;  // Profile centroid from bottom (m)
            
            // Plate properties
            const Apl = beff * tp;          // Plate area (m²)
            const Ipl = beff * Math.pow(tp, 3) / 12;  // Plate Iy (m⁴)
            const ypl = -tp / 2;            // Plate centroid (below profile, negative)
            
            // Combined area
            const Atotal = Ap + Apl;
            
            // Combined centroid from plate bottom (positive upward)
            // Reference: bottom of plate = 0
            const ypFromPlateBottom = yp + tp;  // Profile centroid from plate bottom
            const yplFromPlateBottom = tp / 2;   // Plate centroid from plate bottom
            
            const yBar = (Ap * ypFromPlateBottom + Apl * yplFromPlateBottom) / Atotal;
            
            // Parallel axis theorem
            const dp = ypFromPlateBottom - yBar;  // Distance from profile centroid to composite centroid
            const dpl = yplFromPlateBottom - yBar; // Distance from plate centroid to composite centroid
            
            const Icomp = Ip + Ap * dp * dp + Ipl + Apl * dpl * dpl;
            
            // Total height
            const hTotal = hp + tp;
            
            // Section moduli
            const yDeck = yBar;                    // Distance to deck (plate bottom)
            const yFlange = hTotal - yBar;         // Distance to flange top
            
            const WyDeck = Icomp / yDeck;
            const WyFlange = Icomp / yFlange;
            
            return {
                A: Atotal,
                Iy: Icomp,
                Iz: profile.Iz + beff * Math.pow(tp, 3) / 12,
                J: profile.J + beff * Math.pow(tp, 3) / 3,
                Wy: Math.min(WyDeck, WyFlange),  // Governing section modulus
                WyDeck: WyDeck,
                WyFlange: WyFlange,
                Wz: profile.Wz,
                h: hTotal,
                yBar: yBar,
                centroidY: yBar,
                isComposite: true,
                plateWidth: beff,
                plateThick: tp
            };
        }
        
        function addSectionWithPlate(profileType, profileName) {
            const composite = window._pendingComposite;
            const beff = window._pendingBeff;
            const tp = window._pendingTp;
            
            if (!composite) {
                showToast('Error calculating section properties', 'error');
                return;
            }
            
            // Create section name with plate info
            const plateName = `${(beff).toFixed(0)}x${(tp).toFixed(0)}`;
            const fullName = `${profileName}_${plateName}`;
            
            // Store in SECTIONS
            SECTIONS[fullName] = composite;
            
            // Close dialog
            document.getElementById('effBreadthModal').remove();
            
            showToast(`Added "${fullName}" (Wy=${(composite.Wy * 1e6).toFixed(0)} cm³)`, 'success');
            
            // Update profile list if visible
            updateProfileTableFromSections();
            // Kiris ekleme seciciler de tazelenmeli: profil olusuyor ama
            // "Add Beam" bolumu "No profiles - create in General tab"
            // demeye devam ediyordu.
            if (typeof updateSectionDropdowns === "function") updateSectionDropdowns();
        }
        
        function updateProfileTableFromSections() {
            // Update the profiles table in General tab
            if (typeof updateProfilesTable === 'function') {
                updateProfilesTable();
            }
            // Update section dropdowns
            if (typeof updateSectionDropdowns === 'function') {
                updateSectionDropdowns();
            }
        }
        
        function addCustomSection() {
            const name = document.getElementById('customSectionName')?.value?.trim();
            const A = parseFloat(document.getElementById('customSectionA')?.value);
            const h = parseFloat(document.getElementById('customSectionH')?.value);
            const Iy = parseFloat(document.getElementById('customSectionIy')?.value);
            const Iz = parseFloat(document.getElementById('customSectionIz')?.value) || Iy * 0.02;
            const Wy = parseFloat(document.getElementById('customSectionWy')?.value) || (Iy / (h / 20));
            
            if (!name) {
                showToast('Please enter a section name', 'error');
                return;
            }
            if (isNaN(A) || A <= 0) {
                showToast('Please enter a valid area', 'error');
                return;
            }
            if (isNaN(h) || h <= 0) {
                showToast('Please enter a valid height', 'error');
                return;
            }
            if (isNaN(Iy) || Iy <= 0) {
                showToast('Please enter a valid Iy', 'error');
                return;
            }
            
            const hM = h / 1000;
            
            SECTIONS[name] = {
                A: A * 1e-4,           // cm² to m²
                Iy: Iy * 1e-8,         // cm⁴ to m⁴
                Iz: Iz * 1e-8,
                J: A * 1e-4 * 0.0001,  // Approximate
                Wy: Wy * 1e-6,         // cm³ to m³
                Wz: (Iz * 1e-8) / (hM * 0.1),
                h: hM,
                centroidY: hM / 2,
                isCustom: true
            };
            
            showToast(`Custom section "${name}" added`, 'success');
            // Kiris ekleme seciciler de tazelenmeli: profil olusuyor ama
            // "Add Beam" bolumu "No profiles - create in General tab"
            // demeye devam ediyordu.
            if (typeof updateSectionDropdowns === "function") updateSectionDropdowns();
            
            // Clear form
            document.getElementById('customSectionName').value = '';
            document.getElementById('customSectionA').value = '';
            document.getElementById('customSectionH').value = '';
            document.getElementById('customSectionIy').value = '';
            document.getElementById('customSectionIz').value = '';
            document.getElementById('customSectionWy').value = '';
            
            // Refresh modal
            showSectionLibrary();
        }
        
        function deleteSection(name) {
            // Check if section is in use
            const inUse = Object.values(model.elements).some(e => e.section === name);
            if (inUse) {
                showToast(`Cannot delete "${name}" - it's being used by beams in the model`, 'error');
                return;
            }
            
            delete SECTIONS[name];
            showToast(`Section "${name}" removed from library`);
            
            // Refresh modal
            showSectionLibrary();
        }
        
        function showHelp() {
            // Create help modal
            const existingModal = document.getElementById('helpModal');
            if (existingModal) existingModal.remove();
            
            const modal = document.createElement('div');
            modal.id = 'helpModal';
            modal.innerHTML = `
                <div style="position:fixed; inset:0; background:rgba(0,0,0,0.7); z-index:10000; display:flex; align-items:center; justify-content:center;" onclick="if(event.target===this)this.remove()">
                    <div style="background:var(--bg-elev); border-radius:var(--r-ovl); width:90%; max-width:800px; max-height:85vh; overflow:hidden; box-shadow:0 25px 50px rgba(0,0,0,0.5);">
                        <div style="display:flex; justify-content:space-between; align-items:center; padding:16px 20px; border-bottom:1px solid var(--border); background:var(--bg-main);">
                            <h2 style="margin:0; color:var(--text); font-size:var(--fs-lg); display:flex; align-items:center; gap:8px;">
                                <span class="icon"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></span>
                                Keyboard Shortcuts & Help
                            </h2>
                            <button onclick="this.closest('#helpModal').remove()" style="background:none; border:none; color:var(--text-2); cursor:pointer; font-size:var(--fs-lg); padding:4px 8px;">&times;</button>
                        </div>
                        <div style="padding:20px; overflow-y:auto; max-height:calc(85vh - 60px);">
                            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:20px;">
                                
                                <!-- Selection -->
                                <div style="background:var(--bg-main); padding:16px; border-radius:var(--r-ovl);">
                                    <h3 style="color:var(--accent-info); margin:0 0 12px 0; font-size:var(--fs-md); border-bottom:1px solid var(--border); padding-bottom:8px;">📌 Selection</h3>
                                    <div style="display:flex; flex-direction:column; gap:8px;">
                                        <div style="display:flex; justify-content:space-between;"><kbd>Ctrl+A</kbd><span style="color:var(--text-2);">Select all</span></div>
                                        <div style="display:flex; justify-content:space-between;"><kbd>Delete</kbd><span style="color:var(--text-2);">Delete selected</span></div>
                                        <div style="display:flex; justify-content:space-between;"><kbd>Escape</kbd><span style="color:var(--text-2);">Clear selection</span></div>
                                        <div style="display:flex; justify-content:space-between;"><kbd>Ctrl+Click</kbd><span style="color:var(--text-2);">Add to selection</span></div>
                                        <div style="display:flex; justify-content:space-between;"><kbd>Shift+Drag</kbd><span style="color:var(--text-2);">Box select</span></div>
                                    </div>
                                </div>
                                
                                <!-- View -->
                                <div style="background:var(--bg-main); padding:16px; border-radius:var(--r-ovl);">
                                    <h3 style="color:var(--success); margin:0 0 12px 0; font-size:var(--fs-md); border-bottom:1px solid var(--border); padding-bottom:8px;">👁️ View Controls</h3>
                                    <div style="display:flex; flex-direction:column; gap:8px;">
                                        <div style="display:flex; justify-content:space-between;"><kbd>1</kbd><span style="color:var(--text-2);">Plan view (top)</span></div>
                                        <div style="display:flex; justify-content:space-between;"><kbd>2</kbd><span style="color:var(--text-2);">Front view</span></div>
                                        <div style="display:flex; justify-content:space-between;"><kbd>3</kbd><span style="color:var(--text-2);">3D perspective</span></div>
                                        <div style="display:flex; justify-content:space-between;"><kbd>F</kbd><span style="color:var(--text-2);">Fit to view</span></div>
                                        <div style="display:flex; justify-content:space-between;"><kbd>+/-</kbd><span style="color:var(--text-2);">Zoom in/out</span></div>
                                        <div style="display:flex; justify-content:space-between;"><kbd>Scroll</kbd><span style="color:var(--text-2);">Zoom</span></div>
                                    </div>
                                </div>
                                
                                <!-- Display Toggles -->
                                <div style="background:var(--bg-main); padding:16px; border-radius:var(--r-ovl);">
                                    <h3 style="color:var(--accent-info); margin:0 0 12px 0; font-size:var(--fs-md); border-bottom:1px solid var(--border); padding-bottom:8px;">🎨 Display Toggles</h3>
                                    <div style="display:flex; flex-direction:column; gap:8px;">
                                        <div style="display:flex; justify-content:space-between;"><kbd>B</kbd><span style="color:var(--text-2);">Beams</span></div>
                                        <div style="display:flex; justify-content:space-between;"><kbd>N</kbd><span style="color:var(--text-2);">Nodes</span></div>
                                        <div style="display:flex; justify-content:space-between;"><kbd>L</kbd><span style="color:var(--text-2);">Loads</span></div>
                                        <div style="display:flex; justify-content:space-between;"><kbd>G</kbd><span style="color:var(--text-2);">Grid</span></div>
                                        <div style="display:flex; justify-content:space-between;"><kbd>T</kbd><span style="color:var(--text-2);">Section labels</span></div>
                                        <div style="display:flex; justify-content:space-between;"><kbd>I</kbd><span style="color:var(--text-2);">Node IDs</span></div>
                                    </div>
                                </div>
                                
                                <!-- Results -->
                                <div style="background:var(--bg-main); padding:16px; border-radius:var(--r-ovl);">
                                    <h3 style="color:var(--warning); margin:0 0 12px 0; font-size:var(--fs-md); border-bottom:1px solid var(--border); padding-bottom:8px;">📊 Results Display</h3>
                                    <div style="display:flex; flex-direction:column; gap:8px;">
                                        <div style="display:flex; justify-content:space-between;"><kbd>D</kbd><span style="color:var(--text-2);">Deformed shape</span></div>
                                        <div style="display:flex; justify-content:space-between;"><kbd>S</kbd><span style="color:var(--text-2);">Stress colors</span></div>
                                        <div style="display:flex; justify-content:space-between;"><kbd>M</kbd><span style="color:var(--text-2);">Moment diagram</span></div>
                                        <div style="display:flex; justify-content:space-between;"><kbd>V</kbd><span style="color:var(--text-2);">Shear diagram</span></div>
                                        <div style="display:flex; justify-content:space-between;"><kbd>Space</kbd><span style="color:var(--text-2);">Solve model</span></div>
                                    </div>
                                </div>
                                
                                <!-- Edit -->
                                <div style="background:var(--bg-main); padding:16px; border-radius:var(--r-ovl);">
                                    <h3 style="color:#ec4899; margin:0 0 12px 0; font-size:var(--fs-md); border-bottom:1px solid var(--border); padding-bottom:8px;">✏️ Edit</h3>
                                    <div style="display:flex; flex-direction:column; gap:8px;">
                                        <div style="display:flex; justify-content:space-between;"><kbd>Ctrl+Z</kbd><span style="color:var(--text-2);">Undo</span></div>
                                        <div style="display:flex; justify-content:space-between;"><kbd>Ctrl+Y</kbd><span style="color:var(--text-2);">Redo</span></div>
                                        <div style="display:flex; justify-content:space-between;"><kbd>Ctrl+D</kbd><span style="color:var(--text-2);">Duplicate</span></div>
                                        <div style="display:flex; justify-content:space-between;"><kbd>Ctrl+S</kbd><span style="color:var(--text-2);">Save/Export</span></div>
                                        <div style="display:flex; justify-content:space-between;"><kbd>P</kbd><span style="color:var(--text-2);">Toggle snap</span></div>
                                    </div>
                                </div>
                                
                                <!-- Commands -->
                                <div style="background:var(--bg-main); padding:16px; border-radius:var(--r-ovl);">
                                    <h3 style="color:var(--accent-info); margin:0 0 12px 0; font-size:var(--fs-md); border-bottom:1px solid var(--border); padding-bottom:8px;">⌨️ CAD Commands</h3>
                                    <div style="display:flex; flex-direction:column; gap:8px; font-size:var(--fs-md);">
                                        <div style="display:flex; justify-content:space-between;"><kbd>LINE</kbd><span style="color:var(--text-2);">Draw beam</span></div>
                                        <div style="display:flex; justify-content:space-between;"><kbd>COPY</kbd><span style="color:var(--text-2);">Copy selected</span></div>
                                        <div style="display:flex; justify-content:space-between;"><kbd>MOVE</kbd><span style="color:var(--text-2);">Move selected</span></div>
                                        <div style="display:flex; justify-content:space-between;"><kbd>MIRROR</kbd><span style="color:var(--text-2);">Mirror selected</span></div>
                                        <div style="display:flex; justify-content:space-between;"><kbd>ROTATE</kbd><span style="color:var(--text-2);">Rotate selected</span></div>
                                        <div style="display:flex; justify-content:space-between;"><kbd>SPLIT</kbd><span style="color:var(--text-2);">Split beam</span></div>
                                    </div>
                                </div>
                                
                            </div>
                            
                            <!-- Mouse Controls -->
                            <div style="margin-top:20px; background:var(--bg-main); padding:16px; border-radius:var(--r-ovl);">
                                <h3 style="color:var(--text-3); margin:0 0 12px 0; font-size:var(--fs-md);">🖱️ Mouse Controls</h3>
                                <div style="display:flex; flex-wrap:wrap; gap:16px; font-size:var(--fs-md);">
                                    <span><strong>Click:</strong> Select</span>
                                    <span><strong>Right-click:</strong> Context menu</span>
                                    <span><strong>Double-click:</strong> Edit properties</span>
                                    <span><strong>Drag:</strong> Pan view</span>
                                    <span><strong>Middle-drag:</strong> Pan (3D)</span>
                                    <span><strong>Right-drag:</strong> Rotate (3D)</span>
                                </div>
                            </div>
                            
                            <!-- Stress Colors Legend -->
                            <div style="margin-top:20px; background:var(--bg-main); padding:16px; border-radius:var(--r-ovl);">
                                <h3 style="color:var(--text-3); margin:0 0 12px 0; font-size:var(--fs-md);">🌈 Stress Color Scale</h3>
                                <div style="display:flex; align-items:center; gap:8px;">
                                    <div style="flex:1; height:20px; background:linear-gradient(to right, var(--primary), var(--success), var(--warning), var(--warning), var(--danger)); border-radius:var(--r-ctl);"></div>
                                </div>
                                <div style="display:flex; justify-content:space-between; margin-top:4px; font-size:var(--fs-sm); color:var(--text-2);">
                                    <span>0% (Safe)</span>
                                    <span>50%</span>
                                    <span>100%+ (Over limit)</span>
                                </div>
                            </div>
                            
                        </div>
                    </div>
                </div>
            `;
            
            // Add kbd styling
            const style = document.createElement('style');
            style.textContent = `
                #helpModal kbd {
                    background:var(--bg-hover);
                    color:var(--text);
                    padding: 2px 8px;
                    border-radius:var(--r-ctl);
                    font-family: monospace;
                    font-size:var(--fs-sm);
                    border: 1px solid var(--text-3);
                }
            `;
            modal.appendChild(style);
            
            document.body.appendChild(modal);
        }
        
        function toggleNodeList() {
            const container = $('nodeListContainer');
            if (!container) return;
            if (container.style.display === 'none') {
                container.style.display = 'block';
                updateNodeList();
            } else {
                container.style.display = 'none';
            }
        }
        
        function toggleBeamList() {
            const container = $('beamListContainer');
            if (!container) return;
            if (container.style.display === 'none') {
                container.style.display = 'block';
                updateBeamList();
            } else {
                container.style.display = 'none';
            }
        }
        
        function updateNodeList() {
            const tbody = $('nodeListTable');
            if (!tbody) return;
            tbody.innerHTML = '';
            
            Object.values(model.nodes).forEach(node => {
                const bc = model.constraints[node.id] || '-';
                const bcDisplay = bc === 'simply_supported' ? 'SS' : bc === 'fixed' ? 'FIX' : bc === 'pinned' ? 'PIN' : '-';
                const isSelected = selectedNodes.has(node.id);
                
                tbody.innerHTML += `<tr style="${isSelected ? 'background:rgba(34,197,94,0.2);' : ''}" 
                    onclick="selectNodeFromList(${node.id})" style="cursor:pointer;">
                    <td>${node.id}</td>
                    <td>${(node.x * 1000).toFixed(0)}</td>
                    <td>${(node.y * 1000).toFixed(0)}</td>
                    <td>${bcDisplay}</td>
                </tr>`;
            });
        }
        
        function updateBeamList() {
            const tbody = $('beamListTable');
            if (!tbody) return;
            tbody.innerHTML = '';
            
            Object.entries(model.elements).forEach(([id, elem]) => {
                const elemId = parseInt(id);
                const sec = SECTIONS[elem.section];
                const displaySection = sec && sec.profileName ? sec.profileName : elem.section.split('_')[0];
                const isSelected = selectedElements.has(elemId);
                
                tbody.innerHTML += `<tr style="${isSelected ? 'background:rgba(245,158,11,0.2);' : ''}"
                    onclick="selectElementFromList(${elemId})" style="cursor:pointer;">
                    <td>${elemId}</td>
                    <td>${elem.n1}→${elem.n2}</td>
                    <td>${displaySection}</td>
                    <td>${elem.grade || 'AH36'}</td>
                </tr>`;
            });
        }
        
        function selectNodeFromList(nodeId) {
            const node = model.nodes[nodeId];
            if (node) {
                selectedNodes.clear();
                selectedElements.clear();
                selectedNodes.add(nodeId);
                selectedNode = node;
                selectedElement = null;
                showNodeDetails(node);
                updateEntityInfoPanel();
                draw();
                updateNodeList();
            }
        }
        
        function selectElementFromList(elemId) {
            const elem = model.elements[elemId];
            if (elem) {
                selectedNodes.clear();
                selectedElements.clear();
                selectedElements.add(elemId);
                selectedElement = elem;
                selectedNode = null;
                showElementDetails(elem);
                updateEntityInfoPanel();
                draw();
                updateBeamList();
            }
        }
        
        function updateModelLists() {
            const nodeListContainer = $('nodeListContainer');
            const beamListContainer = $('beamListContainer');
            
            if (nodeListContainer && nodeListContainer.style.display !== 'none') {
                updateNodeList();
            }
            if (beamListContainer && beamListContainer.style.display !== 'none') {
                updateBeamList();
            }
            
            // Update BC/Loads tables
            updateBCLoadsTable();
        }
        
        // Alias functions
        function updateBCTable() { updateBCLoadsTable(); }
        function updateLoadTable() { updateBCLoadsTable(); }
        function updateLineLoadTable() { updateBCLoadsTable(); }
        function updateLoadsList() { updateBCLoadsTable(); }
        
        // Yuk tablolarinda satir ici durum secici (Loads sekmesi)
        function yukDurumuSecici(tur, a, b, durum) {
            const d = durum || 'L';
            const ops = yukDurumlari().map(x => '<option value="' + x.id + '"' + (x.id === d ? ' selected' : '') + '>' + x.id + '</option>').join('');
            return '<select class="yuk-durum-mini" title="Load case" onchange="yukDurumuAta(\'' + tur + '\', ' + a + ', ' + (b === null ? 'null' : b) + ', this.value)" style="padding:1px 2px; font-size:var(--fs-xs); background:var(--bg-main); color:var(--text); border:1px solid var(--border); border-radius:var(--r-ctl);">' + ops + '</select>';
        }

        function updateBCLoadsTable() {
            // Update Boundary Conditions table
            const bcTable = document.getElementById('bcTable');
            if (bcTable) {
                const constraints = Object.entries(model.constraints);
                if (constraints.length === 0) {
                    bcTable.innerHTML = '<tr><td colspan="8" style="color:var(--text-3); text-align:center;">No constraints defined</td></tr>';
                } else {
                    bcTable.innerHTML = constraints.map(([nodeId, bc]) => {
                        // Green check with background for fixed DOFs
                        const check = (val) => val ? '<span style="background:var(--success-fill); color:white; padding:1px 4px; border-radius:var(--r-ctl); font-weight:600;"><span class="icon"><svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg></span></span>' : '<span style="color:var(--text-3);">-</span>';
                        return `<tr>
                            <td style="color:var(--accent-info); font-weight:600;">${nodeId}</td>
                            <td style="text-align:center;">${check(bc.Ux)}</td>
                            <td style="text-align:center;">${check(bc.Uy)}</td>
                            <td style="text-align:center;">${check(bc.Uz)}</td>
                            <td style="text-align:center;">${check(bc.Rx)}</td>
                            <td style="text-align:center;">${check(bc.Ry)}</td>
                            <td style="text-align:center;">${check(bc.Rz)}</td>
                            <td><button class="btn-small" onclick="removeBC(${nodeId})" style="padding:2px 4px; font-size:var(--fs-xs);"><span class="icon"><svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></span></button></td>
                        </tr>`;
                    }).join('');
                }
            }
            
            // Update Point Loads table
            const loadTable = document.getElementById('loadTable');
            if (loadTable) {
                if (model.loads.length === 0) {
                    loadTable.innerHTML = '<tr><td colspan="9" style="color:var(--text-3); text-align:center;">No loads defined</td></tr>';
                } else {
                    loadTable.innerHTML = model.loads.map((load, idx) => {
                        const fmt = (v) => v ? v.toFixed(1) : '0';
                        // METIN varyanti: --danger bir DOLGU rengi; koyu zeminde metin
                        // olarak 4.08 kontrast veriyor, gereken 4.5.
                        const clr = (v) => v && v !== 0 ? 'var(--danger-text)' : 'var(--text-3)';
                        const editStyle = 'cursor:pointer; text-decoration:underline; text-decoration-style:dotted;';
                        return `<tr>
                            <td style="color:var(--accent-info); font-weight:600;">${load.nodeId}</td>
                            <td onclick="editPointLoad(${idx}, 'Fx')" style="color:${clr(load.Fx)}; ${editStyle}" title="Click to edit">${fmt(load.Fx)}</td>
                            <td onclick="editPointLoad(${idx}, 'Fy')" style="color:${clr(load.Fy)}; ${editStyle}" title="Click to edit">${fmt(load.Fy)}</td>
                            <td onclick="editPointLoad(${idx}, 'Fz')" style="color:${clr(load.Fz)}; font-weight:600; ${editStyle}" title="Click to edit">${fmt(load.Fz)}</td>
                            <td onclick="editPointLoad(${idx}, 'Mx')" style="color:${clr(load.Mx)}; ${editStyle}" title="Click to edit">${fmt(load.Mx)}</td>
                            <td onclick="editPointLoad(${idx}, 'My')" style="color:${clr(load.My)}; ${editStyle}" title="Click to edit">${fmt(load.My)}</td>
                            <td onclick="editPointLoad(${idx}, 'Mz')" style="color:${clr(load.Mz)}; ${editStyle}" title="Click to edit">${fmt(load.Mz)}</td>
                            <td>${yukDurumuSecici('node', idx, null, load.case)}</td>
                            <td><button class="btn-small" onclick="removeLoad(${idx})"style="padding:2px 4px; font-size:var(--fs-xs);"><span class="icon"><svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></span></button></td>
                        </tr>`;
                    }).join('');
                }
            }
            
            // Basinc yamalari tablosu (Loads sekmesi)
            const basincTablo = document.getElementById('basincTablo');
            if (basincTablo) {
                const ps = model.pressure || [];
                if (!ps.length) basincTablo.innerHTML = '<tr><td colspan="6" style="color:var(--text-3); text-align:center;">No pressure loads</td></tr>';
                else basincTablo.innerHTML = ps.map((p, i) => {
                    const dag = (typeof basincDagilimi === 'function') ? basincDagilimi(p) : [];
                    const ipucu = dag.length ? dag.map(d => 'E' + d.id + ': ' + d.q.toFixed(2) + ' kN/m (b=' + (d.serit * 1000).toFixed(0) + ' mm)').join(String.fromCharCode(10)) : 'no beam in patch';
                    return '<tr title="' + ipucu.replace(/"/g, '&quot;') + '">' +
                        '<td style="color:var(--accent-info); font-weight:600;">' + (p.ad || 'P' + (i + 1)) + '</td>' +
                        '<td style="color:var(--danger-text); font-weight:600;">' + p.value + '</td>' +
                        '<td style="color:var(--text-2); font-size:var(--fs-xs);">' + p.x1 + '–' + p.x2 + ' × ' + p.y1 + '–' + p.y2 + (typeof p.z === 'number' ? ' @z' + p.z : '') + '</td>' +
                        '<td style="color:var(--text-2);">' + (p.tasima || 'auto') + ' → ' + dag.length + ' beam' + (dag.length === 1 ? '' : 's') + '</td>' +
                        '<td>' + yukDurumuSecici('pressure', i, null, p.case) + '</td>' +
                        '<td><button class="btn-small" onclick="basincSil(' + i + ')" style="padding:2px 4px; font-size:var(--fs-xs);"><span class="icon"><svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></span></button></td></tr>';
                }).join('');
            }

            // Update Line Loads table
            const lineLoadTable = document.getElementById('lineLoadTable');
            if (lineLoadTable) {
                const lineLoads = [];
                Object.entries(model.elements).forEach(([elemKey, elem]) => {
                    const elemId = parseInt(elemKey);
                    if (elem.lineLoads && elem.lineLoads.length > 0) {
                        elem.lineLoads.forEach((ll, idx) => {
                            lineLoads.push({ 
                                elemId: elemId, 
                                n1: elem.n1, 
                                n2: elem.n2, 
                                idx, 
                                value: ll.value || ll.q || 0,
                                start: ll.start || 0,
                                end: ll.end || 1,
                                angle: ll.angle || 'z',
                                durum: ll.case
                            });
                        });
                    }
                });
                
                if (lineLoads.length === 0) {
                    lineLoadTable.innerHTML = '<tr><td colspan="6" style="color:var(--text-3); text-align:center;">No line loads defined</td></tr>';
                } else {
                    lineLoadTable.innerHTML = lineLoads.map(ll => {
                        const range = ll.start === 0 && ll.end === 1 ? 'Full' : `${(ll.start * 100).toFixed(0)}-${(ll.end * 100).toFixed(0)}%`;
                        return `<tr>
                            <td style="color:var(--accent-info); font-weight:600;">E${ll.elemId}</td>
                            <td style="color:var(--text-3); font-size:var(--fs-xs);">${ll.n1}→${ll.n2}</td>
                            <td onclick="editLineLoad(${ll.elemId}, ${ll.idx})" style="color:var(--success); font-weight:600; cursor:pointer; text-decoration:underline; text-decoration-style:dotted;" title="Click to edit">${ll.value.toFixed(1)}</td>
                            <td style="color:var(--text-2);">${range}</td>
                            <td>${yukDurumuSecici('line', ll.elemId, ll.idx, ll.durum)}</td>
                            <td><button class="btn-small" onclick="removeLineLoad(${ll.elemId}, ${ll.idx})"style="padding:2px 4px; font-size:var(--fs-xs); background:var(--danger); border:none; color:white; border-radius:var(--r-ctl); cursor:pointer;"><span class="icon"><svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></span></button></td>
                        </tr>`;
                    }).join('');
                }
            }
        }
        
        function editLineLoad(elemId, idx) {
            const elem = model.elements[elemId];
            if (!elem || !elem.lineLoads || !elem.lineLoads[idx]) return;
            
            const ll = elem.lineLoads[idx];
            const currentValue = ll.value || ll.q || 10;
            
            const newValue = prompt(`Edit Line Load on Element #${elemId}\n\nCurrent: ${currentValue} kN/m\nEnter new value (positive = downward):`, currentValue);
            
            if (newValue !== null && !isNaN(parseFloat(newValue))) {
                saveState();
                elem.lineLoads[idx].value = parseFloat(newValue);
                elem.lineLoads[idx].q = parseFloat(newValue); // Keep both for compatibility
                updateModelSummary();
                if (currentViewMode === '3d') update3DScene();
                else draw();
                showToast(`Line load updated to ${newValue} kN/m`);
            }
        }
        
        function editPointLoad(idx, component) {
            const load = model.loads[idx];
            if (!load) return;
            
            const currentValue = load[component] || 0;
            const unit = component.startsWith('M') ? 'kNm' : 'kN';
            const hint = component === 'Fz' ? ' (negative = downward)' : '';
            
            const newValue = prompt(`Edit ${component} on Node #${load.nodeId}\n\nCurrent: ${currentValue} ${unit}${hint}\nEnter new value:`, currentValue);
            
            if (newValue !== null && !isNaN(parseFloat(newValue))) {
                saveState();
                load[component] = parseFloat(newValue);
                updateModelSummary();
                if (currentViewMode === '3d') update3DScene();
                else draw();
                showToast(`${component} updated to ${newValue} ${unit}`);
            }
        }
        
        function removeBC(nodeId) {
            saveState(); // Save before removal
            delete model.constraints[nodeId];
            updateModelSummary();
            if (currentViewMode === '3d') update3DScene();
            else draw();
            showToast(`Constraint removed from Node #${nodeId}`);
        }
        
        function removeLoad(idx) {
            saveState(); // Save before removal
            const load = model.loads[idx];
            model.loads.splice(idx, 1);
            updateModelSummary();
            if (currentViewMode === '3d') update3DScene();
            else draw();
            showToast(`Load removed`);
        }
        
        function removeLineLoad(elemId, idx) {
            const elem = model.elements[elemId];
            if (elem && elem.lineLoads) {
                saveState(); // Save before removal
                elem.lineLoads.splice(idx, 1);
                updateModelSummary();
                if (currentViewMode === '3d') update3DScene();
                else draw();
                showToast(`Line load removed from Element #${elemId}`);
            }
        }
        
