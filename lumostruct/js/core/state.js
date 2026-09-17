        // Yuk durumlari / kombinasyonlar: js/core/yukler.js (model.loadCases,
        // model.combinations). Buradaki eski "load case" sistemi (yukleri
        // durum basina ayri saklayip modele takas eden) kaldirildi.

        // Global counters for node and element IDs
        let nextNodeId = 1;
        let nextElementId = 1;
        
        // Undo/Redo History System
        let history = [];
        let historyIndex = -1;
        const MAX_HISTORY = 50;
        
        // Model degisti - sol panel tablolari bunu ogrensin.
        //
        // updateModelTables() bugune kadar YALNIZCA panels.js icinden
        // cagriliyordu, yani panelin kendi Add/Remove dugmelerinden. Tuvale
        // cizim, Quick Grillage, ice aktarma, kopya/ayna/bolme ve geri al
        // tabloyu hic tazelemiyordu: model doluyken sol panel "Nodes 0 /
        // Beams 0" yaziyordu.
        //
        // Tazeleme mevcut is bittikten SONRAYA birakiliyor. saveState bazi
        // yerlerde degisiklikten once, bazilarinda sonra cagriliyor; mikro
        // gorev kuyruguna atinca iki desende de son durum okunur. Ayni
        // islemdeki birden fazla cagri tek tazelemeye duser.
        let _tazelemeBekliyor = false;
        function modelTablolariniTazele() {
            if (_tazelemeBekliyor) return;
            _tazelemeBekliyor = true;
            Promise.resolve().then(() => {
                _tazelemeBekliyor = false;
                try {
                    if (typeof updateModelTables === 'function') updateModelTables();
                    if (typeof updateModelSummary === 'function') updateModelSummary();
                    // Kesit acilir listeleri de kutuphaneyi takip etsin. Aksi
                    // halde sayac "Sections 1" derken liste "No profiles"
                    // diyebiliyor - ayni kutuphane, iki ayri cevap.
                    // updateSectionDropdowns mevcut secimi koruyor.
                    if (typeof updateSectionDropdowns === 'function') updateSectionDropdowns();
                } catch (e) {
                    // Arayuz henuz kurulmamis olabilir (acilis, testler).
                    // Tazeleme bir kolaylik; basarisizligi modeli etkilemez.
                }
            });
        }

        // GECMIS KURALI: history[historyIndex] her zaman "su anki model"in
        // son kaydidir. saveState degisiklikten ONCE cagrilir ve degisiklik
        // oncesi hali yazar; degisiklik SONRASI hal ise ilk geri almada
        // (gecmisePisir) yazilir. Eskiden bu ikinci yazim yoktu: ilk geri al
        // bir adim atliyordu, ileri al son degisikligi hic getiremiyordu.
        function gecmisePisir() {
            const simdi = JSON.stringify(model);
            if (history[historyIndex] === simdi) return;
            history = history.slice(0, historyIndex + 1);
            history.push(simdi);
            if (history.length > MAX_HISTORY) history.shift(); else historyIndex++;
        }

        function saveState() {
            // Su anki hali (henuz yazilmadiysa) yaz; yeni degisiklik geliyor,
            // geri alinmis ileri dali her durumda atilir.
            gecmisePisir();
            history = history.slice(0, historyIndex + 1);

            // Auto-save to localStorage
            autoSaveModel();

            modelTablolariniTazele();
            
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
            gecmisePisir();                 // son degisiklik ileri al icin dursun
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
            // Geri al / ileri al saveState cagirmaz (tam da amaci gecmise
            // yazmamak), o yuzden tablo tazelemesi buraya ayrica konuyor.
            modelTablolariniTazele();
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
        
