        // ============== BEAM DETAIL MODAL ==============
        let currentBeamDetailId = null;
        let currentBeamDiagramType = 'moment';
        
        function openBeamDetailModal(elemId) {
            const elem = model.elements[elemId];
            if (!elem) return;
            
            currentBeamDetailId = elemId;
            currentBeamDiagramType = 'moment';
            
            // Update tabs
            document.querySelectorAll('.beam-diagram-tab').forEach(t => t.classList.remove('active'));
            document.querySelector('.beam-diagram-tab')?.classList.add('active');
            
            // Show modal
            document.getElementById('beamDetailModal').classList.add('active');
            document.body.style.overflow = 'hidden';
            
            // Populate data
            updateBeamDetailModal();
        }
        
        function closeBeamDetailModal(event) {
            if (event && event.target !== event.currentTarget) return;
            document.getElementById('beamDetailModal').classList.remove('active');
            document.body.style.overflow = '';
        }
        
        function updateBeamDetailModal() {
            if (currentBeamDetailId == null) return;   // 0 gecerli bir kimlik, falsy degil
            
            const elem = model.elements[currentBeamDetailId];
            if (!elem) return;
            
            const n1 = model.nodes[elem.n1];
            const n2 = model.nodes[elem.n2];
            if (!n1 || !n2) return;
            
            const length = Math.sqrt((n2.x - n1.x)**2 + (n2.y - n1.y)**2);
            const sigmaLimit = parseFloat(document.getElementById('sigmaLimit')?.value) || 355;
            
            // Header info
            document.getElementById('beamDetailTitle').textContent = `Beam detail \u2014 element ${currentBeamDetailId}`;
            document.getElementById('beamDetailSection').textContent = elem.section || '-';
            document.getElementById('beamDetailLength').textContent = length.toFixed(3) + ' m';
            
            // Results if available
            if (results && results.elementResults && results.elementResults[currentBeamDetailId]) {
                const r = results.elementResults[currentBeamDetailId];
                const util = (r.vonMises / sigmaLimit * 100);
                
                document.getElementById('beamDetailStress').textContent = r.vonMises.toFixed(1) + ' MPa';
                
                const utilEl = document.getElementById('beamDetailUtil');
                utilEl.textContent = util.toFixed(1) + '%';
                utilEl.style.color = util > 100 ? 'var(--danger)' : (util > 80 ? 'var(--warning)' : 'var(--success)');
            } else {
                document.getElementById('beamDetailStress').textContent = '-';
                document.getElementById('beamDetailUtil').textContent = '-';
            }
            
            // Draw diagram
            redrawBeamDetailDiagram();
            
            // Populate values table
            updateBeamDetailValuesTable();
        }
        
        function switchBeamDiagramTab(type) {
            currentBeamDiagramType = type;
            
            // Update tabs
            // Aktif sekme ARGUMANDAN bulunur. Eskiden ortuk global `event`ten
            // geliyordu: programatik cagride tanimsiz, ayrica dugmenin icinde bir
            // ikon olsaydi `event.target` dugme degil ikon olurdu.
            document.querySelectorAll('.beam-diagram-tab').forEach(t => {
                t.classList.toggle('active', t.dataset.diagram === type);
            });
            
            redrawBeamDetailDiagram();
        }
        
        function redrawBeamDetailDiagram() {
            if (currentBeamDetailId == null) return;   // 0 gecerli bir kimlik, falsy degil
            
            const svg = document.getElementById('beamDetailSvg');
            const container = document.getElementById('beamDiagramContainer');
            const whiteBg = document.getElementById('beamDetailWhiteBg')?.checked;
            
            if (whiteBg) {
                container.style.background = '#ffffff';
            } else {
                container.style.background = 'var(--bg-elev)';
            }
            
            const elem = model.elements[currentBeamDetailId];
            if (!elem) return;
            
            const n1 = model.nodes[elem.n1];
            const n2 = model.nodes[elem.n2];
            if (!n1 || !n2) return;
            
            const length = Math.sqrt((n2.x - n1.x)**2 + (n2.y - n1.y)**2);
            
            // SVG dimensions
            const svgW = 850;
            const svgH = 265;   // deger tablosu da katlanmadan sigsin diye
            const margin = { left: 60, right: 40, top: 40, bottom: 60 };
            const plotW = svgW - margin.left - margin.right;
            const plotH = svgH - margin.top - margin.bottom;
            
            // Colors
            const textColor = whiteBg ? '#1f2937' : 'var(--text-2)';
            const axisColor = whiteBg ? '#374151' : 'var(--text-3)';
            const gridColor = whiteBg ? '#e5e7eb' : '#334155';
            const beamColor = whiteBg ? '#1f2937' : 'var(--primary)';
            
            let diagramColor, fillColor, title, unit;
            switch (currentBeamDiagramType) {
                case 'moment':
                    diagramColor = 'var(--primary)';
                    fillColor = 'rgba(59, 130, 246, 0.3)';
                    title = 'Bending Moment Diagram';
                    unit = 'kNm';
                    break;
                case 'shear':
                    diagramColor = 'var(--success)';
                    fillColor = 'rgba(34, 197, 94, 0.3)';
                    title = 'Shear Force Diagram';
                    unit = 'kN';
                    break;
                case 'deflection':
                    diagramColor = 'var(--warning)';
                    fillColor = 'rgba(245, 158, 11, 0.3)';
                    title = 'Deflection Diagram';
                    unit = 'mm';
                    break;
                case 'stress':
                    diagramColor = 'var(--danger)';
                    fillColor = 'rgba(239, 68, 68, 0.3)';
                    title = 'Stress Distribution';
                    unit = 'MPa';
                    break;
            }
            
            // Eleman boyunca degerler. Cozucu 21 noktali GERCEK egriyi veriyor
            // (diagram.x / .M / .V / .d / .s). Burada eskiden ayni egriler uc
            // degerlerden uyduruluyordu: moment dogrusal + parabol duzeltmesi,
            // sehim `maxDef * 4t(1-t)`, gerilme `sigma * |sin(pi t)|`. Ucu de
            // yanlis sekilliydi - kismi yukun kirigini, isaret degistiren momenti
            // ve konsolun uctaki sehim tepesini temsil edemiyorlardi.
            const rEl = (results && results.elementResults)
                      ? results.elementResults[currentBeamDetailId] : null;
            const dg = rEl && rEl.diagram;
            const seri = dg ? ({
                moment: dg.M,
                shear: dg.V,
                deflection: dg.d,
                stress: dg.s
            })[currentBeamDiagramType] : null;

            const numPoints = seri ? seri.length : 21;
            const values = [];
            const positions = [];
            for (let i = 0; i < numPoints; i++) {
                positions.push(dg && dg.x ? dg.x[i] : (i / (numPoints - 1)) * length);
                values.push(seri ? seri[i] : 0);
            }
            
            // Find max absolute value for scaling
            const maxAbsVal = Math.max(0.1, ...values.map(v => Math.abs(v)));
            
            // Scale functions
            const xScale = (x) => margin.left + (x / length) * plotW;
            const yScale = (v) => margin.top + plotH / 2 - (v / maxAbsVal) * (plotH / 2 - 20);
            
            // Build SVG
            let svgContent = `
                <!-- Background -->
                <rect width="100%" height="100%" fill="${whiteBg ? '#ffffff' : 'transparent'}"/>
                
                <!-- Title -->
                <text x="${svgW / 2}" y="25" text-anchor="middle" fill="${textColor}" font-size="14" font-weight="bold">${title}</text>
                
                <!-- Grid -->
                <line x1="${margin.left}" y1="${margin.top + plotH / 2}" x2="${margin.left + plotW}" y2="${margin.top + plotH / 2}" stroke="${axisColor}" stroke-width="1"/>
            `;
            
            // Vertical grid lines
            for (let i = 0; i <= 10; i++) {
                const x = margin.left + (i / 10) * plotW;
                svgContent += `<line x1="${x}" y1="${margin.top}" x2="${x}" y2="${margin.top + plotH}" stroke="${gridColor}" stroke-width="0.5" stroke-dasharray="3,3"/>`;
                svgContent += `<text x="${x}" y="${svgH - 15}" text-anchor="middle" fill="${textColor}" font-size="10">${(i / 10 * length).toFixed(2)}</text>`;
            }
            
            // X-axis label
            svgContent += `<text x="${svgW / 2}" y="${svgH - 2}" text-anchor="middle" fill="${textColor}" font-size="10">Position (m)</text>`;
            
            // Y-axis labels
            svgContent += `<text x="15" y="${margin.top + plotH / 2}" text-anchor="middle" fill="${textColor}" font-size="10" transform="rotate(-90, 15, ${margin.top + plotH / 2})">${unit}</text>`;
            svgContent += `<text x="${margin.left - 10}" y="${margin.top + 5}" text-anchor="end" fill="${textColor}" font-size="10">+${maxAbsVal.toFixed(1)}</text>`;
            svgContent += `<text x="${margin.left - 10}" y="${margin.top + plotH}" text-anchor="end" fill="${textColor}" font-size="10">-${maxAbsVal.toFixed(1)}</text>`;
            
            // Beam representation
            svgContent += `<line x1="${margin.left}" y1="${margin.top + plotH / 2}" x2="${margin.left + plotW}" y2="${margin.top + plotH / 2}" stroke="${beamColor}" stroke-width="4"/>`;
            
            // Support symbols
            svgContent += `
                <polygon points="${margin.left - 8},${margin.top + plotH / 2 + 5} ${margin.left},${margin.top + plotH / 2} ${margin.left + 8},${margin.top + plotH / 2 + 5}" fill="${beamColor}" stroke="${beamColor}"/>
                <polygon points="${margin.left + plotW - 8},${margin.top + plotH / 2 + 5} ${margin.left + plotW},${margin.top + plotH / 2} ${margin.left + plotW + 8},${margin.top + plotH / 2 + 5}" fill="none" stroke="${beamColor}" stroke-width="2"/>
            `;
            
            // Node labels
            svgContent += `<text x="${margin.left}" y="${margin.top + plotH / 2 + 25}" text-anchor="middle" fill="${textColor}" font-size="10">N${elem.n1}</text>`;
            svgContent += `<text x="${margin.left + plotW}" y="${margin.top + plotH / 2 + 25}" text-anchor="middle" fill="${textColor}" font-size="10">N${elem.n2}</text>`;
            
            // Diagram path
            let pathD = `M ${xScale(positions[0])} ${yScale(values[0])}`;
            for (let i = 1; i < positions.length; i++) {
                pathD += ` L ${xScale(positions[i])} ${yScale(values[i])}`;
            }
            
            // Fill path (closed to baseline)
            const fillPathD = pathD + ` L ${xScale(positions[positions.length - 1])} ${yScale(0)} L ${xScale(positions[0])} ${yScale(0)} Z`;
            svgContent += `<path d="${fillPathD}" fill="${fillColor}" stroke="none"/>`;
            svgContent += `<path d="${pathD}" fill="none" stroke="${diagramColor}" stroke-width="2.5"/>`;
            
            // Value points
            for (let i = 0; i < positions.length; i += 5) {
                if (Math.abs(values[i]) > 0.01) {
                    svgContent += `<circle cx="${xScale(positions[i])}" cy="${yScale(values[i])}" r="4" fill="${diagramColor}"/>`;
                    svgContent += `<text x="${xScale(positions[i])}" y="${yScale(values[i]) - 8}" text-anchor="middle" fill="${diagramColor}" font-size="10" font-weight="bold">${values[i].toFixed(2)}</text>`;
                }
            }
            
            // Max/min annotation
            const maxIdx = values.indexOf(Math.max(...values));
            const minIdx = values.indexOf(Math.min(...values));
            
            if (Math.abs(values[maxIdx]) > 0.01) {
                svgContent += `<circle cx="${xScale(positions[maxIdx])}" cy="${yScale(values[maxIdx])}" r="6" fill="none" stroke="${diagramColor}" stroke-width="2"/>`;
            }
            
            svg.innerHTML = svgContent;
        }
        
        function updateBeamDetailValuesTable() {
            const tbody = document.getElementById('beamDetailValuesTable');
            if (!tbody || currentBeamDetailId == null) return;
            
            const elem = model.elements[currentBeamDetailId];
            if (!elem) return;
            
            const n1 = model.nodes[elem.n1];
            const n2 = model.nodes[elem.n2];
            if (!n1 || !n2) return;
            
            const length = Math.sqrt((n2.x - n1.x)**2 + (n2.y - n1.y)**2);
            
            // Tablo da ayni gercek egriyi okur. Onceden burada AYRI bir uydurma
            // vardi, yani tablodaki sayilar hemen ustundeki diyagramla bile ayni
            // kirisi anlatmiyordu.
            const rT = (results && results.elementResults)
                     ? results.elementResults[currentBeamDetailId] : null;
            const dgT = rT && rT.diagram;
            const positions = [0, 0.25, 0.5, 0.75, 1];
            let rows = '';

            positions.forEach((t) => {
                const x = t * length;
                const posLabel = t === 0 ? 'Start' : (t === 1 ? 'End' : (t === 0.5 ? 'Mid' : `${(t * 100).toFixed(0)}%`));

                let M = 0, V = 0, sigma = 0, tau = 0, delta = 0;

                if (dgT && dgT.M) {
                    const i = Math.round(t * (dgT.M.length - 1));
                    M = dgT.M[i];
                    V = dgT.V[i];
                    sigma = dgT.s ? dgT.s[i] : 0;
                    delta = dgT.d ? dgT.d[i] : 0;
                    tau = rT.tau || 0;   // kesme gerilmesi eleman geneli icin raporlanir
                }
                
                rows += `<tr>
                    <td>${posLabel}</td>
                    <td>${x.toFixed(3)}</td>
                    <td>${M.toFixed(2)}</td>
                    <td>${V.toFixed(2)}</td>
                    <td>${sigma.toFixed(1)}</td>
                    <td>${tau.toFixed(1)}</td>
                    <td>${delta.toFixed(2)}</td>
                </tr>`;
            });
            
            tbody.innerHTML = rows;
        }
        
        function openBeamDetailFromSelection() {
            if (selectedElements.size === 1) {
                const elemId = Array.from(selectedElements)[0];
                openBeamDetailModal(elemId);
            } else {
                showToast('Select exactly one beam to view details', 'warning');
            }
        }
        
        function exportBeamDiagram() {
            const svg = document.getElementById('beamDetailSvg');
            const svgData = new XMLSerializer().serializeToString(svg);
            const blob = new Blob([svgData], { type: 'image/svg+xml' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `beam_${currentBeamDetailId}_${currentBeamDiagramType}.svg`;
            a.click();
            URL.revokeObjectURL(url);
            showToast('Diagram exported as SVG');
        }
        
        // ============== UI HELPERS ==============
        function getElementAtPosition(mouseX, mouseY) {
            const tolerance = 10; // pixels
            
            for (const [id, elem] of Object.entries(model.elements)) {
                const n1 = model.nodes[elem.n1];
                const n2 = model.nodes[elem.n2];
                if (!n1 || !n2) continue;
                
                const p1 = worldToScreen(n1.x, n1.y);
                const p2 = worldToScreen(n2.x, n2.y);
                
                // Distance from point to line segment
                const dist = pointToLineDistance(mouseX, mouseY, p1.x, p1.y, p2.x, p2.y);
                if (dist < tolerance) {
                    return { ...elem, id: parseInt(id) };
                }
            }
            return null;
        }
        
        function getNodeAtPosition(mouseX, mouseY) {
            const tolerance = 12; // pixels
            
            for (const [id, node] of Object.entries(model.nodes)) {
                const p = worldToScreen(node.x, node.y);
                const dist = Math.sqrt((mouseX - p.x)**2 + (mouseY - p.y)**2);
                if (dist < tolerance) {
                    return { ...node, id: parseInt(id) };
                }
            }
            return null;
        }
        
        function drawSelectionBox() {
            if (!isBoxSelecting) return;
            
            const x = Math.min(boxStartX, boxEndX);
            const y = Math.min(boxStartY, boxEndY);
            const w = Math.abs(boxEndX - boxStartX);
            const h = Math.abs(boxEndY - boxStartY);
            
            ctx.strokeStyle = 'var(--warning)';
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
            ctx.strokeRect(x, y, w, h);
            ctx.setLineDash([]);
            
            ctx.fillStyle = 'rgba(245, 158, 11, 0.1)';
            ctx.fillRect(x, y, w, h);
        }
        
        function selectItemsInBox() {
            const x1 = Math.min(boxStartX, boxEndX);
            const y1 = Math.min(boxStartY, boxEndY);
            const x2 = Math.max(boxStartX, boxEndX);
            const y2 = Math.max(boxStartY, boxEndY);
            
            // Select elements
            Object.values(model.elements).forEach(elem => {
                const n1 = model.nodes[elem.n1];
                const n2 = model.nodes[elem.n2];
                if (!n1 || !n2) return;
                
                const p1 = worldToScreen(n1.x, n1.y);
                const p2 = worldToScreen(n2.x, n2.y);
                
                // Element midpoint in box
                const midX = (p1.x + p2.x) / 2;
                const midY = (p1.y + p2.y) / 2;
                
                if (midX >= x1 && midX <= x2 && midY >= y1 && midY <= y2) {
                    selectedElements.add(elem.id);
                }
            });
            
            // Select nodes
            Object.values(model.nodes).forEach(node => {
                const p = worldToScreen(node.x, node.y);
                if (p.x >= x1 && p.x <= x2 && p.y >= y1 && p.y <= y2) {
                    selectedNodes.add(node.id);
                }
            });
            
            // Update display
            if (selectedElements.size > 0 || selectedNodes.size > 0) {
                showMultiSelectionDetails();
                updateEntityInfoPanel();
            }
        }
        
        function showNodeDetails(node) {
            // Check existing loads on this node
            const existingLoads = model.loads.filter(l => l.nodeId === node.id);
            let existingFx = 0, existingFy = 0, existingFz = 0;
            let existingMx = 0, existingMy = 0, existingMz = 0;
            existingLoads.forEach(l => {
                existingFx += l.Fx || 0;
                existingFy += l.Fy || 0;
                existingFz += l.Fz || 0;
                existingMx += l.Mx || 0;
                existingMy += l.My || 0;
                existingMz += l.Mz || 0;
            });
            
            // Get current BC
            const bc = model.constraints[node.id] || {};
            const isFixed = typeof bc === 'string' ? bc === 'fixed' : false;
            const isPinned = typeof bc === 'string' ? (bc === 'pinned' || bc === 'simply_supported') : false;
            
            // Parse BC object or preset
            let bcUx = false, bcUy = false, bcUz = false, bcRx = false, bcRy = false, bcRz = false;
            if (typeof bc === 'object' && bc !== null) {
                bcUx = bc.Ux || false;
                bcUy = bc.Uy || false;
                bcUz = bc.Uz || false;
                bcRx = bc.Rx || false;
                bcRy = bc.Ry || false;
                bcRz = bc.Rz || false;
            } else if (bc === 'fixed') {
                bcUx = bcUy = bcUz = bcRx = bcRy = bcRz = true;
            } else if (bc === 'pinned') {
                bcUx = bcUy = bcUz = true;
            } else if (bc === 'simply_supported') {
                bcUz = true;
            }
            
            let detailsHtml = `
                <div style="background:#1e3a5f; padding:12px; border-radius:var(--r-ovl); margin-bottom:16px; border-left:4px solid var(--success);">
                    <div style="color:var(--success); font-weight:600; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center;">
                        <span><span class="icon"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg></span> Node #${node.id}</span>
                        <button class="btn-secondary btn-small" onclick="clearSelection()"><span class="icon"><svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></span></button>
                    </div>
                    
                    <div style="border-top:1px solid var(--border); padding-top:8px;">
                        <div class="form-group">
                            <label style="color:var(--primary);">Coordinates (mm)</label>
                            <div class="form-row-3">
                                <div>
                                    <small style="color:var(--text-3);">X</small>
                                    <input type="number" id="editNodeX" value="${(node.x * 1000).toFixed(1)}" step="1">
                                </div>
                                <div>
                                    <small style="color:var(--text-3);">Y</small>
                                    <input type="number" id="editNodeY" value="${(node.y * 1000).toFixed(1)}" step="1">
                                </div>
                                <div>
                                    <small style="color:var(--text-3);">Z</small>
                                    <input type="number" id="editNodeZ" value="${((node.z || 0) * 1000).toFixed(1)}" step="1">
                                </div>
                            </div>
                        </div>
                        
                        <div class="form-group">
                            <label style="color:var(--warning);"><span class="icon"><svg viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></span> Boundary Conditions</label>
                            <div style="display:grid; grid-template-columns: repeat(6, 1fr); gap:4px; margin-top:4px;">
                                <label style="display:flex; flex-direction:column; align-items:center; cursor:pointer;">
                                    <input type="checkbox" id="bcUx" ${bcUx ? 'checked' : ''} style="width:18px; height:18px; accent-color:var(--success);">
                                    <small style="color:var(--text-3); margin-top:2px;">Ux</small>
                                </label>
                                <label style="display:flex; flex-direction:column; align-items:center; cursor:pointer;">
                                    <input type="checkbox" id="bcUy" ${bcUy ? 'checked' : ''} style="width:18px; height:18px; accent-color:var(--success);">
                                    <small style="color:var(--text-3); margin-top:2px;">Uy</small>
                                </label>
                                <label style="display:flex; flex-direction:column; align-items:center; cursor:pointer;">
                                    <input type="checkbox" id="bcUz" ${bcUz ? 'checked' : ''} style="width:18px; height:18px; accent-color:var(--success);">
                                    <small style="color:var(--text-3); margin-top:2px;">Uz</small>
                                </label>
                                <label style="display:flex; flex-direction:column; align-items:center; cursor:pointer;">
                                    <input type="checkbox" id="bcRx" ${bcRx ? 'checked' : ''} style="width:18px; height:18px; accent-color:var(--success);">
                                    <small style="color:var(--text-3); margin-top:2px;">Rx</small>
                                </label>
                                <label style="display:flex; flex-direction:column; align-items:center; cursor:pointer;">
                                    <input type="checkbox" id="bcRy" ${bcRy ? 'checked' : ''} style="width:18px; height:18px; accent-color:var(--success);">
                                    <small style="color:var(--text-3); margin-top:2px;">Ry</small>
                                </label>
                                <label style="display:flex; flex-direction:column; align-items:center; cursor:pointer;">
                                    <input type="checkbox" id="bcRz" ${bcRz ? 'checked' : ''} style="width:18px; height:18px; accent-color:var(--success);">
                                    <small style="color:var(--text-3); margin-top:2px;">Rz</small>
                                </label>
                            </div>
                            <div style="display:flex; gap:4px; margin-top:8px;">
                                <button class="btn-secondary btn-small" onclick="setPresetBC('fixed')" style="flex:1; font-size:var(--fs-xs);">Fixed</button>
                                <button class="btn-secondary btn-small" onclick="setPresetBC('pinned')" style="flex:1; font-size:var(--fs-xs);">Pinned</button>
                                <button class="btn-secondary btn-small" onclick="setPresetBC('simply')" style="flex:1; font-size:var(--fs-xs);">Simply</button>
                                <button class="btn-secondary btn-small" onclick="setPresetBC('free')" style="flex:1; font-size:var(--fs-xs);">Free</button>
                            </div>
                        </div>
                        
                        <div class="btn-group" style="margin-top:8px;">
                            <button class="btn-primary" onclick="applyNodeChanges(${node.id})"><span class="icon"><svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg></span> Apply</button>
                        </div>
                    </div>
                    
                    <!-- Point Load Section -->
                    <div style="border-top:1px solid var(--border); margin-top:12px; padding-top:8px;">
                        <div style="color:var(--danger); font-weight:600; margin-bottom:8px;"><span class="icon"><svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg></span> Point Load (P)</div>
                        
                        <div class="form-group">
                            <label>Force Components (kN)</label>
                            <div class="form-row-3">
                                <div>
                                    <small style="color:var(--text-3);">Fx</small>
                                    <input type="number" id="nodeLoadFx" value="0" step="1">
                                </div>
                                <div>
                                    <small style="color:var(--text-3);">Fy</small>
                                    <input type="number" id="nodeLoadFy" value="0" step="1">
                                </div>
                                <div>
                                    <small style="color:var(--danger);">Fz ↓</small>
                                    <input type="number" id="nodeLoadFz" value="-10" step="1">
                                </div>
                            </div>
                        </div>
                        
                        <div class="form-group">
                            <label>Moment Components (kN·m)</label>
                            <div class="form-row-3">
                                <div>
                                    <small style="color:var(--text-3);">Mx</small>
                                    <input type="number" id="nodeLoadMx" value="0" step="1">
                                </div>
                                <div>
                                    <small style="color:var(--text-3);">My</small>
                                    <input type="number" id="nodeLoadMy" value="0" step="1">
                                </div>
                                <div>
                                    <small style="color:var(--text-3);">Mz</small>
                                    <input type="number" id="nodeLoadMz" value="0" step="1">
                                </div>
                            </div>
                            <small style="color:var(--text-3); font-size:var(--fs-xs);">Negative Fz = downward load</small>
                        </div>
                        
                        <div class="btn-group">
                            <button class="btn-danger" onclick="addNodeLoad(${node.id})" style="flex:1;">+ Add Load</button>
                            <button class="btn-secondary" onclick="clearNodeLoads(${node.id})">Clear</button>
                        </div>
                        
                        ${existingLoads.length > 0 ? `
                        <div style="margin-top:8px; padding:8px; background:rgba(239,68,68,0.1); border-radius:var(--r-ctl);">
                            <small style="color:var(--danger);">Current loads:<br>
                            F: (${existingFx.toFixed(1)}, ${existingFy.toFixed(1)}, ${existingFz.toFixed(1)}) kN<br>
                            M: (${existingMx.toFixed(1)}, ${existingMy.toFixed(1)}, ${existingMz.toFixed(1)}) kN·m</small>
                        </div>
                        ` : ''}
                    </div>
                </div>`;
            
            setHtml('elementDetails', detailsHtml);
            setStyle('elementDetails', 'display', 'block');
        }
        
        // Preset BC helper function
        function setPresetBC(type) {
            const checkboxes = {
                Ux: document.getElementById('bcUx'),
                Uy: document.getElementById('bcUy'),
                Uz: document.getElementById('bcUz'),
                Rx: document.getElementById('bcRx'),
                Ry: document.getElementById('bcRy'),
                Rz: document.getElementById('bcRz')
            };
            
            // Reset all
            Object.values(checkboxes).forEach(cb => { if(cb) cb.checked = false; });
            
            if (type === 'fixed') {
                Object.values(checkboxes).forEach(cb => { if(cb) cb.checked = true; });
            } else if (type === 'pinned') {
                if(checkboxes.Ux) checkboxes.Ux.checked = true;
                if(checkboxes.Uy) checkboxes.Uy.checked = true;
                if(checkboxes.Uz) checkboxes.Uz.checked = true;
            } else if (type === 'simply') {
                if(checkboxes.Uz) checkboxes.Uz.checked = true;
            }
            // 'free' leaves all unchecked
        }
        
        function applyNodeChanges(nodeId) {
            const node = model.nodes[nodeId];
            if (!node) return;
            
            saveState(); // Save before changes
            
            // Update coordinates
            node.x = parseFloat(document.getElementById('editNodeX').value) / 1000;
            node.y = parseFloat(document.getElementById('editNodeY').value) / 1000;
            node.z = parseFloat(document.getElementById('editNodeZ').value) / 1000;
            
            // Update BC from checkboxes
            const bcUx = document.getElementById('bcUx')?.checked || false;
            const bcUy = document.getElementById('bcUy')?.checked || false;
            const bcUz = document.getElementById('bcUz')?.checked || false;
            const bcRx = document.getElementById('bcRx')?.checked || false;
            const bcRy = document.getElementById('bcRy')?.checked || false;
            const bcRz = document.getElementById('bcRz')?.checked || false;
            
            // If no DOF is constrained, remove constraint
            if (!bcUx && !bcUy && !bcUz && !bcRx && !bcRy && !bcRz) {
                delete model.constraints[nodeId];
            } else {
                model.constraints[nodeId] = {
                    Ux: bcUx,
                    Uy: bcUy,
                    Uz: bcUz,
                    Rx: bcRx,
                    Ry: bcRy,
                    Rz: bcRz
                };
            }
            
            updateModelSummary();
            if (currentViewMode === '3d') {
                update3DScene();
            } else {
                draw();
            }
            showNodeDetails(node);
            showToast(`Node #${nodeId} updated`);
        }
        
        function addNodeLoad(nodeId) {
            const Fx = parseFloat(document.getElementById('nodeLoadFx').value) || 0;
            const Fy = parseFloat(document.getElementById('nodeLoadFy').value) || 0;
            const Fz = parseFloat(document.getElementById('nodeLoadFz').value) || 0;
            const Mx = parseFloat(document.getElementById('nodeLoadMx').value) || 0;
            const My = parseFloat(document.getElementById('nodeLoadMy').value) || 0;
            const Mz = parseFloat(document.getElementById('nodeLoadMz').value) || 0;
            
            if (Fx === 0 && Fy === 0 && Fz === 0 && Mx === 0 && My === 0 && Mz === 0) {
                showToast('Enter at least one force or moment component', true);
                return;
            }
            
            saveState(); // Save before adding load
            
            model.loads.push({
                nodeId: nodeId,
                Fx: Fx,
                Fy: Fy,
                Fz: Fz,
                Mx: Mx,
                My: My,
                Mz: Mz
            });
            
            updateModelSummary();
            if (currentViewMode === '3d') {
                update3DScene();
            } else {
                draw();
            }
            showNodeDetails(model.nodes[nodeId]);
            showToast(`Load added: Fz = ${Fz} kN at Node #${nodeId}`);
        }
        
        function clearNodeLoads(nodeId) {
            const beforeCount = model.loads.length;
            if (beforeCount === 0 || model.loads.filter(l => l.nodeId === nodeId).length === 0) {
                showToast('No loads on this node', true);
                return;
            }
            
            saveState(); // Save before clearing
            model.loads = model.loads.filter(l => l.nodeId !== nodeId);
            const removed = beforeCount - model.loads.length;
            
            updateModelSummary();
            draw();
            showNodeDetails(model.nodes[nodeId]);
            showToast(`Cleared ${removed} load(s) from Node #${nodeId}`);
        }
        
        function showMultiSelectionDetails() {
            const elemCount = selectedElements.size;
            const nodeCount = selectedNodes.size;
            
            let detailsHtml = `
                <div style="background:#1e3a5f; padding:12px; border-radius:var(--r-ovl); margin-bottom:16px; border-left:4px solid var(--warning);">
                    <div style="color:var(--warning); font-weight:600; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center;">
                        <span><span class="icon"><svg viewBox="0 0 24 24"><line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg></span> Multi-Selection</span>
                        <button class="btn-secondary btn-small" onclick="clearSelection()"><span class="icon"><svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></span></button>
                    </div>
                    <div style="color:var(--text-2); font-size:var(--fs-md);">
                        ${elemCount > 0 ? `<div>Elements: ${elemCount} selected</div>` : ''}
                        ${nodeCount > 0 ? `<div>Nodes: ${nodeCount} selected</div>` : ''}
                    </div>`;
            
            if (elemCount > 0) {
                detailsHtml += `
                    <div style="border-top:1px solid var(--border); margin-top:8px; padding-top:8px;">
                        <div class="form-group">
                            <label style="color:var(--primary);">Change Section for All</label>
                            <select id="multiEditProfile">
                                <option value="">-- Keep Current --</option>
                                <optgroup label="HP Profiles">
                                    <option value="HP200x10">HP200x10</option>
                                    <option value="HP180x10">HP180x10</option>
                                    <option value="HP160x9">HP160x9</option>
                                    <option value="HP140x8">HP140x8</option>
                                </optgroup>
                                <optgroup label="Flat Bar">
                                    <option value="FB120x12">FB120x12</option>
                                    <option value="FB150x12">FB150x12</option>
                                    <option value="FB150x15">FB150x15</option>
                                </optgroup>
                            </select>
                        </div>
                        
                        <div class="form-group">
                            <label style="color:var(--success);">Attached Plate (mm)</label>
                            <div class="form-row">
                                <input type="number" id="multiPlateW" placeholder="Width">
                                <input type="number" id="multiPlateT" placeholder="Thick">
                            </div>
                        </div>
                        
                        <div class="form-group">
                            <label style="color:var(--warning);">Material Grade</label>
                            <select id="multiEditGrade">
                                <option value="">-- Keep Current --</option>
                                <option value="A">Grade A (235 MPa)</option>
                                <option value="AH32">AH32 (315 MPa)</option>
                                <option value="AH36">AH36 (355 MPa)</option>
                                <option value="DH36">DH36 (355 MPa)</option>
                            </select>
                        </div>
                        
                        <button class="btn-primary btn-block" onclick="applyMultiElementChanges()"><span class="icon"><svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg></span> Apply to Selected</button>
                    </div>`;
            }
            
            if (nodeCount > 0) {
                detailsHtml += `
                    <div style="border-top:1px solid var(--border); margin-top:8px; padding-top:8px;">
                        <div class="form-group">
                            <label style="color:var(--warning);">Set BC for All Selected Nodes</label>
                            <select id="multiEditBC">
                                <option value="">-- Keep Current --</option>
                                <option value="free">Free</option>
                                <option value="fixed">Fixed</option>
                                <option value="pinned">Pinned</option>
                                <option value="simply_supported">Simply Supported</option>
                            </select>
                        </div>
                        <button class="btn-success btn-block" onclick="applyMultiNodeBC()"><span class="icon"><svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg></span> Apply BC</button>
                    </div>`;
            }
            
            detailsHtml += `</div>`;
            
            setHtml('elementDetails', detailsHtml);
            setStyle('elementDetails', 'display', 'block');
        }
        
        function applyMultiElementChanges() {
            const profile = document.getElementById('multiEditProfile').value;
            const plateW = document.getElementById('multiPlateW').value;
            const plateT = document.getElementById('multiPlateT').value;
            const grade = document.getElementById('multiEditGrade').value;
            
            let sectionName = profile;
            if (profile && plateW && plateT) {
                sectionName = `${profile}_${plateW}x${plateT}`;
                layerToSection(sectionName);
            }
            
            let count = 0;
            selectedElements.forEach(elemId => {
                const elem = model.elements[elemId];
                if (elem) {
                    if (sectionName) elem.section = sectionName;
                    if (grade) elem.grade = grade;
                    count++;
                }
            });
            
            updateModelSummary();
            updateSectionTable();
            draw();
            showToast(`Updated ${count} elements`);
        }
        
        function applyMultiNodeBC() {
            const bc = document.getElementById('multiEditBC').value;
            if (!bc) return;
            
            let count = 0;
            selectedNodes.forEach(nodeId => {
                if (bc === 'free') {
                    delete model.constraints[nodeId];
                } else {
                    model.constraints[nodeId] = bc;
                }
                count++;
            });
            
            updateModelSummary();
            draw();
            showToast(`Set BC for ${count} nodes`);
        }
        
        function pointToLineDistance(px, py, x1, y1, x2, y2) {
            const A = px - x1;
            const B = py - y1;
            const C = x2 - x1;
            const D = y2 - y1;
            
            const dot = A * C + B * D;
            const lenSq = C * C + D * D;
            let param = -1;
            
            if (lenSq !== 0) param = dot / lenSq;
            
            let xx, yy;
            if (param < 0) {
                xx = x1; yy = y1;
            } else if (param > 1) {
                xx = x2; yy = y2;
            } else {
                xx = x1 + param * C;
                yy = y1 + param * D;
            }
            
            return Math.sqrt((px - xx) * (px - xx) + (py - yy) * (py - yy));
        }
        
        function showElementDetails(elem) {
            const sec = SECTIONS[elem.section];
            if (!sec) return;
            
            const n1 = model.nodes[elem.n1];
            const n2 = model.nodes[elem.n2];
            const length = Math.sqrt(Math.pow(n2.x - n1.x, 2) + Math.pow(n2.y - n1.y, 2));
            
            // Parse current section name to get profile and plate separately
            let currentProfile = elem.section;
            let currentPlateW = '';
            let currentPlateT = '';
            
            if (sec.isComposite) {
                currentProfile = sec.profileName || elem.section.split('_')[0];
                currentPlateW = sec.plateWidth || '';
                currentPlateT = sec.plateThick || '';
            } else if (elem.section.includes('_')) {
                const parts = elem.section.split('_');
                currentProfile = parts[0];
                const plateMatch = parts[1].match(/(\d+)[Xx](\d+)/);
                if (plateMatch) {
                    currentPlateW = plateMatch[1];
                    currentPlateT = plateMatch[2];
                }
            }
            
            // Get current material/grade
            const currentGrade = elem.grade || 'AH36';
            
            // DXF color names for display
            const COLOR_NAMES = {
                1: 'Red', 2: 'Yellow', 3: 'Green', 4: 'Cyan',
                5: 'Blue', 6: 'Magenta', 7: 'White', 256: 'ByLayer'
            };
            const dxfColorName = COLOR_NAMES[elem.dxfColor] || 'Unknown';
            
            let detailsHtml = `
                <div style="background:#1e3a5f; padding:12px; border-radius:var(--r-ovl); margin-bottom:16px; border-left:4px solid var(--warning);">
                    <div style="color:var(--warning); font-weight:600; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center;">
                        <span><span class="icon"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg></span> Element #${elem.id}</span>
                        <button class="btn-secondary btn-small" onclick="clearSelection()"><span class="icon"><svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></span></button>
                    </div>
                    <div style="font-size:var(--fs-md); color:var(--text-2); margin-bottom:8px;">
                        Nodes: ${elem.n1} → ${elem.n2} | Length: ${(length * 1000).toFixed(0)} mm
                        ${elem.dxfLayer ? `<br><span style="color:var(--text-3);">DXF Layer: ${elem.dxfLayer} | Color: <span style="color:${dxfColorName.toLowerCase()}">${dxfColorName}</span></span>` : ''}
                    </div>
                    
                    <!-- Node Coordinates Edit -->
                    <div style="border-bottom:1px solid var(--border); padding-bottom:8px; margin-bottom:8px;">
                        <div style="color:var(--success); font-weight:600; margin-bottom:8px; font-size:var(--fs-md);"><span class="icon"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg></span> Node Coordinates (mm)</div>
                        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px;">
                            <div style="background:var(--bg-main); padding:8px; border-radius:var(--r-ctl);">
                                <div style="color:var(--text-3); font-size:var(--fs-sm); margin-bottom:4px;">Node ${elem.n1} (Start)</div>
                                <div style="display:flex; gap:4px;">
                                    <div style="flex:1;">
                                        <small style="color:var(--text-3);">X</small>
                                        <input type="number" id="editElemN1X" value="${(n1.x * 1000).toFixed(0)}" step="1" style="font-size:var(--fs-sm); padding:4px;">
                                    </div>
                                    <div style="flex:1;">
                                        <small style="color:var(--text-3);">Y</small>
                                        <input type="number" id="editElemN1Y" value="${(n1.y * 1000).toFixed(0)}" step="1" style="font-size:var(--fs-sm); padding:4px;">
                                    </div>
                                </div>
                            </div>
                            <div style="background:var(--bg-main); padding:8px; border-radius:var(--r-ctl);">
                                <div style="color:var(--text-3); font-size:var(--fs-sm); margin-bottom:4px;">Node ${elem.n2} (End)</div>
                                <div style="display:flex; gap:4px;">
                                    <div style="flex:1;">
                                        <small style="color:var(--text-3);">X</small>
                                        <input type="number" id="editElemN2X" value="${(n2.x * 1000).toFixed(0)}" step="1" style="font-size:var(--fs-sm); padding:4px;">
                                    </div>
                                    <div style="flex:1;">
                                        <small style="color:var(--text-3);">Y</small>
                                        <input type="number" id="editElemN2Y" value="${(n2.y * 1000).toFixed(0)}" step="1" style="font-size:var(--fs-sm); padding:4px;">
                                    </div>
                                </div>
                            </div>
                        </div>
                        <button class="btn-primary" onclick="applyCoordinateChanges(${elem.id})" style="margin-top:8px; width:100%; padding:8px;">
                            <span class="icon"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg></span> Update Coordinates
                        </button>
                    </div>
                    
                    <div style="border-top:1px solid var(--border); padding-top:8px;">
                        <!-- Profile Selection -->
                        <div class="form-group">
                            <label style="color:var(--primary); font-weight:600;">Profile</label>
                            <select id="editProfile" style="font-size:var(--fs-md);">
                                <optgroup label="HP Profiles">
                                    <option value="HP200x10" ${currentProfile === 'HP200x10' ? 'selected' : ''}>HP200x10</option>
                                    <option value="HP200x11" ${currentProfile === 'HP200x11' ? 'selected' : ''}>HP200x11</option>
                                    <option value="HP200x12" ${currentProfile === 'HP200x12' ? 'selected' : ''}>HP200x12</option>
                                    <option value="HP180x10" ${currentProfile === 'HP180x10' ? 'selected' : ''}>HP180x10</option>
                                    <option value="HP180x11" ${currentProfile === 'HP180x11' ? 'selected' : ''}>HP180x11</option>
                                    <option value="HP160x9" ${currentProfile === 'HP160x9' ? 'selected' : ''}>HP160x9</option>
                                    <option value="HP160x8" ${currentProfile === 'HP160x8' ? 'selected' : ''}>HP160x8</option>
                                    <option value="HP140x8" ${currentProfile === 'HP140x8' ? 'selected' : ''}>HP140x8</option>
                                    <option value="HP140x9" ${currentProfile === 'HP140x9' ? 'selected' : ''}>HP140x9</option>
                                    <option value="HP120x8" ${currentProfile === 'HP120x8' ? 'selected' : ''}>HP120x8</option>
                                </optgroup>
                                <optgroup label="Flat Bar">
                                    <option value="FB100x10" ${currentProfile === 'FB100x10' ? 'selected' : ''}>FB100x10</option>
                                    <option value="FB100x12" ${currentProfile === 'FB100x12' ? 'selected' : ''}>FB100x12</option>
                                    <option value="FB120x10" ${currentProfile === 'FB120x10' ? 'selected' : ''}>FB120x10</option>
                                    <option value="FB120x12" ${currentProfile === 'FB120x12' ? 'selected' : ''}>FB120x12</option>
                                    <option value="FB120x14" ${currentProfile === 'FB120x14' ? 'selected' : ''}>FB120x14</option>
                                    <option value="FB140x10" ${currentProfile === 'FB140x10' ? 'selected' : ''}>FB140x10</option>
                                    <option value="FB140x12" ${currentProfile === 'FB140x12' ? 'selected' : ''}>FB140x12</option>
                                    <option value="FB140x14" ${currentProfile === 'FB140x14' ? 'selected' : ''}>FB140x14</option>
                                    <option value="FB150x10" ${currentProfile === 'FB150x10' ? 'selected' : ''}>FB150x10</option>
                                    <option value="FB150x12" ${currentProfile === 'FB150x12' ? 'selected' : ''}>FB150x12</option>
                                    <option value="FB150x15" ${currentProfile === 'FB150x15' ? 'selected' : ''}>FB150x15</option>
                                    <option value="FB180x12" ${currentProfile === 'FB180x12' ? 'selected' : ''}>FB180x12</option>
                                    <option value="FB200x12" ${currentProfile === 'FB200x12' ? 'selected' : ''}>FB200x12</option>
                                </optgroup>
                                <optgroup label="Custom">
                                    <option value="custom" ${!currentProfile.startsWith('HP') && !currentProfile.startsWith('FB') ? 'selected' : ''}>Custom...</option>
                                </optgroup>
                            </select>
                        </div>
                        
                        <!-- Custom Profile Input -->
                        <div id="customProfileDiv" style="display:none; margin-bottom:8px;">
                            <input type="text" id="customProfile" placeholder="e.g. FB160x14 or T400x12+150x20" 
                                   style="font-size:var(--fs-md);" value="${currentProfile}">
                        </div>
                        
                        <!-- Attached Plate -->
                        <div class="form-group">
                            <label style="color:var(--success); font-weight:600;">Attached Plate (mm)</label>
                            <div class="form-row">
                                <input type="number" id="editPlateW" placeholder="Width" value="${currentPlateW}" min="0" step="50">
                                <input type="number" id="editPlateT" placeholder="Thick" value="${currentPlateT}" min="0" step="1">
                            </div>
                            <small style="color:var(--text-3);">Leave empty for no plate</small>
                        </div>
                        
                        <!-- Material Grade -->
                        <div class="form-group">
                            <label style="color:var(--warning); font-weight:600;">Material Grade</label>
                            <select id="editGrade" style="font-size:var(--fs-md);">
                                <option value="A" ${currentGrade === 'A' ? 'selected' : ''}>Grade A (σy = 235 MPa)</option>
                                <option value="AH32" ${currentGrade === 'AH32' ? 'selected' : ''}>AH32 (σy = 315 MPa)</option>
                                <option value="AH36" ${currentGrade === 'AH36' ? 'selected' : ''}>AH36 (σy = 355 MPa)</option>
                                <option value="DH32" ${currentGrade === 'DH32' ? 'selected' : ''}>DH32 (σy = 315 MPa)</option>
                                <option value="DH36" ${currentGrade === 'DH36' ? 'selected' : ''}>DH36 (σy = 355 MPa)</option>
                            </select>
                        </div>
                        
                        <!-- Beam Orientation -->
                        <div class="form-group">
                            <label style="color:var(--primary); font-weight:600;"><span class="icon"><svg viewBox="0 0 24 24"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg></span> Beam Orientation</label>
                            <div style="display:flex; gap:8px; align-items:center;">
                                <input type="range" id="editOrientation" min="-180" max="180" step="5" 
                                       value="${elem.orientation || 0}" 
                                       style="flex:1; accent-color:var(--primary);"
                                       oninput="document.getElementById('orientationValue').textContent = this.value + '°'; previewOrientation(${elem.id});">
                                <span id="orientationValue" style="min-width:45px; color:var(--primary); font-weight:600;">${elem.orientation || 0}°</span>
                            </div>
                            <div style="display:flex; gap:4px; margin-top:4px;">
                                <button class="btn-secondary btn-small" onclick="setOrientation(${elem.id}, 0)">0°</button>
                                <button class="btn-secondary btn-small" onclick="setOrientation(${elem.id}, 90)">90°</button>
                                <button class="btn-secondary btn-small" onclick="setOrientation(${elem.id}, -90)">-90°</button>
                                <button class="btn-secondary btn-small" onclick="setOrientation(${elem.id}, 180)">180°</button>
                            </div>
                            <small style="color:var(--text-3); display:block; margin-top:4px;">
                                Rotation around beam axis. 0° = web vertical (default for grillage)
                            </small>
                        </div>
                        
                        <!-- Action Buttons -->
                        <div class="btn-group" style="margin-top:16px;">
                            <button class="btn-primary" onclick="applyElementChanges(${elem.id})"><span class="icon"><svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg></span> Apply</button>
                            <button class="btn-secondary" onclick="applyToAllSimilar(${elem.id})">Apply to All Similar</button>
                        </div>
                    </div>
                    
                    <!-- Line Load Section -->
                    <div style="border-top:1px solid var(--border); margin-top:12px; padding-top:8px;">
                        <div style="color:var(--danger); font-weight:600; margin-bottom:8px;"><span class="icon"><svg viewBox="0 0 24 24"><path d="M21.21 15.89A1 1 0 0 0 22 15V6a1 1 0 0 0-.29-.71l-4-4A1 1 0 0 0 17 1H8a1 1 0 0 0-.71.29l-4 4A1 1 0 0 0 3 6v9a1 1 0 0 0 .79.98l8 2a1 1 0 0 0 .42 0l8-2z"/><line x1="7" y1="6" x2="7" y2="10"/><line x1="11" y1="6" x2="11" y2="8"/><line x1="15" y1="6" x2="15" y2="10"/></svg></span> Line Load</div>
                        
                        <div class="form-group">
                            <label>Load Value (kN/m)</label>
                            <input type="number" id="lineLoadValue" value="10" step="1">
                        </div>
                        
                        <div class="form-group">
                            <label>Load Direction (°)</label>
                            <select id="lineLoadAngle">
                                <option value="90">90° - Perpendicular (↓ Down)</option>
                                <option value="270">270° - Perpendicular (↑ Up)</option>
                                <option value="0">0° - Along beam (+)</option>
                                <option value="180">180° - Along beam (-)</option>
                                <option value="45">45° - Diagonal</option>
                                <option value="30">30° - Angled</option>
                                <option value="60">60° - Angled</option>
                                <option value="custom">Custom angle...</option>
                            </select>
                        </div>
                        
                        <div id="customAngleDiv" style="display:none; margin-bottom:8px;">
                            <input type="number" id="customAngle" placeholder="Enter angle (0-360)" min="0" max="360" step="1">
                        </div>
                        
                        <div class="form-group">
                            <label>Load Position</label>
                            <select id="lineLoadPosition">
                                <option value="full">Full length</option>
                                <option value="partial">Partial (specify start/end)</option>
                            </select>
                        </div>
                        
                        <div id="partialLoadDiv" style="display:none;">
                            <div class="form-row" style="margin-bottom:8px;">
                                <div>
                                    <small style="color:var(--text-3);">Start (%)</small>
                                    <input type="number" id="loadStart" value="0" min="0" max="100" step="5">
                                </div>
                                <div>
                                    <small style="color:var(--text-3);">End (%)</small>
                                    <input type="number" id="loadEnd" value="100" min="0" max="100" step="5">
                                </div>
                            </div>
                        </div>
                        
                        <div class="btn-group">
                            <button class="btn-danger" onclick="addLineLoad(${elem.id})" style="flex:1;">+ Add Load</button>
                            <button class="btn-secondary" onclick="showElementLoads(${elem.id})">View Loads</button>
                        </div>
                    </div>
                    
                    <!-- Calculated Properties (read-only) -->
                    <div style="border-top:1px solid var(--border); margin-top:12px; padding-top:8px;">
                        <div style="color:var(--text-2); font-size:var(--fs-sm); margin-bottom:4px;">CALCULATED PROPERTIES</div>
                        <table style="width:100%; font-size:var(--fs-sm);" id="calcPropsTable">
                            <tr><td style="color:var(--text-3);">Area:</td><td style="text-align:right; color:var(--primary);">${(sec.A * 1e4).toFixed(2)} cm²</td></tr>
                            <tr><td style="color:var(--text-3);">Iy:</td><td style="text-align:right; color:var(--primary);">${(sec.Iy * 1e8).toFixed(2)} cm⁴</td></tr>
                            <tr><td style="color:var(--text-3);">Wy:</td><td style="text-align:right; color:var(--primary);">${(sec.Wy * 1e6).toFixed(2)} cm³</td></tr>
                            <tr><td style="color:var(--text-3);">Total Height:</td><td style="text-align:right; color:var(--primary);">${(sec.h * 1000).toFixed(0)} mm</td></tr>
                        </table>
                    </div>
                </div>`;
            
            setHtml('elementDetails', detailsHtml);
            setStyle('elementDetails', 'display', 'block');
            
            // Setup profile dropdown change handler
            document.getElementById('editProfile').addEventListener('change', function() {
                const customDiv = document.getElementById('customProfileDiv');
                if (this.value === 'custom') {
                    customDiv.style.display = 'block';
                } else {
                    customDiv.style.display = 'none';
                }
                previewSectionChanges();
            });
            
            // Setup live preview on input changes
            document.getElementById('editPlateW').addEventListener('input', previewSectionChanges);
            document.getElementById('editPlateT').addEventListener('input', previewSectionChanges);
            document.getElementById('customProfile').addEventListener('input', previewSectionChanges);
            
            // Check if custom profile is selected
            const profileSelect = $('editProfile');
            if (profileSelect && !Array.from(profileSelect.options).some(opt => opt.value === currentProfile && opt.value !== 'custom')) {
                profileSelect.value = 'custom';
                setStyle('customProfileDiv', 'display', 'block');
                const customProfileInput = $('customProfile');
                if (customProfileInput) customProfileInput.value = currentProfile;
            }
            
            // Setup line load event handlers
            const lineLoadAngle = $('lineLoadAngle');
            if (lineLoadAngle) {
                lineLoadAngle.addEventListener('change', function() {
                    setStyle('customAngleDiv', 'display', this.value === 'custom' ? 'block' : 'none');
                });
            }
            
            const lineLoadPosition = $('lineLoadPosition');
            if (lineLoadPosition) {
                lineLoadPosition.addEventListener('change', function() {
                    setStyle('partialLoadDiv', 'display', this.value === 'partial' ? 'block' : 'none');
                });
            }
        }
        
        function previewSectionChanges() {
            const profileSelect = document.getElementById('editProfile');
            let profile = profileSelect.value;
            if (profile === 'custom') {
                profile = document.getElementById('customProfile').value.toUpperCase();
            }
            
            const plateW = document.getElementById('editPlateW').value;
            const plateT = document.getElementById('editPlateT').value;
            
            // Build section name
            let sectionName = profile;
            if (plateW && plateT && parseInt(plateW) > 0 && parseInt(plateT) > 0) {
                sectionName = `${profile}_${plateW}x${plateT}`;
            }
            
            // Calculate preview properties
            const tempSection = layerToSection(sectionName);
            const sec = SECTIONS[tempSection];
            
            if (sec) {
                const table = document.getElementById('calcPropsTable');
                table.innerHTML = `
                    <tr><td style="color:var(--text-3);">Area:</td><td style="text-align:right; color:var(--success);">${(sec.A * 1e4).toFixed(2)} cm²</td></tr>
                    <tr><td style="color:var(--text-3);">Iy:</td><td style="text-align:right; color:var(--success);">${(sec.Iy * 1e8).toFixed(2)} cm⁴</td></tr>
                    <tr><td style="color:var(--text-3);">Wy:</td><td style="text-align:right; color:var(--success);">${(sec.Wy * 1e6).toFixed(2)} cm³</td></tr>
                    <tr><td style="color:var(--text-3);">Total Height:</td><td style="text-align:right; color:var(--success);">${(sec.h * 1000).toFixed(0)} mm</td></tr>
                `;
            }
        }
        
        function applyElementChanges(elemId) {
            const elem = model.elements[elemId];
            if (!elem) return;
            
            saveState(); // Save before changes
            
            // Update node coordinates if changed
            const n1 = model.nodes[elem.n1];
            const n2 = model.nodes[elem.n2];
            
            const n1xInput = document.getElementById('editElemN1X');
            const n1yInput = document.getElementById('editElemN1Y');
            const n2xInput = document.getElementById('editElemN2X');
            const n2yInput = document.getElementById('editElemN2Y');
            
            if (n1xInput && n1yInput && n1) {
                n1.x = parseFloat(n1xInput.value) / 1000;
                n1.y = parseFloat(n1yInput.value) / 1000;
            }
            if (n2xInput && n2yInput && n2) {
                n2.x = parseFloat(n2xInput.value) / 1000;
                n2.y = parseFloat(n2yInput.value) / 1000;
            }
            
            const profileSelect = document.getElementById('editProfile');
            let profile = profileSelect.value;
            if (profile === 'custom') {
                profile = document.getElementById('customProfile').value.toUpperCase();
            }
            
            const plateW = document.getElementById('editPlateW').value;
            const plateT = document.getElementById('editPlateT').value;
            const grade = document.getElementById('editGrade').value;
            const orientation = parseInt(document.getElementById('editOrientation').value) || 0;
            
            // Build new section name
            let newSectionName = profile;
            if (plateW && plateT && parseInt(plateW) > 0 && parseInt(plateT) > 0) {
                newSectionName = `${profile}_${plateW}x${plateT}`;
            }
            
            // Ensure section exists
            layerToSection(newSectionName);
            
            // Update element
            const oldSection = elem.section;
            elem.section = newSectionName;
            elem.grade = grade;
            elem.orientation = orientation;
            
            // Update display
            updateModelSummary();
            updateSectionTable();
            if (currentViewMode === '3d') {
                update3DScene();
            } else {
                draw();
            }
            showElementDetails(elem);
            
            showToast(`Element #${elemId} updated: ${newSectionName}, orientation: ${orientation}°`);
        }
        
        // Apply only coordinate changes (for beam's nodes)
        function applyCoordinateChanges(elemId) {
            const elem = model.elements[elemId];
            if (!elem) return;
            
            const n1 = model.nodes[elem.n1];
            const n2 = model.nodes[elem.n2];
            
            const n1xInput = document.getElementById('editElemN1X');
            const n1yInput = document.getElementById('editElemN1Y');
            const n2xInput = document.getElementById('editElemN2X');
            const n2yInput = document.getElementById('editElemN2Y');
            
            if (!n1xInput || !n1yInput || !n2xInput || !n2yInput) {
                showToast('Input fields not found', 'error');
                return;
            }
            
            saveState();
            
            // Update node coordinates
            if (n1) {
                n1.x = parseFloat(n1xInput.value) / 1000;
                n1.y = parseFloat(n1yInput.value) / 1000;
            }
            if (n2) {
                n2.x = parseFloat(n2xInput.value) / 1000;
                n2.y = parseFloat(n2yInput.value) / 1000;
            }
            
            // Recalculate length for display
            const newLength = Math.sqrt(Math.pow(n2.x - n1.x, 2) + Math.pow(n2.y - n1.y, 2));
            
            results = null;
            updateModelSummary();
            if (currentViewMode === '3d') {
                update3DScene();
            } else {
                draw();
            }
            showElementDetails(elem);
            
            showToast(`Coordinates updated. New length: ${(newLength * 1000).toFixed(0)} mm`);
        }
        
        function setOrientation(elemId, angle) {
            document.getElementById('editOrientation').value = angle;
            document.getElementById('orientationValue').textContent = angle + '°';
            previewOrientation(elemId);
        }
        
        function previewOrientation(elemId) {
            const elem = model.elements[elemId];
            if (!elem) return;
            
            const orientation = parseInt(document.getElementById('editOrientation').value) || 0;
            elem.orientation = orientation;
            
            if (currentViewMode === '3d') {
                update3DScene();
            }
        }
        
        function applyToAllSimilar(elemId) {
            const elem = model.elements[elemId];
            if (!elem) return;
            
            const oldSection = elem.section;
            
            // Apply changes to clicked element first
            applyElementChanges(elemId);
            
            // Get new values
            const newSection = elem.section;
            const newGrade = elem.grade;
            const newOrientation = elem.orientation || 0;
            
            // Find and update all elements with same old section
            let count = 0;
            Object.values(model.elements).forEach(e => {
                if (e.id !== elemId && e.section === oldSection) {
                    e.section = newSection;
                    e.grade = newGrade;
                    e.orientation = newOrientation;
                    count++;
                }
            });
            
            updateModelSummary();
            updateSectionTable();
            if (currentViewMode === '3d') {
                update3DScene();
            } else {
                draw();
            }
            
            showToast(`Updated ${count + 1} elements with ${newSection}`);
        }
        
        // ============== LINE LOAD ==============
        function addLineLoad(elemId) {
            const elem = model.elements[elemId];
            if (!elem) return;
            
            const loadValue = parseFloat(document.getElementById('lineLoadValue').value);
            let angle = document.getElementById('lineLoadAngle').value;
            
            if (angle === 'custom') {
                angle = parseFloat(document.getElementById('customAngle').value) || 90;
            } else {
                angle = parseFloat(angle);
            }
            
            const position = document.getElementById('lineLoadPosition').value;
            let startPct = 0, endPct = 100;
            
            if (position === 'partial') {
                startPct = parseFloat(document.getElementById('loadStart').value) || 0;
                endPct = parseFloat(document.getElementById('loadEnd').value) || 100;
            }
            
            // Initialize element loads array if not exists
            if (!elem.lineLoads) {
                elem.lineLoads = [];
            }
            
            // Add the load
            elem.lineLoads.push({
                id: elem.lineLoads.length + 1,
                value: loadValue,      // kN/m
                angle: angle,          // degrees
                startPct: startPct,    // % of length
                endPct: endPct         // % of length
            });
            
            draw();
            showElementDetails(elem);
            showToast(`Line load added: ${loadValue} kN/m at ${angle}°`);
        }
        
        function showElementLoads(elemId) {
            const elem = model.elements[elemId];
            if (!elem || !elem.lineLoads || elem.lineLoads.length === 0) {
                showToast('No loads on this element', true);
                return;
            }
            
            let loadList = 'Loads on Element #' + elemId + ':\n\n';
            elem.lineLoads.forEach((load, idx) => {
                const qValue = load.value ?? load.q ?? 0;
                const dir = load.direction || (load.angle !== undefined ? load.angle + '°' : 'Z');
                const startPct = (load.startPct !== undefined) ? load.startPct : (load.start !== undefined ? load.start * 100 : 0);
                const endPct = (load.endPct !== undefined) ? load.endPct : (load.end !== undefined ? load.end * 100 : 100);
                loadList += `${idx + 1}. ${qValue} kN/m (${dir})`;
                if (startPct !== 0 || endPct !== 100) {
                    loadList += ` (${startPct}%-${endPct}%)`;
                }
                loadList += '\n';
            });
            
            loadList += '\nRemove a load? Enter number (or cancel):';
            
            const removeIdx = prompt(loadList);
            if (removeIdx && !isNaN(removeIdx)) {
                const idx = parseInt(removeIdx) - 1;
                if (idx >= 0 && idx < elem.lineLoads.length) {
                    elem.lineLoads.splice(idx, 1);
                    draw();
                    showToast('Load removed');
                }
            }
        }
        
        function convertLineLoadsToNodeLoads() {
            // Convert line loads on elements to equivalent nodal loads
            Object.values(model.elements).forEach(elem => {
                if (!elem.lineLoads || elem.lineLoads.length === 0) return;
                
                const n1 = model.nodes[elem.n1];
                const n2 = model.nodes[elem.n2];
                if (!n1 || !n2) return;
                
                const dx = n2.x - n1.x;
                const dy = n2.y - n1.y;
                const L = Math.sqrt(dx * dx + dy * dy);
                
                // Element angle
                const elemAngle = Math.atan2(dy, dx);
                
                elem.lineLoads.forEach(load => {
                    // Load properties with fallbacks
                    const qValue = load.value ?? load.q ?? 0;
                    const startPct = (load.startPct !== undefined) ? load.startPct : (load.start !== undefined ? load.start * 100 : 0);
                    const endPct = (load.endPct !== undefined) ? load.endPct : (load.end !== undefined ? load.end * 100 : 100);
                    
                    // Load length
                    const loadLength = L * (endPct - startPct) / 100;
                    const totalLoad = qValue * loadLength;  // kN
                    
                    // Angle: default 90 for Z direction
                    let angleValue = 90;
                    if (load.angle !== undefined) {
                        angleValue = load.angle;
                    }
                    
                    // Convert angle to radians and calculate components
                    const loadAngleRad = (angleValue - 90) * Math.PI / 180;  // 90° = perpendicular down
                    
                    // Global load direction
                    const globalAngle = elemAngle + loadAngleRad + Math.PI/2;
                    
                    // Load components
                    const Fx = totalLoad * Math.cos(globalAngle);
                    const Fz = -totalLoad * Math.sin(loadAngleRad);  // Negative because down is negative Z
                    
                    // Distribute to nodes (simplified: 50% each for uniform load)
                    const halfLoad = totalLoad / 2;
                    
                    // Add to nodal loads
                    model.loads.push({
                        nodeId: elem.n1,
                        Fx: 0,
                        Fy: 0,
                        Fz: -halfLoad * Math.sin(angleValue * Math.PI / 180),
                        source: 'lineLoad',
                        elemId: elem.id
                    });
                    
                    model.loads.push({
                        nodeId: elem.n2,
                        Fx: 0,
                        Fy: 0,
                        Fz: -halfLoad * Math.sin(angleValue * Math.PI / 180),
                        source: 'lineLoad',
                        elemId: elem.id
                    });
                });
            });
        }
        
        function clearSelection() {
            selectedElement = null;
            selectedNode = null;
            selectedElements.clear();
            selectedNodes.clear();
            setStyle('elementDetails', 'display', 'none');
            updateEntityInfoPanel();
            if (currentViewMode === '3d') {
                update3DScene();
            } else {
                draw();
            }
        }
        
        function selectAllNodes() {
            selectedNodes.clear();
            Object.keys(model.nodes).forEach(id => {
                selectedNodes.add(parseInt(id));
            });
            updateEntityInfoPanel();
            if (currentViewMode === '3d') {
                update3DScene();
            } else {
                draw();
            }
            showToast(`Selected ${selectedNodes.size} nodes`, 'info');
        }
        
        function selectAllElements() {
            selectedElements.clear();
            Object.keys(model.elements).forEach(id => {
                selectedElements.add(parseInt(id));
            });
            updateEntityInfoPanel();
            if (currentViewMode === '3d') {
                update3DScene();
            } else {
                draw();
            }
            showToast(`Selected ${selectedElements.size} elements`, 'info');
        }
        
        function deleteSelection() {
            if (selectedNodes.size === 0 && selectedElements.size === 0) {
                showToast('Nothing selected', 'warning');
                return;
            }
            
            // Delete elements first (they reference nodes)
            selectedElements.forEach(elemId => {
                delete model.elements[elemId];
            });
            
            // Delete nodes (and any elements that reference them)
            selectedNodes.forEach(nodeId => {
                // Find and delete elements using this node
                Object.entries(model.elements).forEach(([id, elem]) => {
                    if (elem.n1 === nodeId || elem.n2 === nodeId) {
                        delete model.elements[id];
                    }
                });
                // Delete constraints and loads
                delete model.constraints[nodeId];
                model.loads = model.loads.filter(l => l.nodeId !== nodeId);
                // Delete node
                delete model.nodes[nodeId];
            });
            
            const deletedCount = selectedNodes.size + selectedElements.size;
            clearSelection();
            updateModelSummary();
            results = null;
            
            if (currentViewMode === '3d') {
                update3DScene();
            } else {
                draw();
            }
            
            saveState();
            showToast(`Deleted ${deletedCount} items`, 'success');
        }
        
        function duplicateSelection() {
            if (selectedNodes.size === 0 && selectedElements.size === 0) {
                showToast('Nothing selected', 'warning');
                return;
            }
            
            // Offset for duplicated items
            const offset = 0.5; // meters
            const nodeIdMap = {}; // oldId -> newId
            
            // Duplicate nodes
            selectedNodes.forEach(oldId => {
                const oldNode = model.nodes[oldId];
                if (oldNode) {
                    const newId = nextNodeId++;
                    nodeIdMap[oldId] = newId;
                    model.nodes[newId] = {
                        id: newId,
                        x: oldNode.x + offset,
                        y: oldNode.y + offset
                    };
                }
            });
            
            // Duplicate elements
            selectedElements.forEach(oldId => {
                const oldElem = model.elements[oldId];
                if (oldElem) {
                    // Check if both nodes were duplicated
                    const newN1 = nodeIdMap[oldElem.n1] || oldElem.n1;
                    const newN2 = nodeIdMap[oldElem.n2] || oldElem.n2;
                    
                    const newId = nextElementId++;
                    model.elements[newId] = {
                        id: newId,
                        n1: newN1,
                        n2: newN2,
                        section: oldElem.section,
                        orientation: oldElem.orientation || 0,
                        lineLoads: []
                    };
                }
            });
            
            updateModelSummary();
            results = null;
            
            if (currentViewMode === '3d') {
                update3DScene();
            } else {
                draw();
            }
            
            saveState();
            showToast(`Duplicated ${selectedNodes.size} nodes, ${selectedElements.size} elements`, 'success');
        }
        
        function selectAll() {
            // Select all nodes and elements
            selectedNodes.clear();
            selectedElements.clear();
            
            Object.keys(model.nodes).forEach(id => {
                selectedNodes.add(parseInt(id));
            });
            
            Object.keys(model.elements).forEach(id => {
                selectedElements.add(parseInt(id));
            });
            
            updateEntityInfoPanel();
            
            if (currentViewMode === '3d') {
                update3DScene();
            } else {
                draw();
            }
            
            const totalSelected = selectedNodes.size + selectedElements.size;
            if (totalSelected > 0) {
                showToast(`Selected all: ${selectedNodes.size} nodes, ${selectedElements.size} beams`);
            }
        }
        
        function deleteSelected() {
            if (selectedNodes.size === 0 && selectedElements.size === 0) {
                showToast('Nothing selected to delete', true);
                return;
            }
            
            saveState();
            
            let deletedNodes = 0;
            let deletedBeams = 0;
            
            // Delete selected elements first
            selectedElements.forEach(elemId => {
                if (model.elements[elemId]) {
                    delete model.elements[elemId];
                    deletedBeams++;
                }
            });
            
            // Delete selected nodes
            selectedNodes.forEach(nodeId => {
                // Check if node is used by any remaining element
                const isUsed = Object.values(model.elements).some(e => e.n1 === nodeId || e.n2 === nodeId);
                
                if (!isUsed && model.nodes[nodeId]) {
                    delete model.nodes[nodeId];
                    delete model.constraints[nodeId];
                    // Remove loads on this node
                    model.loads = model.loads.filter(l => l.nodeId !== nodeId);
                    deletedNodes++;
                }
            });
            
            // Clear selection
            clearSelection();
            
            // Update UI
            updateModelSummary();
            updateBCTable();
            updateLoadTable();
            
            if (currentViewMode === '3d') {
                update3DScene();
            } else {
                draw();
            }
            
            if (deletedNodes > 0 || deletedBeams > 0) {
                showToast(`Deleted: ${deletedNodes} nodes, ${deletedBeams} beams`);
            } else {
                showToast('Could not delete - nodes are connected to beams', true);
            }
        }
        
        // ============== COLLAPSIBLE PANELS ==============
        function toggleCollapsible(header) {
            header.classList.toggle('open');
            const content = header.nextElementSibling;
            content.classList.toggle('open');
        }
        
        // ============== ADD/REMOVE NODES ==============
        function addNodeManual() {
            const x = parseFloat(document.getElementById('addNodeX').value) || 0;
            const y = parseFloat(document.getElementById('addNodeY').value) || 0;
            const z = parseFloat(document.getElementById('addNodeZ').value) || 0;
            
            saveState();
            
            // Find next available node ID
            let nextId = 1;
            while (model.nodes[nextId]) nextId++;
            
            // Add node (convert mm to m for internal storage)
            model.nodes[nextId] = {
                id: nextId,
                x: x / 1000,
                y: y / 1000,
                z: z / 1000
            };
            
            updateModelSummary();
            updateModelTables();
            
            if (currentViewMode === '3d') {
                update3DScene();
            } else {
                draw();
            }
            
            showToast(`Node #${nextId} added at (${x}, ${y}, ${z}) mm`);
            
            // Select the new node
            selectNodeById(nextId);
        }
        
        function duplicateSelectedNodes() {
            if (selectedNodes.size === 0) {
                showToast('Select nodes to duplicate first', true);
                return;
            }
            
            saveState();
            
            // Get offset from user (default 500mm in X direction)
            const offsetX = parseFloat(prompt('Offset X (mm):', '500')) || 0;
            const offsetY = parseFloat(prompt('Offset Y (mm):', '0')) || 0;
            const offsetZ = parseFloat(prompt('Offset Z (mm):', '0')) || 0;
            
            if (offsetX === 0 && offsetY === 0 && offsetZ === 0) {
                showToast('No offset specified, operation cancelled', true);
                return;
            }
            
            const newNodeIds = [];
            
            selectedNodes.forEach(nodeId => {
                const origNode = model.nodes[nodeId];
                if (!origNode) return;
                
                // Find next available node ID
                let nextId = 1;
                while (model.nodes[nextId]) nextId++;
                
                // Create duplicate node with offset
                model.nodes[nextId] = {
                    id: nextId,
                    x: origNode.x + offsetX / 1000,
                    y: origNode.y + offsetY / 1000,
                    z: origNode.z + offsetZ / 1000
                };
                
                // Copy constraints if any
                if (model.constraints[nodeId]) {
                    model.constraints[nextId] = JSON.parse(JSON.stringify(model.constraints[nodeId]));
                }
                
                newNodeIds.push(nextId);
            });
            
            updateModelSummary();
            updateModelTables();
            
            // Select the new nodes
            clearSelection();
            newNodeIds.forEach(id => selectedNodes.add(id));
            updateEntityInfoPanel();
            
            if (currentViewMode === '3d') {
                update3DScene();
            } else {
                draw();
            }
            
            showToast(`Duplicated ${newNodeIds.length} node(s) with offset (${offsetX}, ${offsetY}, ${offsetZ}) mm`);
        }
        
        function removeSelectedNodes() {
            if (selectedNodes.size === 0) {
                showToast('Select nodes to remove first', true);
                return;
            }
            
            saveState();
            
            let removedCount = 0;
            let skippedCount = 0;
            
            selectedNodes.forEach(nodeId => {
                // Check if node is used by any element
                const isUsed = Object.values(model.elements).some(e => e.n1 === nodeId || e.n2 === nodeId);
                
                if (isUsed) {
                    skippedCount++;
                } else if (model.nodes[nodeId]) {
                    delete model.nodes[nodeId];
                    delete model.constraints[nodeId];
                    model.loads = model.loads.filter(l => l.nodeId !== nodeId);
                    removedCount++;
                }
            });
            
            clearSelection();
            updateModelSummary();
            updateModelTables();
            
            if (currentViewMode === '3d') {
                update3DScene();
            } else {
                draw();
            }
            
            if (removedCount > 0) {
                showToast(`Removed ${removedCount} node(s)` + (skippedCount > 0 ? `, ${skippedCount} skipped (connected to beams)` : ''));
            } else {
                showToast('Cannot remove nodes connected to beams', true);
            }
        }
        
        // ============== ADD/REMOVE BEAMS ==============
        function addBeamManual() {
            const n1 = parseInt(document.getElementById('addBeamN1').value);
            const n2 = parseInt(document.getElementById('addBeamN2').value);
            const section = document.getElementById('addBeamSection').value;
            
            if (!model.nodes[n1]) {
                showToast(`Node ${n1} does not exist`, true);
                return;
            }
            if (!model.nodes[n2]) {
                showToast(`Node ${n2} does not exist`, true);
                return;
            }
            if (n1 === n2) {
                showToast('Start and end nodes must be different', true);
                return;
            }
            
            // Check if beam already exists
            const exists = Object.values(model.elements).some(e => 
                (e.n1 === n1 && e.n2 === n2) || (e.n1 === n2 && e.n2 === n1)
            );
            if (exists) {
                showToast('Beam between these nodes already exists', true);
                return;
            }
            
            saveState();
            
            // Find next available beam ID
            let nextId = 1;
            while (model.elements[nextId]) nextId++;
            
            // Add beam
            model.elements[nextId] = {
                id: nextId,
                n1: n1,
                n2: n2,
                section: section,
                grade: 'AH36',
                orientation: 0
            };
            
            // Ensure section exists in library
            layerToSection(section);
            
            updateModelSummary();
            updateModelTables();
            
            if (currentViewMode === '3d') {
                update3DScene();
            } else {
                draw();
            }
            
            showToast(`Beam #${nextId} added: ${n1} → ${n2} (${section})`);
            
            // Select the new beam
            selectBeamById(nextId);
        }
        
        function addBeamFromSelection() {
            if (selectedNodes.size !== 2) {
                showToast('Select exactly 2 nodes to create a beam', true);
                return;
            }
            
            const nodeIds = Array.from(selectedNodes);
            const n1 = Math.min(nodeIds[0], nodeIds[1]);
            const n2 = Math.max(nodeIds[0], nodeIds[1]);
            
            // Update form values
            document.getElementById('addBeamN1').value = n1;
            document.getElementById('addBeamN2').value = n2;
            
            // Call addBeamManual to do the actual work
            addBeamManual();
        }
        
        function removeSelectedBeams() {
            if (selectedElements.size === 0) {
                showToast('Select beams to remove first', true);
                return;
            }
            
            saveState();
            
            let removedCount = 0;
            
            selectedElements.forEach(elemId => {
                if (model.elements[elemId]) {
                    delete model.elements[elemId];
                    removedCount++;
                }
            });
            
            clearSelection();
            updateModelSummary();
            updateModelTables();
            
            if (currentViewMode === '3d') {
                update3DScene();
            } else {
                draw();
            }
            
            showToast(`Removed ${removedCount} beam(s)`);
        }
        
        function updateModelTables() {
            // Update Nodes count
            const nNodes = Object.keys(model.nodes).length;
            const nodesCountEl = document.getElementById('nodesCount');
            if (nodesCountEl) nodesCountEl.textContent = nNodes;
            
            // Update Beams count
            const nBeams = Object.keys(model.elements).length;
            const beamsCountEl = document.getElementById('beamsCount');
            if (beamsCountEl) beamsCountEl.textContent = nBeams;
            
            // Update Sections count
            const sectionsCountEl = document.getElementById('sectionsCount');
            if (sectionsCountEl) sectionsCountEl.textContent = Object.keys(SECTIONS).length;
            
            // Update Nodes table
            const nodesTable = document.getElementById('modelNodesTable');
            if (nodesTable) {
                if (nNodes === 0) {
                    nodesTable.innerHTML = '<tr><td colspan="5" style="color:var(--text-3); text-align:center;">No nodes</td></tr>';
                } else {
                    // Dugumler {0:{x,y,z}} seklinde saklanir: id ANAHTARDIR, ozellik degil.
                    // Object.values ile donup node.id okumak her satirda undefined veriyordu:
                    // ID sutunu "undefined", BC sutunu mesnetli dugumlerde bile "-", secim
                    // vurgusu hic calismiyor ve satira tiklamak selectNodeById(undefined)
                    // cagiriyordu. Hemen asagidaki kiris tablosu zaten dogru kalibi kullaniyor.
                    nodesTable.innerHTML = Object.entries(model.nodes).map(([nodeId, node]) => {
                        const id = parseInt(nodeId);
                        const bc = model.constraints[nodeId];
                        let bcStr = '-';
                        if (bc) {
                            if (typeof bc === 'object') {
                                const constrained = [];
                                if (bc.Ux) constrained.push('Ux');
                                if (bc.Uy) constrained.push('Uy');
                                if (bc.Uz) constrained.push('Uz');
                                if (bc.Rx) constrained.push('Rx');
                                if (bc.Ry) constrained.push('Ry');
                                if (bc.Rz) constrained.push('Rz');
                                bcStr = constrained.length > 0 ? `<span style="color:var(--success);">${constrained.join(',')}</span>` : '-';
                            } else {
                                bcStr = `<span style="color:var(--success);">${bc}</span>`;
                            }
                        }
                        const isSelected = selectedNodes.has(id);
                        return `<tr style="${isSelected ? 'background:rgba(56,189,248,0.2);' : ''} cursor:pointer;"
                                    onclick="selectNodeById(${id})">
                            <td style="color:var(--primary); font-weight:500;">${id}</td>
                            <td>${(node.x * 1000).toFixed(0)}</td>
                            <td>${(node.y * 1000).toFixed(0)}</td>
                            <td>${((node.z || 0) * 1000).toFixed(0)}</td>
                            <td>${bcStr}</td>
                        </tr>`;
                    }).join('');
                }
            }
            
            // Update Beams table
            const beamsTable = document.getElementById('modelBeamsTable');
            if (beamsTable) {
                if (nBeams === 0) {
                    beamsTable.innerHTML = '<tr><td colspan="5" style="color:var(--text-3); text-align:center;">No beams</td></tr>';
                } else {
                    beamsTable.innerHTML = Object.entries(model.elements).map(([id, elem]) => {
                        const elemId = parseInt(id);
                        const n1 = model.nodes[elem.n1];
                        const n2 = model.nodes[elem.n2];
                        let length = 0;
                        if (n1 && n2) {
                            length = Math.sqrt(Math.pow(n2.x - n1.x, 2) + Math.pow(n2.y - n1.y, 2)) * 1000;
                        }
                        const isSelected = selectedElements.has(elemId);
                        return `<tr style="${isSelected ? 'background:rgba(56,189,248,0.2);' : ''}"
                                    onclick="selectBeamById(${elemId})" style="cursor:pointer;">
                            <td style="color:var(--primary); font-weight:500;">${elemId}</td>
                            <td>${elem.n1}</td>
                            <td>${elem.n2}</td>
                            <td style="color:var(--success);">${elem.section || 'HP200x10'}</td>
                            <td>${length.toFixed(0)}</td>
                        </tr>`;
                    }).join('');
                }
            }
        }
        
        function selectNodeById(nodeId) {
            const node = model.nodes[nodeId];
            if (!node) return;
            
            selectedNodes.clear();
            selectedElements.clear();
            selectedNodes.add(nodeId);
            selectedNode = node;
            selectedElement = null;
            
            showNodeDetails(node);
            updateEntityInfoPanel();
            updateModelTables();
            
            if (currentViewMode === '3d') {
                update3DScene();
            } else {
                draw();
            }
        }
        
        function selectBeamById(beamId) {
            const elem = model.elements[beamId];
            if (!elem) return;
            
            selectedNodes.clear();
            selectedElements.clear();
            selectedElements.add(beamId);
            selectedElement = elem;
            selectedNode = null;
            
            showElementDetails(elem);
            updateEntityInfoPanel();
            updateModelTables();
            
            if (currentViewMode === '3d') {
                update3DScene();
            } else {
                draw();
            }
        }

        function updateModelSummary() {
            const nNodes = Object.keys(model.nodes).length;
            const nElems = Object.keys(model.elements).length;
            const nConst = Object.keys(model.constraints).length;
            
            // Count line loads
            let nLineLoads = 0;
            Object.values(model.elements).forEach(e => {
                if (e.lineLoads) nLineLoads += e.lineLoads.length;
            });
            const nPointLoads = model.loads.length;
            
            // Get unique sections used
            const usedSections = new Set();
            Object.values(model.elements).forEach(e => usedSections.add(e.section));
            
            let sectionInfo = '';
            usedSections.forEach(secName => {
                const sec = SECTIONS[secName];
                if (sec && sec.isComposite) {
                    sectionInfo += `<br><span style="color:var(--success);">• ${sec.profileName} + Plate ${sec.plateWidth}×${sec.plateThick}mm</span>`;
                } else if (sec) {
                    sectionInfo += `<br><span style="color:var(--primary);">• ${secName}</span>`;
                }
            });
            
            let loadInfo = '';
            if (nLineLoads > 0) loadInfo += `<br><span style="color:var(--warning);">Line loads: ${nLineLoads}</span>`;
            if (nPointLoads > 0) loadInfo += `<br><span style="color:var(--danger);">Point loads: ${nPointLoads}</span>`;
            
            // Model ozeti karti kaldirildi (sag panel tek kaynak). Eleman hala
            // varsa doldur - baska bir yerden geri konursa calismaya devam etsin.
            const ozet = document.getElementById('modelSummary');
            if (ozet) ozet.innerHTML = 
                `Nodes: ${nNodes} | Elements: ${nElems}<br>` +
                `Constraints: ${nConst}` +
                (sectionInfo ? `<br><strong>Sections:</strong>${sectionInfo}` : '') +
                (loadInfo ? `<br><strong>Loads:</strong>${loadInfo}` : '');
            
            // Update lists if visible
            updateModelLists();
            
            // Update model tables in Model tab
            updateModelTables();
        }
        
        function zoomIn() {
            if (currentViewMode === '3d' && threeControls) {
                // 3D view zoom handled by scroll, but button works too
                // Will be handled by orbit controls
            } else {
                view.scale *= 1.10;
                view.scale = Math.min(2000, view.scale);
                updateZoomLevel();
                draw();
            }
        }
        
        function zoomOut() {
            if (currentViewMode === '3d' && threeControls) {
                // 3D view zoom handled by scroll
            } else {
                view.scale *= 0.90;
                view.scale = Math.max(0.1, view.scale);
                updateZoomLevel();
                draw();
            }
        }
        
        function updateZoomLevel() {
            if (currentViewMode === '3d') {
                document.getElementById('zoomLevel').textContent = '3D';
                return;
            }
            // Show zoom level with appropriate precision
            let zoomPct;
            if (view.scale < 1) {
                zoomPct = view.scale.toFixed(1);
            } else if (view.scale < 10) {
                zoomPct = view.scale.toFixed(1);
            } else {
                zoomPct = Math.round(view.scale);
            }
            document.getElementById('zoomLevel').textContent = zoomPct + '%';
        }
        
        function fitView() {
            const nodes = Object.values(model.nodes);
            if (nodes.length === 0) return;

            // Always use 3D fit since we're always in Three.js mode
            fit3DView();
        }

        // Bos durum katmani kaldirildi: kanvasin ortasinda duruyor ve cizim
        // tiklamalarini yiyordu. Fonksiyon cagiranlar icin duruyor, is yapmiyor.
        function updateEmptyState() { /* katman yok */ }

        // A small deck grillage: 5 m x 3 m on a 1 m grid, simply supported along the short
        // edges, 8 kN/m running along the longitudinals.
        function loadExampleModel() {
            const SEC = 'HP200x10';
            if (!SECTIONS[SEC]) {
                if (typeof currentProfileType !== 'undefined') currentProfileType = 'HP';
                if ($('hpB')) $('hpB').value = 200;
                if ($('hpT')) $('hpT').value = 10;
                if (typeof createProfile === 'function') createProfile();
            }
            const secName = SECTIONS[SEC] ? SEC : Object.keys(SECTIONS)[0];
            if (!secName) {
                showToast('Could not create the example profile', 'error');
                return;
            }

            const NX = 6, NY = 4;            // nodes across / along
            const nodes = {}, elements = {}, constraints = {};
            const id = (i, j) => i * NX + j;
            let e = 0;
            for (let i = 0; i < NY; i++) {
                for (let j = 0; j < NX; j++) nodes[id(i, j)] = { x: j * 1.0, y: i * 1.0, z: 0 };
            }
            for (let i = 0; i < NY; i++) {
                for (let j = 0; j < NX; j++) {
                    if (j + 1 < NX) elements[e++] = {
                        n1: id(i, j), n2: id(i, j + 1), section: secName, orientation: 0,
                        lineLoads: [{ value: 8, startPct: 0, endPct: 100, angle: 90 }]
                    };
                    if (i + 1 < NY) elements[e++] = {
                        n1: id(i, j), n2: id(i + 1, j), section: secName, orientation: 0,
                        lineLoads: []
                    };
                }
            }
            for (let i = 0; i < NY; i++) {
                constraints[id(i, 0)] = { Ux: true, Uy: true, Uz: true, Rx: true, Rz: true };
                constraints[id(i, NX - 1)] = { Ux: true, Uy: true, Uz: true, Rx: true, Rz: true };
            }

            model.nodes = nodes;
            model.elements = elements;
            model.constraints = constraints;
            model.loads = [];
            model.pressure = [];

            if (typeof saveState === 'function') saveState();
            if (typeof updateModelSummary === 'function') updateModelSummary();
            if (typeof updateSectionTable === 'function') updateSectionTable();
            if (typeof updateSectionDropdowns === 'function') updateSectionDropdowns();
            if (typeof refreshView === 'function') refreshView();
            fitView();
            updateEmptyState();
            showToast('Example grillage loaded - press Solve to run it');
        }
        
        // Update 3D when model changes
        function refreshView() {
            // Always use Three.js
            update3DScene();
        }
        
