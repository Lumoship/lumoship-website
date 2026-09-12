        // ============== LOAD CASES SYSTEM ==============
        let loadCases = [
            { id: 1, name: 'LC1 - Default', factor: 1.0, active: true }
        ];
        let activeLoadCaseId = 1;
        let nextLoadCaseId = 2;
        
        // Store loads per load case: { loadCaseId: { nodeLoads: [], lineLoads: {} } }
        let loadCaseData = {
            1: { nodeLoads: [], lineLoads: {} }
        };
        
        function getActiveLoadCase() {
            return loadCases.find(lc => lc.id === activeLoadCaseId) || loadCases[0];
        }
        
        function addLoadCase(name) {
            const newLC = {
                id: nextLoadCaseId++,
                name: name || `LC${nextLoadCaseId - 1}`,
                factor: 1.0,
                active: true
            };
            loadCases.push(newLC);
            loadCaseData[newLC.id] = { nodeLoads: [], lineLoads: {} };
            updateLoadCasesUI();
            showToast(`Load case "${newLC.name}" added`);
            return newLC;
        }
        
        function deleteLoadCase(id) {
            if (loadCases.length <= 1) {
                showToast('Cannot delete the last load case', 'error');
                return;
            }
            
            const idx = loadCases.findIndex(lc => lc.id === id);
            if (idx === -1) return;
            
            const name = loadCases[idx].name;
            loadCases.splice(idx, 1);
            delete loadCaseData[id];
            
            if (activeLoadCaseId === id) {
                activeLoadCaseId = loadCases[0].id;
                syncLoadsFromActiveLoadCase();
            }
            
            updateLoadCasesUI();
            showToast(`Load case "${name}" deleted`);
        }
        
        function switchLoadCase(id) {
            // Save current loads to current load case
            syncLoadsToActiveLoadCase();
            
            // Switch
            activeLoadCaseId = id;
            
            // Load new load case's loads
            syncLoadsFromActiveLoadCase();
            
            updateLoadCasesUI();
            updateModelSummary();
            
            if (currentViewMode === '3d') {
                update3DScene();
            } else {
                draw();
            }
            
            const lc = getActiveLoadCase();
            showToast(`Switched to "${lc.name}"`);
        }
        
        function syncLoadsToActiveLoadCase() {
            if (!loadCaseData[activeLoadCaseId]) {
                loadCaseData[activeLoadCaseId] = { nodeLoads: [], lineLoads: {} };
            }
            
            // Save node loads
            loadCaseData[activeLoadCaseId].nodeLoads = JSON.parse(JSON.stringify(model.loads));
            
            // Save line loads from elements
            const lineLoads = {};
            Object.entries(model.elements).forEach(([elemKey, elem]) => {
                if (elem.lineLoads && elem.lineLoads.length > 0) {
                    lineLoads[elemKey] = JSON.parse(JSON.stringify(elem.lineLoads));
                }
            });
            loadCaseData[activeLoadCaseId].lineLoads = lineLoads;
        }
        
        function syncLoadsFromActiveLoadCase() {
            const data = loadCaseData[activeLoadCaseId];
            if (!data) return;
            
            // Restore node loads
            model.loads = JSON.parse(JSON.stringify(data.nodeLoads || []));
            
            // Clear all line loads first
            Object.values(model.elements).forEach(elem => {
                elem.lineLoads = [];
            });
            
            // Restore line loads
            Object.entries(data.lineLoads || {}).forEach(([elemId, loads]) => {
                if (model.elements[elemId]) {
                    model.elements[elemId].lineLoads = JSON.parse(JSON.stringify(loads));
                }
            });
        }
        
        function renameLoadCase(id, newName) {
            const lc = loadCases.find(l => l.id === id);
            if (lc) {
                lc.name = newName;
                updateLoadCasesUI();
            }
        }
        
        function setLoadCaseFactor(id, factor) {
            const lc = loadCases.find(l => l.id === id);
            if (lc) {
                lc.factor = parseFloat(factor) || 1.0;
                updateLoadCasesUI();
            }
        }
        
        function toggleLoadCaseActive(id) {
            const lc = loadCases.find(l => l.id === id);
            if (lc) {
                lc.active = !lc.active;
                updateLoadCasesUI();
            }
        }
        
        function getCombinedLoads() {
            // Combine all active load cases with their factors
            const combined = {
                nodeLoads: [],
                lineLoads: {}
            };
            
            loadCases.filter(lc => lc.active).forEach(lc => {
                const data = loadCaseData[lc.id];
                if (!data) return;
                
                // Combine node loads
                (data.nodeLoads || []).forEach(load => {
                    const existing = combined.nodeLoads.find(l => l.nodeId === load.nodeId);
                    if (existing) {
                        if (load.Fx) existing.Fx = (existing.Fx || 0) + load.Fx * lc.factor;
                        if (load.Fy) existing.Fy = (existing.Fy || 0) + load.Fy * lc.factor;
                        if (load.Fz) existing.Fz = (existing.Fz || 0) + load.Fz * lc.factor;
                    } else {
                        combined.nodeLoads.push({
                            nodeId: load.nodeId,
                            Fx: (load.Fx || 0) * lc.factor,
                            Fy: (load.Fy || 0) * lc.factor,
                            Fz: (load.Fz || 0) * lc.factor
                        });
                    }
                });
                
                // Combine line loads
                Object.entries(data.lineLoads || {}).forEach(([elemId, loads]) => {
                    if (!combined.lineLoads[elemId]) {
                        combined.lineLoads[elemId] = [];
                    }
                    loads.forEach(load => {
                        combined.lineLoads[elemId].push({
                            ...load,
                            value: load.value * lc.factor
                        });
                    });
                });
            });
            
            return combined;
        }
        
        function updateLoadCasesUI() {
            const container = document.getElementById('loadCasesList');
            if (!container) return;
            
            container.innerHTML = loadCases.map(lc => `
                <div class="load-case-item ${lc.id === activeLoadCaseId ? 'active' : ''}" style="display:flex; align-items:center; gap:8px; padding:8px; background:${lc.id === activeLoadCaseId ? '#334155' : '#1e293b'}; border-radius:var(--r-ctl); margin-bottom:4px;">
                    <input type="checkbox" ${lc.active ? 'checked' : ''} onchange="toggleLoadCaseActive(${lc.id})" title="Include in combination" style="cursor:pointer;">
                    <span onclick="switchLoadCase(${lc.id})" style="flex:1; cursor:pointer; color:${lc.id === activeLoadCaseId ? 'var(--primary)' : '#e2e8f0'};">${lc.name}</span>
                    <input type="number" value="${lc.factor}" onchange="setLoadCaseFactor(${lc.id}, this.value)" style="width:50px; background:var(--bg-main); border:1px solid var(--border); color:var(--text); border-radius:var(--r-ctl); padding:2px 4px; text-align:center;" title="Factor">
                    ${loadCases.length > 1 ? `<button onclick="deleteLoadCase(${lc.id})" style="background:none; border:none; color:var(--danger); cursor:pointer;" title="Delete">×</button>` : ''}
                </div>
            `).join('');
        }
        
        function showLoadCasesModal() {
            const existingModal = document.getElementById('loadCasesModal');
            if (existingModal) existingModal.remove();
            
            const modal = document.createElement('div');
            modal.id = 'loadCasesModal';
            modal.innerHTML = `
                <div style="position:fixed; inset:0; background:rgba(0,0,0,0.7); z-index:10000; display:flex; align-items:center; justify-content:center;" onclick="if(event.target===this)this.remove()">
                    <div style="background:var(--bg-elev); border-radius:var(--r-ovl); width:400px; max-height:80vh; overflow:hidden;">
                        <div style="display:flex; justify-content:space-between; align-items:center; padding:16px; border-bottom:1px solid var(--border);">
                            <h3 style="margin:0; color:var(--text);">Load Cases</h3>
                            <button onclick="this.closest('#loadCasesModal').remove()" style="background:none; border:none; color:var(--text-2); cursor:pointer; font-size:var(--fs-lg);">&times;</button>
                        </div>
                        <div style="padding:16px; max-height:400px; overflow-y:auto;">
                            <div id="loadCasesList"></div>
                            <button onclick="addLoadCase()" style="width:100%; margin-top:12px; padding:8px; background:var(--primary-fill); color:white; border:none; border-radius:var(--r-ctl); cursor:pointer;">
                                + Add Load Case
                            </button>
                        </div>
                        <div style="padding:16px; border-top:1px solid var(--border); background:var(--bg-main);">
                            <div style="font-size:var(--fs-sm); color:var(--text-2); margin-bottom:8px;">
                                ✓ Check = include in combination<br>
                                Factor = multiplier for loads<br>
                                Click name to edit that load case
                            </div>
                            <button onclick="solveCombinedLoadCases(); this.closest('#loadCasesModal').remove();" style="width:100%; padding:8px; background:var(--success-fill); color:white; border:none; border-radius:var(--r-ctl); cursor:pointer;">
                                Solve Combined
                            </button>
                        </div>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
            updateLoadCasesUI();
        }
        
        function solveCombinedLoadCases() {
            // Save current loads
            syncLoadsToActiveLoadCase();
            
            // Get combined loads
            const combined = getCombinedLoads();
            
            // Temporarily apply combined loads
            const originalLoads = model.loads;
            const originalLineLoads = {};
            Object.entries(model.elements).forEach(([elemKey, elem]) => {
                originalLineLoads[elemKey] = elem.lineLoads;
            });
            
            model.loads = combined.nodeLoads;
            Object.entries(combined.lineLoads).forEach(([elemId, loads]) => {
                if (model.elements[elemId]) {
                    model.elements[elemId].lineLoads = loads;
                }
            });
            
            // Solve
            solveModel();
            
            // Restore original loads
            model.loads = originalLoads;
            Object.entries(originalLineLoads).forEach(([elemId, loads]) => {
                if (model.elements[elemId]) {
                    model.elements[elemId].lineLoads = loads;
                }
            });
        }
        
        // Global counters for node and element IDs
        let nextNodeId = 1;
        let nextElementId = 1;
        
        // Undo/Redo History System
        let history = [];
        let historyIndex = -1;
        const MAX_HISTORY = 50;
        
        function saveState() {
            // Remove any redo states
            history = history.slice(0, historyIndex + 1);
            
            // Deep clone current model
            const state = JSON.stringify(model);
            history.push(state);
            
            // Limit history size
            if (history.length > MAX_HISTORY) {
                history.shift();
            } else {
                historyIndex++;
            }
            
            // Auto-save to localStorage
            autoSaveModel();
            
            // Mark that model changed after last solve
            if (results) {
                modelChangedAfterSolve = true;
                updateResultsWarning();
            }
            
            updateUndoRedoButtons();
            if (typeof updateEmptyState === 'function') updateEmptyState();
        }
        
        // ============== AUTO-SAVE SYSTEM ==============
        let autoSaveTimer = null;
        const AUTO_SAVE_DELAY = 2000; // 2 seconds after last change
        
        function autoSaveModel() {
            // Debounce - wait for user to stop making changes
            if (autoSaveTimer) clearTimeout(autoSaveTimer);
            
            autoSaveTimer = setTimeout(() => {
                try {
                    const saveData = {
                        model: model,
                        timestamp: Date.now(),
                        version: '1.0'
                    };
                    localStorage.setItem('grillage_autosave', JSON.stringify(saveData));
                    
                    // Update auto-save indicator
                    const indicator = document.getElementById('autoSaveIndicator');
                    if (indicator) {
                        indicator.textContent = 'Saved';
                        indicator.style.color = 'var(--success)';
                        setTimeout(() => {
                            indicator.textContent = '';
                        }, 2000);
                    }
                } catch (e) {
                    debugError('Auto-save failed:', e);
                }
            }, AUTO_SAVE_DELAY);
        }
        
        function loadAutoSave() {
            try {
                const saved = localStorage.getItem('grillage_autosave');
                if (!saved) return false;
                
                const data = safeJsonParse(saved, null);
                if (!data || !data.model || !isValidModelData(data.model)) return false;
                
                // Check if auto-save is recent (within 24 hours)
                const age = Date.now() - (data.timestamp || 0);
                if (age > 24 * 60 * 60 * 1000) {
                    localStorage.removeItem('grillage_autosave');
                    return false;
                }
                
                return data;
            } catch (e) {
                return false;
            }
        }
        
        function restoreAutoSave() {
            const data = loadAutoSave();
            if (data && data.model) {
                model = data.model;
                
                // Recalculate IDs
                const nodeIds = Object.keys(model.nodes).map(id => parseInt(id));
                const elemIds = Object.keys(model.elements).map(id => parseInt(id));
                nextNodeId = nodeIds.length > 0 ? Math.max(...nodeIds) + 1 : 1;
                nextElementId = elemIds.length > 0 ? Math.max(...elemIds) + 1 : 1;
                
                updateModelSummary();
                update3DScene();
                fitView();
                
                const timeAgo = formatTimeAgo(data.timestamp);
                showToast(`Model restored from auto-save (${timeAgo})`, 'success');
                return true;
            }
            return false;
        }
        
        function clearAutoSave() {
            localStorage.removeItem('grillage_autosave');
        }
        
        function formatTimeAgo(timestamp) {
            const seconds = Math.floor((Date.now() - timestamp) / 1000);
            if (seconds < 60) return 'just now';
            const minutes = Math.floor(seconds / 60);
            if (minutes < 60) return `${minutes} min ago`;
            const hours = Math.floor(minutes / 60);
            if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
            return 'yesterday';
        }
        
        // ============== RECENT FILES ==============
        const MAX_RECENT_FILES = 5;
        
        // Bir girdide saklanacak en buyuk model. Buyuk modeller listede yine gorunur ama
        // icerigi tutulmaz - o zaman dosyadan acilmalari gerekir.
        const MAX_RECENT_BYTES = 512 * 1024;

        function addToRecentFiles(filename, modelData) {
            try {
                let recent = safeJsonParse(localStorage.getItem('grillage_recent_files'), []);
                if (!Array.isArray(recent)) recent = [];

                // Remove if already exists
                recent = recent.filter(f => f.name !== filename);

                // Modelin kendisi de saklanir - eskiden yalnizca ustveri tutuluyordu, bu
                // yuzden listeye tiklamak "bulut depolama gerekiyor" diyordu. Kucuk bir
                // grillage JSON'u localStorage'a rahat sigar.
                const json = JSON.stringify(modelData);
                const entry = {
                    name: filename,
                    timestamp: Date.now(),
                    nodeCount: Object.keys(modelData.nodes || {}).length,
                    elementCount: Object.keys(modelData.elements || {}).length
                };
                if (json.length <= MAX_RECENT_BYTES) entry.data = json;

                recent.unshift(entry);
                recent = recent.slice(0, MAX_RECENT_FILES);

                // Kota dolarsa en eskiden baslayarak icerigi birak, liste yine kalsin.
                for (;;) {
                    try {
                        localStorage.setItem('grillage_recent_files', JSON.stringify(recent));
                        break;
                    } catch (quota) {
                        const victim = [...recent].reverse().find(f => f.data);
                        if (!victim) throw quota;
                        delete victim.data;
                    }
                }
                updateRecentFilesMenu();
            } catch (e) {
                debugError('Failed to save recent file:', e);
            }
        }
        
        function getRecentFiles() {
            try {
                const recent = safeJsonParse(localStorage.getItem('grillage_recent_files'), []);
                return Array.isArray(recent) ? recent : [];
            } catch (e) {
                return [];
            }
        }
        
        function updateRecentFilesMenu() {
            const container = document.getElementById('recentFilesList');
            if (!container) return;
            
            const recent = getRecentFiles();
            
            if (recent.length === 0) {
                container.innerHTML = '<div style="color:var(--text-3); font-size:var(--fs-sm); padding:8px;">No recent files</div>';
                return;
            }
            
            container.innerHTML = recent.map((file, i) => `
                <div class="recent-file-item" onclick="loadRecentFile(${i})" style="padding:8px 12px; cursor:pointer; border-bottom:1px solid var(--border); display:flex; justify-content:space-between; align-items:center;">
                    <div>
                        <div style="color:var(--text); font-size:var(--fs-md);">${file.name}</div>
                        <div style="color:var(--text-3); font-size:var(--fs-xs);">${file.nodeCount} nodes, ${file.elementCount} beams • ${formatTimeAgo(file.timestamp)}</div>
                    </div>
                    <span class="icon" style="color:var(--text-3);"><svg viewBox="0 0 24 24" width="16" height="16"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></span>
                </div>
            `).join('');
        }
        
        function loadRecentFile(index) {
            const recent = getRecentFiles();
            const entry = recent[index];
            if (!entry) return;

            if (!entry.data) {
                showToast('"' + entry.name + '" was too large to keep - open the file itself', 'warning');
                return;
            }

            const parsed = safeJsonParse(entry.data, null);
            if (!parsed || !isValidModelData(parsed)) {
                showToast('"' + entry.name + '" could not be read', 'error');
                return;
            }

            model = parsed;
            results = null;

            // Yeni id'ler mevcut modelin uzerinden devam etmeli
            const nodeIds = Object.keys(model.nodes).map(id => parseInt(id));
            const elemIds = Object.keys(model.elements).map(id => parseInt(id));
            nextNodeId = nodeIds.length > 0 ? Math.max(...nodeIds) + 1 : 1;
            nextElementId = elemIds.length > 0 ? Math.max(...elemIds) + 1 : 1;

            if (typeof updateModelSummary === 'function') updateModelSummary();
            if (typeof updateSectionDropdowns === 'function') updateSectionDropdowns();
            if (typeof refreshView === 'function') refreshView();
            if (typeof fitView === 'function') fitView();
            if (typeof updateEmptyState === 'function') updateEmptyState();
            saveState();
            showToast('Opened ' + entry.name);
        }
        
        function undo() {
            if (historyIndex > 0) {
                historyIndex--;
                const parsed = safeJsonParse(history[historyIndex]);
                if (parsed && isValidModelData(parsed)) {
                    model = parsed;
                    results = null; // Clear results after undo
                    updateAfterHistoryChange();
                    showToast('Undo');
                } else {
                    showToast('Undo failed: corrupted history', 'error');
                    historyIndex++; // Revert
                }
            }
        }
        
        function redo() {
            if (historyIndex < history.length - 1) {
                historyIndex++;
                const parsed = safeJsonParse(history[historyIndex]);
                if (parsed && isValidModelData(parsed)) {
                    model = parsed;
                    results = null;
                    updateAfterHistoryChange();
                    showToast('Redo');
                } else {
                    showToast('Redo failed: corrupted history', 'error');
                    historyIndex--; // Revert
                }
            }
        }
        
        function updateAfterHistoryChange() {
            updateUndoRedoButtons();
            updateModelSummary();
            clearSelection();
            if (currentViewMode === '3d') {
                update3DScene();
            } else {
                draw();
            }
        }
        
        function updateUndoRedoButtons() {
            const undoBtn = document.getElementById('undoBtn');
            const redoBtn = document.getElementById('redoBtn');
            
            if (undoBtn) {
                undoBtn.disabled = historyIndex <= 0;
                undoBtn.style.opacity = historyIndex > 0 ? '1' : '0.5';
            }
            if (redoBtn) {
                redoBtn.disabled = historyIndex >= history.length - 1;
                redoBtn.style.opacity = historyIndex < history.length - 1 ? '1' : '0.5';
            }
        }
        
