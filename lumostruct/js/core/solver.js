        // ============== SOLVER ==============
        // ============== MODEL VALIDATION ==============
        function validateModel() {
            const issues = {
                errors: [],    // Kritik - çözüm yapılamaz
                warnings: []   // Uyarı - çözüm yapılabilir ama dikkat
            };
            
            const nodeIds = Object.keys(model.nodes).map(id => parseInt(id));
            const elementIds = Object.keys(model.elements).map(id => parseInt(id));
            
            // 1. FLOATING NODES - Hiçbir beam'e bağlı olmayan node'lar
            const connectedNodes = new Set();
            Object.values(model.elements).forEach(elem => {
                connectedNodes.add(elem.n1);
                connectedNodes.add(elem.n2);
            });
            
            const floatingNodes = nodeIds.filter(id => !connectedNodes.has(id));
            if (floatingNodes.length > 0) {
                issues.warnings.push({
                    type: 'floating_nodes',
                    // 'error' metni duruyordu; pencerede baslik "error Floating Nodes" cikiyordu.
                    icon: '<span class="icon"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="9" stroke-dasharray="3 3"/></svg></span>',
                    title: 'Floating Nodes',
                    message: `${floatingNodes.length} node(s) not connected to any beam`,
                    details: `Node IDs: ${floatingNodes.slice(0, 10).join(', ')}${floatingNodes.length > 10 ? '...' : ''}`,
                    nodes: floatingNodes
                });
            }
            
            // 2. DUPLICATE BEAMS - Aynı 2 node arasında birden fazla beam
            const beamPairs = {};
            const duplicateBeams = [];
            Object.entries(model.elements).forEach(([id, elem]) => {
                const key = [Math.min(elem.n1, elem.n2), Math.max(elem.n1, elem.n2)].join('-');
                if (beamPairs[key]) {
                    duplicateBeams.push({ id: parseInt(id), existingId: beamPairs[key], n1: elem.n1, n2: elem.n2 });
                } else {
                    beamPairs[key] = parseInt(id);
                }
            });
            
            if (duplicateBeams.length > 0) {
                issues.warnings.push({
                    type: 'duplicate_beams',
                    icon: '<span class="icon"><svg viewBox="0 0 24 24"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg></span>',
                    title: 'Duplicate Beams',
                    message: `${duplicateBeams.length} duplicate beam(s) found`,
                    details: duplicateBeams.slice(0, 5).map(d => `Beam #${d.id} duplicates #${d.existingId}`).join(', '),
                    beams: duplicateBeams
                });
            }
            
            // 3. CONNECTIVITY CHECK - Birbirinden ayrık parçalar
            const groups = findConnectedGroups();
            if (groups.length > 1) {
                issues.warnings.push({
                    type: 'disconnected_parts',
                    icon: '<span class="icon"><svg viewBox="0 0 24 24"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg></span>',
                    title: 'Disconnected Parts',
                    message: `Model has ${groups.length} separate parts`,
                    details: groups.map((g, i) => `Part ${i + 1}: ${g.length} nodes`).join(', '),
                    groups: groups
                });
            }
            
            // 4. BOUNDARY CONDITION WARNINGS
            const constrainedNodes = Object.keys(model.constraints).map(id => parseInt(id));
            
            // 4a. Hiç BC yok
            if (constrainedNodes.length === 0) {
                issues.errors.push({
                    type: 'no_constraints',
                    icon: '<span class="icon"><svg viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></span>',
                    title: 'No Boundary Conditions',
                    message: 'Model has no constraints defined',
                    details: 'At least one node must be constrained to prevent rigid body motion'
                });
            } else {
                // 4b. BC'li node beam'e bağlı değil
                const floatingConstraints = constrainedNodes.filter(id => !connectedNodes.has(id));
                if (floatingConstraints.length > 0) {
                    issues.warnings.push({
                        type: 'floating_constraints',
                        icon: '<span class="icon"><svg viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></span>',
                        title: 'Constraints on Floating Nodes',
                        message: `${floatingConstraints.length} constraint(s) on unconnected nodes`,
                        details: `Node IDs: ${floatingConstraints.join(', ')}`,
                        nodes: floatingConstraints
                    });
                }
                
                // 4c. Tüm BC'ler tek bir parçada mı? (disconnected için)
                if (groups.length > 1) {
                    const unconstrainedGroups = groups.filter(group => 
                        !group.some(nodeId => constrainedNodes.includes(nodeId))
                    );
                    if (unconstrainedGroups.length > 0) {
                        issues.errors.push({
                            type: 'unconstrained_parts',
                            icon: '<span class="icon"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg></span>',
                            title: 'Unconstrained Parts',
                            message: `${unconstrainedGroups.length} part(s) have no boundary conditions`,
                            details: 'Each disconnected part needs at least one constraint'
                        });
                    }
                }
            }
            
            // 5. UNSTABLE MODEL DETECTION
            const stabilityCheck = checkModelStability();
            if (!stabilityCheck.stable) {
                issues.errors.push({
                    type: 'unstable_model',
                    icon: '<span class="icon"><svg viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg></span>',
                    title: 'Potentially Unstable Model',
                    message: stabilityCheck.reason,
                    details: stabilityCheck.details
                });
            }
            
            // 6. NO LOADS WARNING
            // Hat yuklari kirisin ustunde durur (elem.lineLoads); yalnizca
            // model.loads/pressure'a bakmak, sadece hat yuku tasiyan bir
            // modele "yuk yok" dedirtiyordu.
            const hasLoads = model.loads.length > 0 || model.pressure.length > 0 ||
                Object.values(model.elements).some(e => (e.lineLoads && e.lineLoads.length > 0) || (e.pointLoads && e.pointLoads.length > 0));
            if (!hasLoads) {
                issues.warnings.push({
                    type: 'no_loads',
                    icon: '<span class="icon"><svg viewBox="0 0 24 24"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg></span>',
                    title: 'No Loads Applied',
                    message: 'Model has no loads defined',
                    details: 'Results will show zero displacements and stresses'
                });
            }
            
            // 7. MISSING SECTIONS
            const missingSections = [];
            Object.entries(model.elements).forEach(([id, elem]) => {
                // Profilsiz kiris rijit (kesitBul); yalnizca ADI olup
                // kutuphanede bulunmayan kesit eksiktir.
                if (!kesitBul(elem.section)) {
                    missingSections.push(parseInt(id));
                }
            });
            if (missingSections.length > 0) {
                issues.errors.push({
                    type: 'missing_sections',
                    icon: '<span class="icon"><svg viewBox="0 0 24 24"><path d="M21.21 15.89A1 1 0 0 0 22 15V6a1 1 0 0 0-.29-.71l-4-4A1 1 0 0 0 17 1H8a1 1 0 0 0-.71.29l-4 4A1 1 0 0 0 3 6v9a1 1 0 0 0 .79.98l8 2a1 1 0 0 0 .42 0l8-2z"/><line x1="7" y1="6" x2="7" y2="10"/><line x1="11" y1="6" x2="11" y2="8"/><line x1="15" y1="6" x2="15" y2="10"/></svg></span>',
                    title: 'Missing Section Properties',
                    message: `${missingSections.length} beam(s) have undefined sections`,
                    details: `Beam IDs: ${missingSections.slice(0, 10).join(', ')}${missingSections.length > 10 ? '...' : ''}`,
                    beams: missingSections
                });
            }
            
            // 7b. GECERSIZ KESIT OZELLIKLERI - kutuphanede var ama A / Iy / Wy
            // sifir ya da null (yanlis parametreyle kurulmus profil, bozuk
            // dosya). Eskiden cozume giriyor, sonuc sessizce anlamsizlasiyordu.
            const bozukKesitler = [];
            Object.entries(model.elements).forEach(([id, elem]) => {
                const s = kesitBul(elem.section);
                if (!s || s.rigid) return;
                if (!(s.A > 0) || !(s.Iy > 0) || !(s.Wy > 0 || s.WyTop > 0 || s.WyBot > 0)) bozukKesitler.push(parseInt(id));
            });
            if (bozukKesitler.length > 0) {
                issues.errors.push({
                    type: 'invalid_sections',
                    icon: '<span class="icon"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg></span>',
                    title: 'Invalid Section Properties',
                    message: `${bozukKesitler.length} beam(s) have a section with zero / missing A, Iy or Wy`,
                    details: `Beam IDs: ${bozukKesitler.slice(0, 10).join(', ')}${bozukKesitler.length > 10 ? '...' : ''}. Re-create the profile (check the dimension fields).`,
                    beams: bozukKesitler
                });
            }

            // 7c. TANIMSIZ YUK DURUMU - yukun `case` alani model.loadCases'te
            // yoksa kombinasyon katsayisi 0 olur ve yuk SESSIZCE yok sayilir
            // (DNV dosyasindan gelen D/C1 durumlu modele 'L' durumlu yuk
            // eklenince yasandi). Uyar; kullanici Loads sekmesinden durum atar.
            if (typeof yukDurumlari === 'function') {
                const durumlar = new Set(yukDurumlari().map(d => d.id));
                const yetim = {};
                const say = (durum, etiket) => { if (durum === undefined || durum === null || durumlar.has(durum)) return; (yetim[durum] = yetim[durum] || []).push(etiket); };
                (model.loads || []).forEach((l, i) => say(l.case, 'node ' + l.nodeId));
                (model.pressure || []).forEach((p, i) => say(p.case, 'pressure ' + (p.ad || 'P' + (i + 1))));
                Object.entries(model.elements).forEach(([id, e]) => {
                    (e.lineLoads || []).forEach(ll => say(ll.case, 'beam ' + id + ' line load'));
                    (e.pointLoads || []).forEach(pl => say(pl.case, 'beam ' + id + ' point load'));
                });
                const anahtarlar = Object.keys(yetim);
                if (anahtarlar.length) {
                    const toplam = anahtarlar.reduce((s, k) => s + yetim[k].length, 0);
                    issues.warnings.push({
                        type: 'unknown_load_case',
                        icon: '<span class="icon"><svg viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></span>',
                        title: 'Loads in an Undefined Load Case',
                        message: `${toplam} load(s) use case ${anahtarlar.map(k => '"' + k + '"').join(', ')} which is not defined - they get factor 0 and are IGNORED`,
                        details: 'Defined cases: ' + [...durumlar].join(', ') + '. Assign a case in the beam / node card (Case) or add the case in Loads › Cases & combinations…. First: ' +
                                 anahtarlar.map(k => k + ': ' + yetim[k].slice(0, 4).join(', ') + (yetim[k].length > 4 ? '...' : '')).join('; '),
                        cases: yetim
                    });
                }
            }

            // 8. ZERO LENGTH BEAMS
            const zeroLengthBeams = [];
            Object.entries(model.elements).forEach(([id, elem]) => {
                const n1 = model.nodes[elem.n1];
                const n2 = model.nodes[elem.n2];
                if (n1 && n2) {
                    const length = Math.sqrt((n2.x - n1.x)**2 + (n2.y - n1.y)**2 + ((n2.z || 0) - (n1.z || 0))**2);
                    if (length < 0.001) { // < 1mm
                        zeroLengthBeams.push(parseInt(id));
                    }
                }
            });
            if (zeroLengthBeams.length > 0) {
                issues.errors.push({
                    type: 'zero_length_beams',
                    icon: '<span class="icon"><svg viewBox="0 0 24 24"><path d="M16 3H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z"/><line x1="6" y1="7" x2="10" y2="7"/><line x1="6" y1="12" x2="8" y2="12"/><line x1="6" y1="17" x2="10" y2="17"/></svg></span>',
                    title: 'Zero-Length Beams',
                    message: `${zeroLengthBeams.length} beam(s) have zero or near-zero length`,
                    details: `Beam IDs: ${zeroLengthBeams.join(', ')}`,
                    beams: zeroLengthBeams
                });
            }
            
            return issues;
        }
        
        // Find connected node groups using BFS
        function findConnectedGroups() {
            const nodeIds = Object.keys(model.nodes).map(id => parseInt(id));
            if (nodeIds.length === 0) return [];
            
            // Build adjacency list
            const adjacency = {};
            nodeIds.forEach(id => adjacency[id] = new Set());
            
            Object.values(model.elements).forEach(elem => {
                adjacency[elem.n1]?.add(elem.n2);
                adjacency[elem.n2]?.add(elem.n1);
            });
            
            const visited = new Set();
            const groups = [];
            
            nodeIds.forEach(startNode => {
                if (visited.has(startNode)) return;
                
                // BFS
                const group = [];
                const queue = [startNode];
                
                while (queue.length > 0) {
                    const node = queue.shift();
                    if (visited.has(node)) continue;
                    
                    visited.add(node);
                    group.push(node);
                    
                    adjacency[node]?.forEach(neighbor => {
                        if (!visited.has(neighbor)) {
                            queue.push(neighbor);
                        }
                    });
                }
                
                if (group.length > 0) {
                    groups.push(group);
                }
            });
            
            return groups;
        }
        
        // Check basic stability requirements
        function checkModelStability() {
            const constrainedDofs = { Ux: 0, Uy: 0, Uz: 0, Rx: 0, Ry: 0, Rz: 0 };
            
            Object.values(model.constraints).forEach(bc => {
                if (typeof bc === 'object') {
                    if (bc.Ux) constrainedDofs.Ux++;
                    if (bc.Uy) constrainedDofs.Uy++;
                    if (bc.Uz) constrainedDofs.Uz++;
                    if (bc.Rx) constrainedDofs.Rx++;
                    if (bc.Ry) constrainedDofs.Ry++;
                    if (bc.Rz) constrainedDofs.Rz++;
                }
            });
            
            // For a 3D grillage in XY plane with Z-loads:
            // Need at least: 3 Uz constraints (or 1 Uz + rotations) to prevent rigid body motion
            
            const totalUz = constrainedDofs.Uz;
            const totalRx = constrainedDofs.Rx;
            const totalRy = constrainedDofs.Ry;
            
            if (totalUz === 0) {
                return {
                    stable: false,
                    reason: 'No vertical (Uz) constraints',
                    details: 'Model can move freely in Z direction. Add at least one Uz constraint.'
                };
            }
            
            if (totalUz === 1 && totalRx === 0 && totalRy === 0) {
                return {
                    stable: false,
                    reason: 'Insufficient constraints for stability',
                    details: 'Single Uz constraint allows rotation. Add Rx/Ry constraints or more Uz points.'
                };
            }
            
            if (totalUz === 2) {
                // Check if they're collinear (would still allow rotation about that line)
                const constrainedNodeIds = Object.keys(model.constraints).filter(id => {
                    const bc = model.constraints[id];
                    return bc && bc.Uz;
                }).map(id => parseInt(id));
                
                if (constrainedNodeIds.length === 2) {
                    const n1 = model.nodes[constrainedNodeIds[0]];
                    const n2 = model.nodes[constrainedNodeIds[1]];
                    if (n1 && n2 && totalRx === 0 && totalRy === 0) {
                        return {
                            stable: false,
                            reason: 'Only 2 collinear Uz constraints',
                            details: 'Model can rotate about the line between supports. Add a third support or rotational constraints.'
                        };
                    }
                }
            }
            
            return { stable: true };
        }
        
        // Show validation modal
        function showValidationModal(issues) {
            const hasErrors = issues.errors.length > 0;
            const hasWarnings = issues.warnings.length > 0;
            
            let html = `
                <div class="modal-overlay active" id="validationModal" onclick="closeValidationModal(event)">
                    <div class="modal" style="max-width:600px;" onclick="event.stopPropagation()">
                        <div class="modal-header" style="background:${hasErrors ? 'linear-gradient(135deg, #7f1d1d, #991b1b)' : 'linear-gradient(135deg, #713f12, #a16207)'};">
                            <h2>${hasErrors ? '<span class="icon"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg></span> Model Validation Failed' : '<span class="icon"><svg viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></span> Model Validation Warnings'}</h2>
                            <button class="modal-close" onclick="closeValidationModal()">&times;</button>
                        </div>
                        <div class="modal-body" style="padding:20px; max-height:60vh; overflow-y:auto;">
            `;
            
            if (hasErrors) {
                html += `<div style="margin-bottom:20px;">
                    <div style="color:var(--danger-text); font-weight:600; margin-bottom:8px; font-size:var(--fs-md);">
                        <span class="icon"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg></span> Errors (Must fix before solving)
                    </div>`;
                issues.errors.forEach(err => {
                    html += `
                        <div style="background:var(--bg-main); border-left:3px solid var(--danger); padding:12px; margin-bottom:8px; border-radius:0 6px 6px 0;">
                            <div style="color:var(--danger-text); font-weight:600; margin-bottom:4px;">${err.icon} ${err.title}</div>
                            <div style="color:var(--danger-text); font-size:var(--fs-md);">${err.message}</div>
                            <div style="color:#a8a29e; font-size:var(--fs-sm); margin-top:4px;">${err.details}</div>
                            ${Array.isArray(err.beams) && err.beams.length ? `<button class="btn-secondary btn-small" style="margin-top:8px;" onclick="closeValidationModal(); selectAndHighlightBeams([${err.beams.join(',')}])">Select Beams</button>` : ''}
                        </div>`;
                });
                html += `</div>`;
            }
            
            if (hasWarnings) {
                html += `<div>
                    <div style="color:var(--warning); font-weight:600; margin-bottom:8px; font-size:var(--fs-md);">
                        <span class="icon"><svg viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></span> Warnings (Review recommended)
                    </div>`;
                issues.warnings.forEach(warn => {
                    html += `
                        <div style="background:var(--bg-main); border-left:3px solid var(--warning); padding:12px; margin-bottom:8px; border-radius:0 6px 6px 0;">
                            <div style="color:var(--warning); font-weight:600; margin-bottom:4px;">${warn.icon} ${warn.title}</div>
                            <div style="color:var(--warning); font-size:var(--fs-md);">${warn.message}</div>
                            <div style="color:#a8a29e; font-size:var(--fs-sm); margin-top:4px;">${warn.details}</div>
                            ${warn.type === 'floating_nodes' ? `<button class="btn-secondary btn-small" style="margin-top:8px;" onclick="selectAndHighlightNodes([${warn.nodes.join(',')}])">Select Nodes</button>` : ''}
                            ${warn.type === 'duplicate_beams' ? `<button class="btn-secondary btn-small" style="margin-top:8px;" onclick="selectAndHighlightBeams([${warn.beams.map(b => b.id).join(',')}])">Select Beams</button>` : ''}
                        </div>`;
                });
                html += `</div>`;
            }
            
            html += `
                        </div>
                        <div class="modal-footer">
                            ${!hasErrors && hasWarnings ? `<button class="btn-primary" onclick="closeValidationModal(); proceedWithSolve();">Proceed Anyway</button>` : ''}
                            ${hasErrors ? `<button class="btn-secondary" onclick="closeValidationModal()">Close & Fix Issues</button>` : ''}
                            ${!hasErrors && !hasWarnings ? `<button class="btn-primary" onclick="closeValidationModal()">OK</button>` : ''}
                            <button class="btn-secondary" onclick="closeValidationModal()">Cancel</button>
                        </div>
                    </div>
                </div>`;
            
            document.body.insertAdjacentHTML('beforeend', html);
        }
        
        function closeValidationModal(event) {
            if (event && event.target !== event.currentTarget) return;
            const modal = document.getElementById('validationModal');
            if (modal) modal.remove();
        }
        
        function selectAndHighlightNodes(nodeIds) {
            closeValidationModal();
            selectedNodes.clear();
            selectedElements.clear();
            nodeIds.forEach(id => selectedNodes.add(id));
            // updateUI() was called here but never existed anywhere in the app - clicking
            // "Select Nodes" in the validation modal threw before it could redraw.
            updateEntityInfoPanel();
            if (typeof secimVurgusunuTazele === 'function') secimVurgusunuTazele();
            else draw();
            showToast(`Selected ${nodeIds.length} floating node(s)`, 'info');
        }
        
        function selectAndHighlightBeams(beamIds) {
            closeValidationModal();
            selectedNodes.clear();
            selectedElements.clear();
            beamIds.forEach(id => selectedElements.add(id));
            updateEntityInfoPanel();
            // Gorunus her zaman Three.js; draw() yalnizca gizli 2B tuvali
            // ciziyordu, secim ekranda gorunmuyordu.
            if (typeof secimVurgusunuTazele === 'function') secimVurgusunuTazele();
            else draw();
            showToast(`Selected ${beamIds.length} beam(s)`, 'info');
        }
        
        // Manual validation check
        function runValidation() {
            if (Object.keys(model.nodes).length === 0) {
                showToast('No model to validate', 'warning');
                return;
            }
            
            const issues = validateModel();
            
            // Update validation summary in Model tab
            updateValidationSummary(issues);
            
            if (issues.errors.length === 0 && issues.warnings.length === 0) {
                showToast('<span class="icon"><svg viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg></span> Model validation passed!', 'success');
                
                // Update validate button appearance
                const btn = document.getElementById('validateBtn');
                if (btn) {
                    btn.style.background = 'var(--success)';
                    btn.style.color = 'white';
                    btn.innerHTML = '<span class="icon"><svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg></span> OK';
                    setTimeout(() => {
                        btn.style.background = '';
                        btn.style.color = '';
                        btn.innerHTML = '<span class="icon"><svg viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg></span> Check';
                    }, 2000);
                }
            } else {
                showValidationModal(issues);
            }
        }
        
        function updateValidationSummary(issues) {
            const container = document.getElementById('validationSummary');
            if (!container) return;
            
            const errorCount = issues.errors.length;
            const warnCount = issues.warnings.length;
            
            if (errorCount === 0 && warnCount === 0) {
                container.innerHTML = `
                    <div style="background:#052e16; border:1px solid var(--success); border-radius:var(--r-ctl); padding:12px; text-align:center;">
                        <div style="color:var(--success); font-size:var(--fs-lg); margin-bottom:4px;"><span class="icon"><svg viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg></span></div>
                        <div style="color:var(--success); font-weight:600;">Model OK</div>
                        <div style="color:var(--success); font-size:var(--fs-sm);">No issues found</div>
                    </div>
                `;
            } else {
                let html = '';
                
                if (errorCount > 0) {
                    html += `
                        <div style="background:#450a0a; border:1px solid var(--danger); border-radius:var(--r-ctl); padding:8px; margin-bottom:8px;">
                            <div style="color:var(--danger-text); font-weight:600; font-size:var(--fs-md);"><span class="icon"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg></span> ${errorCount} Error${errorCount > 1 ? 's' : ''}</div>
                            <div style="color:var(--danger-text); font-size:var(--fs-sm); margin-top:4px;">
                                ${issues.errors.map(e => e.title).join(', ')}
                            </div>
                        </div>
                    `;
                }
                
                if (warnCount > 0) {
                    html += `
                        <div style="background:#451a03; border:1px solid var(--warning); border-radius:var(--r-ctl); padding:8px;">
                            <div style="color:var(--warning); font-weight:600; font-size:var(--fs-md);"><span class="icon"><svg viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></span> ${warnCount} Warning${warnCount > 1 ? 's' : ''}</div>
                            <div style="color:var(--warning); font-size:var(--fs-sm); margin-top:4px;">
                                ${issues.warnings.map(w => w.title).join(', ')}
                            </div>
                        </div>
                    `;
                }
                
                container.innerHTML = html;
            }
        }
        
