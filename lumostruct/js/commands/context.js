        // ============== CONTEXT MENU FUNCTIONS ==============
        
        // Context target for right-click actions
        let ctxTarget = { type: null, elemId: null, nodeId: null, t: 0, x: 0, y: 0 };
        
        function showContextMenuAt(menuId, x, y) {
            hideAllContextMenus();
            const menu = document.getElementById(menuId);
            if (menu) {
                // First show to get dimensions
                menu.style.visibility = 'hidden';
                menu.style.display = 'block';
                
                const menuWidth = menu.offsetWidth;
                const menuHeight = menu.offsetHeight;
                const windowWidth = window.innerWidth;
                const windowHeight = window.innerHeight;
                
                // Adjust position to stay within screen bounds
                let finalX = x;
                let finalY = y;
                
                // Check right edge
                if (x + menuWidth > windowWidth - 10) {
                    finalX = windowWidth - menuWidth - 10;
                }
                
                // Check bottom edge
                if (y + menuHeight > windowHeight - 10) {
                    finalY = windowHeight - menuHeight - 10;
                }
                
                // Ensure not negative
                finalX = Math.max(10, finalX);
                finalY = Math.max(10, finalY);
                
                menu.style.left = finalX + 'px';
                menu.style.top = finalY + 'px';
                menu.style.visibility = 'visible';
            }
        }
        
        function hideAllContextMenus() {
            document.querySelectorAll('.context-menu').forEach(m => m.style.display = 'none');
        }
        
        function hideContextMenu() {
            hideAllContextMenus();
        }
        
        // Beam context menu actions
        
        // Select beam and show in Entity Info panel
        function ctxSelectFocus() {
            hideAllContextMenus();
            if (ctxTarget.elemId !== null) {
                // Clear previous selection and select this beam
                selectedNodes.clear();
                selectedElements.clear();
                selectedElements.add(ctxTarget.elemId);
                
                // Update Entity Info panel
                updateEntityInfoPanel();
                
                // If in Results tab, show element results
                // Tek panel: sonuc gecerliyse (sekme kavrami yok) ayrinti goster
                const activeTab = document.querySelector('.main-tab.active');
                if ((document.body.classList.contains('tek-panel') ? showResultsVisualization : (activeTab && activeTab.textContent.includes('Results'))) && results) {
                    showElementResultsDetail(ctxTarget.elemId);
                }
                
                if (currentViewMode === '3d') update3DScene();
                else draw();
                
                showToast(`Beam #${ctxTarget.elemId} selected`);
            }
        }
        
        // View beam details - shows in appropriate panel based on current tab
        function ctxViewDetails() {
            hideAllContextMenus();
            if (ctxTarget.elemId !== null) {
                // Select the element first
                selectedNodes.clear();
                selectedElements.clear();
                selectedElements.add(ctxTarget.elemId);
                
                const activeTab = document.querySelector('.main-tab.active');
                const isResultsTab = document.body.classList.contains('tek-panel') ? !!showResultsVisualization : (activeTab && activeTab.textContent.includes('Results'));
                
                if (isResultsTab && results && results.elementResults) {
                    // Show results detail
                    showElementResultsDetail(ctxTarget.elemId);
                    showToast(`Showing results for Beam #${ctxTarget.elemId}`);
                } else {
                    // Switch to Geometry tab and show in tree/properties
                    const geoTab = document.querySelector('.main-tab[onclick*="geometry"]');
                    if (geoTab) geoTab.click();
                    
                    // Update Entity Info panel
                    updateEntityInfoPanel();
                    
                    // Scroll tree to element if exists
                    scrollTreeToElement(ctxTarget.elemId);
                    showToast(`Beam #${ctxTarget.elemId} - see Entity Info panel`);
                }
                
                if (currentViewMode === '3d') update3DScene();
                else draw();
            }
        }
        
        // Show element results in detail
        function showElementResultsDetail(elemId) {
            if (!results || !results.elementResults) return;
            
            const elemResult = results.elementResults[elemId];
            const elem = model.elements[elemId];
            if (!elemResult || !elem) return;
            
            // Get section info
            const sec = SECTIONS[elem.section];
            const sigmaLimit = parseFloat(document.getElementById('sigmaLimit')?.value) || 355;
            
            // Calculate utilization
            const utilization = elemResult.vonMises ? (elemResult.vonMises / sigmaLimit * 100) : 0;
            
            // Create detailed results popup/modal
            const detailHtml = `
                <div style="padding:16px;">
                    <h3 style="color:var(--warning); margin-bottom:16px;"><span class="icon"><svg viewBox="0 0 24 24"><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/></svg></span> Beam #${elemId} Results</h3>
                    
                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:16px;">
                        <div style="background:var(--bg-main); padding:12px; border-radius:var(--r-ovl);">
                            <div style="color:var(--text-3); font-size:var(--fs-sm); margin-bottom:4px;">Normal Stress (σ)</div>
                            <div style="color:var(--accent-info); font-size:var(--fs-lg); font-weight:600;">${elemResult.maxStress?.toFixed(1) || '-'} MPa</div>
                        </div>
                        <div style="background:var(--bg-main); padding:12px; border-radius:var(--r-ovl);">
                            <div style="color:var(--text-3); font-size:var(--fs-sm); margin-bottom:4px;">Shear Stress (τ)</div>
                            <div style="color:#22d3ee; font-size:var(--fs-lg); font-weight:600;">${elemResult.shearStress?.toFixed(1) || '-'} MPa</div>
                        </div>
                        <div style="background:var(--bg-main); padding:12px; border-radius:var(--r-ovl);">
                            <div style="color:var(--text-3); font-size:var(--fs-sm); margin-bottom:4px;">Von Mises (σ_vm)</div>
                            <div style="color:var(--accent-info); font-size:var(--fs-lg); font-weight:600;">${elemResult.vonMises?.toFixed(1) || '-'} MPa</div>
                        </div>
                        <div style="background:var(--bg-main); padding:12px; border-radius:var(--r-ovl);">
                            <div style="color:var(--text-3); font-size:var(--fs-sm); margin-bottom:4px;">Utilization</div>
                            <div style="color:${utilization > 100 ? 'var(--danger-text)' : utilization > 80 ? 'var(--warning)' : 'var(--success)'}; font-size:var(--fs-lg); font-weight:600;">${utilization.toFixed(1)}%</div>
                        </div>
                    </div>
                    
                    <div style="margin-top:16px; background:var(--bg-main); padding:12px; border-radius:var(--r-ovl);">
                        <div style="color:var(--text-3); font-size:var(--fs-sm); margin-bottom:8px;">Internal Forces</div>
                        <div style="display:flex; gap:16px; flex-wrap:wrap;">
                            <span style="color:var(--text-2);">M_max: <b style="color:var(--accent-info);">${elemResult.maxMoment?.toFixed(2) || '-'} kN·m</b></span>
                            <span style="color:var(--text-2);">V_max: <b style="color:#22d3ee;">${elemResult.maxShear?.toFixed(2) || '-'} kN</b></span>
                            <span style="color:var(--text-2);">N: <b style="color:var(--warning);">${elemResult.axialForce?.toFixed(2) || '-'} kN</b></span>
                        </div>
                    </div>
                    
                    <div style="margin-top:16px; padding:8px; border:1px solid ${utilization > 100 ? 'var(--danger)' : 'var(--success)'}; border-radius:var(--r-ovl); text-align:center;">
                        <span style="color:${utilization > 100 ? 'var(--danger-text)' : 'var(--success)'}; font-weight:600;">
                            ${utilization > 100 ? '<span class="icon"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg></span> OVERSTRESSED' : '<span class="icon"><svg viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg></span> OK'}
                        </span>
                    </div>
                </div>
            `;
            
            // Show in a modal or toast
            showResultsModal(detailHtml);
        }
        
        // Show results in a modal
        function showResultsModal(content) {
            // Remove existing modal
            const existingModal = document.getElementById('resultsDetailModal');
            if (existingModal) existingModal.remove();
            
            const modal = document.createElement('div');
            modal.id = 'resultsDetailModal';
            modal.style.cssText = `
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: var(--bg-panel);
                border: 1px solid var(--border);
                border-radius:var(--r-ovl);
                box-shadow: 0 20px 60px rgba(0,0,0,0.5);
                z-index: 10001;
                min-width: 400px;
                max-width: 500px;
            `;
            modal.innerHTML = `
                <div style="display:flex; justify-content:flex-end; padding:8px 8px 0;">
                    <button onclick="this.parentElement.parentElement.remove()" style="background:none; border:none; color:var(--text-3); cursor:pointer; font-size:var(--fs-lg);"><span class="icon"><svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></span></button>
                </div>
                ${content}
            `;
            document.body.appendChild(modal);
            
            // Close on outside click
            setTimeout(() => {
                document.addEventListener('click', function closeModal(e) {
                    if (!modal.contains(e.target)) {
                        modal.remove();
                        document.removeEventListener('click', closeModal);
                    }
                });
            }, 100);
        }
        
        // Scroll tree to show element
        function scrollTreeToElement(elemId) {
            const treeItem = document.querySelector(`[data-elem-id="${elemId}"]`);
            if (treeItem) {
                treeItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
                treeItem.style.background = 'var(--warning)';
                setTimeout(() => treeItem.style.background = '', 1500);
            }
        }
        
        // Node context menu - Select and Focus
        function ctxNodeSelectFocus() {
            hideAllContextMenus();
            if (ctxTarget.nodeId !== null) {
                selectedNodes.clear();
                selectedElements.clear();
                selectedNodes.add(ctxTarget.nodeId);
                
                updateEntityInfoPanel();
                
                if (currentViewMode === '3d') update3DScene();
                else draw();
                
                showToast(`Node #${ctxTarget.nodeId} selected`);
            }
        }
        
        // Node context menu - View Details
        function ctxNodeViewDetails() {
            hideAllContextMenus();
            if (ctxTarget.nodeId !== null) {
                selectedNodes.clear();
                selectedElements.clear();
                selectedNodes.add(ctxTarget.nodeId);
                
                const activeTab = document.querySelector('.main-tab.active');
                const isResultsTab = document.body.classList.contains('tek-panel') ? !!showResultsVisualization : (activeTab && activeTab.textContent.includes('Results'));
                
                if (isResultsTab && results && results.displacements) {
                    showNodeResultsDetail(ctxTarget.nodeId);
                    showToast(`Showing results for Node #${ctxTarget.nodeId}`);
                } else {
                    const geoTab = document.querySelector('.main-tab[onclick*="geometry"]');
                    if (geoTab) geoTab.click();
                    updateEntityInfoPanel();
                    showToast(`Node #${ctxTarget.nodeId} - see Entity Info panel`);
                }
                
                if (currentViewMode === '3d') update3DScene();
                else draw();
            }
        }
        
        // Show node results in detail
        function showNodeResultsDetail(nodeId) {
            if (!results || !results.displacements) return;
            
            const node = model.nodes[nodeId];
            if (!node) return;
            
            // Get displacement for this node
            const dofStart = (nodeId - 1) * 6;  // Assuming 6 DOF per node
            const disp = results.displacements;
            
            const uz = disp[dofStart + 2] !== undefined ? disp[dofStart + 2] * 1000 : null;
            const rx = disp[dofStart + 3] !== undefined ? disp[dofStart + 3] * (180/Math.PI) * 1000 : null;
            const ry = disp[dofStart + 4] !== undefined ? disp[dofStart + 4] * (180/Math.PI) * 1000 : null;
            
            // Check for reactions
            const bc = model.constraints[nodeId];
            const hasReaction = bc && (bc.Uz || bc.Ux || bc.Uy);
            
            const detailHtml = `
                <div style="padding:16px;">
                    <h3 style="color:var(--success); margin-bottom:16px;"><span class="icon"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg></span> Node #${nodeId} Results</h3>
                    
                    <div style="background:var(--bg-main); padding:12px; border-radius:var(--r-ovl); margin-bottom:8px;">
                        <div style="color:var(--text-3); font-size:var(--fs-sm); margin-bottom:4px;">Position</div>
                        <div style="color:var(--text-2);">
                            X: <b>${(node.x * 1000).toFixed(0)}</b> mm, 
                            Y: <b>${(node.y * 1000).toFixed(0)}</b> mm
                        </div>
                    </div>
                    
                    <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:8px;">
                        <div style="background:var(--bg-main); padding:12px; border-radius:var(--r-ovl); text-align:center;">
                            <div style="color:var(--text-3); font-size:var(--fs-sm);">Uz</div>
                            <div style="color:var(--accent-info); font-size:var(--fs-lg); font-weight:600;">${uz !== null ? uz.toFixed(3) : '-'} mm</div>
                        </div>
                        <div style="background:var(--bg-main); padding:12px; border-radius:var(--r-ovl); text-align:center;">
                            <div style="color:var(--text-3); font-size:var(--fs-sm);">θx</div>
                            <div style="color:var(--accent-info); font-size:var(--fs-lg); font-weight:600;">${rx !== null ? rx.toFixed(3) : '-'} mrad</div>
                        </div>
                        <div style="background:var(--bg-main); padding:12px; border-radius:var(--r-ovl); text-align:center;">
                            <div style="color:var(--text-3); font-size:var(--fs-sm);">θy</div>
                            <div style="color:var(--accent-info); font-size:var(--fs-lg); font-weight:600;">${ry !== null ? ry.toFixed(3) : '-'} mrad</div>
                        </div>
                    </div>
                    
                    ${hasReaction ? `
                    <div style="margin-top:16px; background:rgba(34,197,94,0.1); border:1px solid rgba(34,197,94,0.3); padding:12px; border-radius:var(--r-ovl);">
                        <div style="color:var(--success); font-weight:600; margin-bottom:4px;"><span class="icon"><svg viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></span> Support Reaction</div>
                        <div style="color:var(--text-2); font-size:var(--fs-md);">This node has boundary conditions applied.</div>
                    </div>
                    ` : ''}
                </div>
            `;
            
            showResultsModal(detailHtml);
        }
        
        // Node - Add Boundary Condition shortcut
        function ctxNodeAddBC() {
            hideAllContextMenus();
            if (ctxTarget.nodeId !== null) {
                selectedNodes.clear();
                selectedElements.clear();
                selectedNodes.add(ctxTarget.nodeId);
                
                // Go to Geometry tab
                const geoTab = document.querySelector('.main-tab[onclick*="geometry"]');
                if (geoTab) geoTab.click();
                
                updateEntityInfoPanel();
                showToast(`Select boundary condition for Node #${ctxTarget.nodeId}`);
                
                if (currentViewMode === '3d') update3DScene();
                else draw();
            }
        }
        
        // Node - Add Load shortcut
        function ctxNodeAddLoad() {
            hideAllContextMenus();
            if (ctxTarget.nodeId !== null) {
                selectedNodes.clear();
                selectedElements.clear();
                selectedNodes.add(ctxTarget.nodeId);
                
                // Go to Loads tab
                const loadsTab = document.querySelector('.main-tab[onclick*="loads"]');
                if (loadsTab) loadsTab.click();
                
                updateEntityInfoPanel();
                showToast(`Add load to Node #${ctxTarget.nodeId}`);
                
                if (currentViewMode === '3d') update3DScene();
                else draw();
            }
        }
        
        function ctxSplit() {
            hideAllContextMenus();
            if (ctxTarget.elemId !== null && ctxTarget.t > 0 && ctxTarget.t < 1) {
                saveState();
                // Direct split using ctxTarget info
                const beam = model.elements[ctxTarget.elemId];
                if (beam) {
                    const n1 = model.nodes[beam.n1], n2 = model.nodes[beam.n2];
                    const splitX = n1.x + (n2.x - n1.x) * ctxTarget.t;
                    const splitY = n1.y + (n2.y - n1.y) * ctxTarget.t;
                    
                    const newNodeId = nextNodeId++;
                    model.nodes[newNodeId] = { x: splitX, y: splitY };
                    
                    const section = beam.section;
                    const origN1 = beam.n1, origN2 = beam.n2;
                    delete model.elements[ctxTarget.elemId];
                    
                    const id1 = nextElementId++;
                    model.elements[id1] = { n1: origN1, n2: newNodeId, section };
                    const id2 = nextElementId++;
                    model.elements[id2] = { n1: newNodeId, n2: origN2, section };
                    
                    showToast(`Split at ${(ctxTarget.t * 100).toFixed(0)}%`);
                    if (currentViewMode === '3d') update3DScene();
                    else draw();
                    updatePropertiesPanel();
                }
            }
        }
        
        function ctxSplitMid() {
            hideAllContextMenus();
            if (ctxTarget.elemId !== null) {
                saveState();
                const beam = model.elements[ctxTarget.elemId];
                if (beam) {
                    const n1 = model.nodes[beam.n1], n2 = model.nodes[beam.n2];
                    const midX = (n1.x + n2.x) / 2, midY = (n1.y + n2.y) / 2;
                    
                    const newNodeId = nextNodeId++;
                    model.nodes[newNodeId] = { x: midX, y: midY };
                    
                    const section = beam.section;
                    const origN1 = beam.n1, origN2 = beam.n2;
                    delete model.elements[ctxTarget.elemId];
                    
                    const id1 = nextElementId++;
                    model.elements[id1] = { n1: origN1, n2: newNodeId, section };
                    const id2 = nextElementId++;
                    model.elements[id2] = { n1: newNodeId, n2: origN2, section };
                    
                    showToast('Split at 50%');
                    if (currentViewMode === '3d') update3DScene();
                    else draw();
                    updatePropertiesPanel();
                }
            }
        }
        
        function ctxOffset() {
            hideAllContextMenus();
            if (ctxTarget.elemId !== null) {
                clearSelection();
                selectedElements.add(ctxTarget.elemId);
                if (currentViewMode === '3d') update3DScene();
                else draw();
                startCommand('OFFSET');
            }
        }
        
        // Show the selected beam's plane in 2D and start a work plane there.
        function ctxShowIn2DTop() {
            hideAllContextMenus();
            if (ctxTarget.elemId === null) return;
            const elem = model.elements[ctxTarget.elemId];
            if (!elem) return;
            const n1 = model.nodes[elem.n1];
            if (!n1) return;
            setWorkPlane('Z', n1.z || 0);  // XY plane (top)
        }
        
        function ctxShowIn2DElevation() {
            hideAllContextMenus();
            if (ctxTarget.elemId === null) return;
            const elem = model.elements[ctxTarget.elemId];
            if (!elem) return;
            const n1 = model.nodes[elem.n1], n2 = model.nodes[elem.n2];
            if (!n1 || !n2) return;
            const dx = Math.abs(n2.x - n1.x), dy = Math.abs(n2.y - n1.y);
            // Beam along X (dy≈0) → XZ plane (normal Y); beam along Y → YZ (normal X)
            if (dy < dx) setWorkPlane('Y', n1.y);   // XZ (front) at Y = beam's Y
            else setWorkPlane('X', n1.x);            // YZ (side) at X = beam's X
        }
        
        function ctxJoin() {
            hideAllContextMenus();
            if (ctxTarget.elemId !== null) {
                clearSelection();
                selectedElements.add(ctxTarget.elemId);
                if (currentViewMode === '3d') update3DScene();
                else draw();
                startCommand('JOIN');
            }
        }
        
        function ctxCopy() {
            hideAllContextMenus();
            if (ctxTarget.elemId !== null) {
                clearSelection();
                selectedElements.add(ctxTarget.elemId);
                if (currentViewMode === '3d') update3DScene();
                else draw();
                startCommand('COPY');
            }
        }
        
        function ctxMove() {
            hideAllContextMenus();
            if (ctxTarget.elemId !== null) {
                clearSelection();
                selectedElements.add(ctxTarget.elemId);
                if (currentViewMode === '3d') update3DScene();
                else draw();
                startCommand('MOVE');
            }
        }
        
        function ctxDelete() {
            hideAllContextMenus();
            if (ctxTarget.elemId !== null) {
                saveState();
                delete model.elements[ctxTarget.elemId];
                showToast('Deleted');
                if (currentViewMode === '3d') update3DScene();
                else draw();
                updatePropertiesPanel();
            }
        }
        
        // Node context menu actions
        function ctxNodeMove() {
            hideAllContextMenus();
            if (ctxTarget.nodeId !== null) {
                const node = model.nodes[ctxTarget.nodeId];
                if (node) {
                    cmdState.active = CMD.NODE_MOVE;
                    cmdState.selectedNode = ctxTarget.nodeId;
                    cmdState.basePoint = { x: node.x, y: node.y };
                    showToast(`Node #${ctxTarget.nodeId}: Drag or type X,Y (mm)`);
                    updateCommandUI();
                }
            }
        }
        
        function ctxNodeCoords() {
            hideAllContextMenus();
            if (ctxTarget.nodeId !== null) {
                const node = model.nodes[ctxTarget.nodeId];
                if (node) {
                    const input = prompt(`Node #${ctxTarget.nodeId}\nFormat: X,Y (mm)`, `${(node.x*1000).toFixed(0)},${(node.y*1000).toFixed(0)}`);
                    if (input) {
                        const parts = input.split(',');
                        if (parts.length >= 2) {
                            saveState();
                            node.x = parseFloat(parts[0]) / 1000 || node.x;
                            node.y = parseFloat(parts[1]) / 1000 || node.y;
                            if (currentViewMode === '3d') update3DScene();
                            else draw();
                            showToast(`Node → X:${(node.x*1000).toFixed(0)} Y:${(node.y*1000).toFixed(0)}`);
                        }
                    }
                }
            }
        }
        
        function ctxNodeMerge() {
            hideAllContextMenus();
            if (ctxTarget.nodeId === null) return;
            const node = model.nodes[ctxTarget.nodeId];
            if (!node) return;
            
            const tolerance = 0.05; // 50mm
            const nearby = [];
            
            Object.entries(model.nodes).forEach(([id, n]) => {
                if (+id === ctxTarget.nodeId) return;
                const dist = Math.sqrt((n.x - node.x)**2 + (n.y - node.y)**2);
                if (dist < tolerance) nearby.push(+id);
            });
            
            if (nearby.length === 0) {
                showToast('No nearby nodes (within 50mm)', 'warning');
                return;
            }
            
            saveState();
            nearby.forEach(id => {
                Object.values(model.elements).forEach(e => {
                    if (e.n1 === id) e.n1 = ctxTarget.nodeId;
                    if (e.n2 === id) e.n2 = ctxTarget.nodeId;
                });
                delete model.nodes[id];
            });
            
            if (currentViewMode === '3d') update3DScene();
            else draw();
            showToast(`Merged ${nearby.length} node(s)`);
        }
        
