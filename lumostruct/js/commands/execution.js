        // ============== HANDLE DYNAMIC INPUT ==============
        
        function handleDynamicInput(e) {
            const value = cmdElements.dynInputValue.value.trim();
            
            if (e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                
                // Process the input
                if (cmdState.active === CMD.COPY || cmdState.active === CMD.MOVE) {
                    processDisplacementInput(value);
                } else if (cmdState.active === CMD.ROTATE) {
                    processRotationInput(value);
                } else if (cmdState.active === CMD.SPLIT) {
                    processSplitInput(value);
                }
                
                hideDynamicInput();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                hideDynamicInput();
            } else if (e.key === 'Tab') {
                e.preventDefault();
                // Toggle between X,Y inputs if needed
            }
        }
        
        // Process displacement input (for copy/move)
        function processDisplacementInput(value) {
            if (!cmdState.basePoint) return;
            
            let offsetX = 0, offsetY = 0, offsetZ = 0;
            
            // Parse input
            if (value.includes(',')) {
                // Coordinate format: X,Y
                const parts = value.split(',');
                offsetX = parseFloat(parts[0]) / 1000 || 0; // mm to m
                offsetY = parseFloat(parts[1]) / 1000 || 0;
            } else if (value.includes('<')) {
                // Polar format: distance<angle
                const parts = value.split('<');
                const dist = parseFloat(parts[0]) / 1000 || 0;
                const angle = parseFloat(parts[1]) || 0;
                offsetX = dist * Math.cos(angle * Math.PI / 180);
                offsetY = dist * Math.sin(angle * Math.PI / 180);
            } else {
                // Distance only - use current mouse direction
                const dist = parseFloat(value) / 1000 || 0; // mm to m
                
                if (cmdState.previewData && cmdState.previewData.direction) {
                    offsetX = dist * cmdState.previewData.direction.x;
                    offsetY = dist * cmdState.previewData.direction.y;
                    offsetZ = dist * (cmdState.previewData.direction.z || 0);
                } else {
                    // Default to X direction
                    offsetX = dist;
                }
            }
            
            // Execute the command
            if (cmdState.active === CMD.COPY) {
                executeCopyWithOffset(offsetX, offsetY, offsetZ);
            } else if (cmdState.active === CMD.MOVE) {
                executeMoveWithOffset(offsetX, offsetY, offsetZ);
            }
        }
        
        // Process rotation input
        function processRotationInput(value) {
            if (!cmdState.basePoint) return;
            
            // Check for copy mode
            if (value.toUpperCase() === 'C') {
                cmdState.keepOriginal = true;
                showToast('Rotate with Copy');
                return;
            }
            
            const angle = parseFloat(value) || 0;
            
            if (cmdState.keepOriginal) {
                executeRotateCopy(angle);
            } else {
                executeRotate(angle);
            }
        }
        
        // Process split input
        function processSplitInput(value) {
            const upper = value.toUpperCase();
            const EPSILON = 0.0001;
            
            // X1500 / Y2000 / Z3000: o koordinattan gecen HER kirisi orada boler.
            // Z eklendi (kolonlar), ve bolme dugumu kirisin kotasini tasir -
            // splitBeamAtRatio z'siz dugum kuruyordu, z=3'teki kiris X1500'de
            // zemine inen iki parcaya donusuyordu.
            const eksenM = upper.match(/^([XYZ])\s*(-?\d+(?:\.\d+)?)$/);
            if (eksenM) {
                const eksen = eksenM[1].toLowerCase();
                const coord = parseFloat(eksenM[2]) / 1000; // mm to m
                const oku = n => eksen === 'z' ? (n.z || 0) : n[eksen];
                const beamsToSplit = [];

                Object.entries(model.elements).forEach(([id, beam]) => {
                    const n1 = model.nodes[beam.n1], n2 = model.nodes[beam.n2];
                    if (!n1 || !n2) return;
                    const a1 = oku(n1), a2 = oku(n2);
                    const lo = Math.min(a1, a2), hi = Math.max(a1, a2);
                    if (coord > lo + EPSILON && coord < hi - EPSILON) {
                        const t = (coord - a1) / (a2 - a1);
                        if (t > EPSILON && t < 1 - EPSILON) beamsToSplit.push({ id: parseInt(id), t });
                    }
                });

                if (beamsToSplit.length > 0) {
                    saveState();
                    beamsToSplit.forEach(b => splitBeamAtRatio(b.id, b.t));
                    showToast(`Split ${beamsToSplit.length} beam(s) at ${eksenM[1]}=${coord*1000} mm`);
                    if (currentViewMode === '3d') update3DScene();
                    else draw();
                    updatePropertiesPanel();
                } else {
                    showToast(`No beams cross ${eksenM[1]}=${coord*1000} mm`, 'warning');
                }
                return;
            }

            // Percentage: 50% 
            if (upper.includes('%')) {
                const ratio = parseFloat(upper.replace('%', '')) / 100;
                if (ratio > 0 && ratio < 1) {
                    executeSplitAtRatio(ratio);
                }
                return;
            }
            
            if (upper === 'R' || upper.startsWith('R')) {
                // Ratio mode
                const ratio = parseFloat(value.substring(1)) || 0.5;
                executeSplitAtRatio(ratio);
            } else if (upper === 'D' || upper.startsWith('D')) {
                // Distance mode
                const dist = parseFloat(value.substring(1)) / 1000 || 0.5;
                executeSplitAtDistance(dist);
            } else if (upper === 'P' || upper.startsWith('P')) {
                // Parts mode
                const parts = parseInt(value.substring(1)) || 2;
                executeSplitIntoParts(parts);
            } else {
                // Try as ratio
                const ratio = parseFloat(value);
                if (!isNaN(ratio) && ratio > 0 && ratio < 1) {
                    executeSplitAtRatio(ratio);
                } else if (!isNaN(ratio) && ratio >= 1 && ratio <= 100) {
                    // Treat as percentage
                    executeSplitAtRatio(ratio / 100);
                }
            }
        }
        
        // Split beam at ratio (helper for X/Y split)
        function splitBeamAtRatio(beamId, t) {
            const beam = model.elements[beamId];
            if (!beam) return;
            
            const n1 = model.nodes[beam.n1], n2 = model.nodes[beam.n2];
            const z1 = n1.z || 0, z2 = n2.z || 0;
            const sx = n1.x + (n2.x - n1.x) * t, sy = n1.y + (n2.y - n1.y) * t, sz = z1 + (z2 - z1) * t;
            // Ayni yerde dugum varsa (baska bir bolmeden) onu kullan.
            let newNodeId = (typeof findNodeAtLocation === 'function') ? findNodeAtLocation(sx, sy, sz) : null;
            if (newNodeId === null || newNodeId === undefined) {
                newNodeId = nextNodeId++;
                model.nodes[newNodeId] = { x: sx, y: sy, z: sz };
            }
            
            const section = beam.section;
            const origN1 = beam.n1, origN2 = beam.n2;
            delete model.elements[beamId];
            
            const id1 = nextElementId++;
            model.elements[id1] = { n1: origN1, n2: newNodeId, section };
            
            const id2 = nextElementId++;
            model.elements[id2] = { n1: newNodeId, n2: origN2, section };
        }
        
        // Process mirror confirm
        function processMirrorConfirm(value) {
            const upper = value.toUpperCase();
            if (upper === 'Y' || upper === 'YES') {
                cmdState.keepOriginal = false;
            }
            executeMirrorCommand();
        }
        
        // ============== COMMAND EXECUTION FUNCTIONS ==============
        
        // Execute Copy with offset (simplified like test file)
        // offsetZ eklendi: XZ/YZ duzleminde kopyalama Z'de olur.
        function executeCopyWithOffset(offsetX, offsetY, offsetZ = 0) {
            if (cmdState.selectedBeamIds.length === 0) {
                showToast('No beams selected', 'warning');
                cancelCommand();
                return;
            }
            
            saveState();
            
            const nodeMap = {};
            const newBeamIds = [];
            
            // Collect nodes from beams
            const nodesToCopy = new Set();
            cmdState.selectedBeamIds.forEach(elemId => {
                const elem = model.elements[elemId];
                if (elem) {
                    nodesToCopy.add(elem.n1);
                    nodesToCopy.add(elem.n2);
                }
            });
            
            // Create new nodes at offset positions
            nodesToCopy.forEach(oldNodeId => {
                const oldNode = model.nodes[oldNodeId];
                if (oldNode) {
                    const newId = nextNodeId++;
                    model.nodes[newId] = { id: newId, x: oldNode.x + offsetX, y: oldNode.y + offsetY,
                                               z: (oldNode.z || 0) + offsetZ };
                    nodeMap[oldNodeId] = newId;
                }
            });
            
            // Create new beams (simple, without checking intersections first)
            cmdState.selectedBeamIds.forEach(oldElemId => {
                const oldElem = model.elements[oldElemId];
                if (oldElem && nodeMap[oldElem.n1] && nodeMap[oldElem.n2]) {
                    const newId = nextElementId++;
                    model.elements[newId] = { 
                        id: newId, 
                        n1: nodeMap[oldElem.n1], 
                        n2: nodeMap[oldElem.n2], 
                        section: oldElem.section,
                        orientation: oldElem.orientation || 0
                    };
                    newBeamIds.push(newId);
                }
            });
            
            // Auto-split at intersections (this handles both cross and endpoint splits)
            autoSplitAtIntersections(newBeamIds);
            
            const distMM = Math.sqrt(offsetX * offsetX + offsetY * offsetY + offsetZ * offsetZ) * 1000;
            showToast(`Copied ${cmdState.selectedBeamIds.length} beam(s) (${distMM.toFixed(0)}mm)`);
            
            // End command
            cancelCommand();
            
            results = null;
            if (currentViewMode === '3d') update3DScene();
            else draw();
            updateEntityInfoPanel();
        }
        
        // Execute Move with offset
        // offsetZ eklendi: XZ/YZ duzleminde tasima Z'de olur.
        function executeMoveWithOffset(offsetX, offsetY, offsetZ = 0) {
            if (cmdState.selectedBeamIds.length === 0) {
                showToast('No beams selected', 'warning');
                cancelCommand();
                return;
            }
            
            saveState();
            
            // Collect nodes from beams
            const nodesToMove = new Set();
            cmdState.selectedBeamIds.forEach(elemId => {
                const elem = model.elements[elemId];
                if (elem) {
                    nodesToMove.add(elem.n1);
                    nodesToMove.add(elem.n2);
                }
            });
            
            // Move nodes
            nodesToMove.forEach(nodeId => {
                const node = model.nodes[nodeId];
                if (node) {
                    node.x += offsetX;
                    node.y += offsetY;
                    node.z = (node.z || 0) + offsetZ;
                }
            });
            
            results = null;
            if (currentViewMode === '3d') update3DScene();
            else draw();
            
            updateEntityInfoPanel();
            
            const distMM = Math.sqrt(offsetX * offsetX + offsetY * offsetY + offsetZ * offsetZ) * 1000;
            showToast(`Moved ${cmdState.selectedBeamIds.length} beams (${distMM.toFixed(0)}mm)`);
            
            cancelCommand();
        }
        
        // Execute Rotate
        function executeRotate(angleDeg) {
            if (cmdState.selectedBeamIds.length === 0 || !cmdState.basePoint) {
                showToast('Invalid rotation', 'warning');
                cancelCommand();
                return;
            }
            
            saveState();
            
            const angleRad = angleDeg * Math.PI / 180;
            const cx = cmdState.basePoint.x;
            const cy = cmdState.basePoint.y;
            
            // Collect nodes from beams
            const nodesToRotate = new Set();
            cmdState.selectedBeamIds.forEach(elemId => {
                const elem = model.elements[elemId];
                if (elem) {
                    nodesToRotate.add(elem.n1);
                    nodesToRotate.add(elem.n2);
                }
            });
            
            // Rotate nodes around center point
            nodesToRotate.forEach(nodeId => {
                const node = model.nodes[nodeId];
                if (node) {
                    const dx = node.x - cx;
                    const dy = node.y - cy;
                    node.x = cx + dx * Math.cos(angleRad) - dy * Math.sin(angleRad);
                    node.y = cy + dx * Math.sin(angleRad) + dy * Math.cos(angleRad);
                }
            });
            
            results = null;
            if (currentViewMode === '3d') update3DScene();
            else draw();
            
            updateEntityInfoPanel();
            showToast(`Rotated ${cmdState.selectedBeamIds.length} beams by ${angleDeg}°`);
            
            cancelCommand();
        }
        
        // Execute Rotate with Copy
        function executeRotateCopy(angleDeg) {
            if (cmdState.selectedBeamIds.length === 0 || !cmdState.basePoint) {
                showToast('Invalid rotation', 'warning');
                cancelCommand();
                return;
            }
            
            saveState();
            
            const angleRad = angleDeg * Math.PI / 180;
            const cx = cmdState.basePoint.x;
            const cy = cmdState.basePoint.y;
            
            const nodeMap = {};
            const newBeamIds = [];
            
            // Collect nodes from beams
            const nodesToRotate = new Set();
            cmdState.selectedBeamIds.forEach(elemId => {
                const elem = model.elements[elemId];
                if (elem) {
                    nodesToRotate.add(elem.n1);
                    nodesToRotate.add(elem.n2);
                }
            });
            
            // Create rotated nodes
            nodesToRotate.forEach(oldNodeId => {
                const oldNode = model.nodes[oldNodeId];
                if (oldNode) {
                    const dx = oldNode.x - cx;
                    const dy = oldNode.y - cy;
                    const newX = cx + dx * Math.cos(angleRad) - dy * Math.sin(angleRad);
                    const newY = cy + dx * Math.sin(angleRad) + dy * Math.cos(angleRad);
                    // Dondurme XY duzleminde; kot degismez ama KORUNMALI.
                    const newZ = (typeof oldNode.z === 'number' && isFinite(oldNode.z)) ? oldNode.z : 0;

                    const existingNodeId = findNodeAtLocation(newX, newY, newZ);
                    if (existingNodeId !== null) {
                        nodeMap[oldNodeId] = existingNodeId;
                    } else {
                        const newId = nextNodeId++;
                        model.nodes[newId] = { id: newId, x: newX, y: newY, z: newZ };
                        nodeMap[oldNodeId] = newId;
                    }
                }
            });
            
            // Create rotated beams
            cmdState.selectedBeamIds.forEach(oldElemId => {
                const oldElem = model.elements[oldElemId];
                if (oldElem) {
                    const newIds = createBeamWithIntersections(
                        nodeMap[oldElem.n1],
                        nodeMap[oldElem.n2],
                        oldElem.section,
                        oldElem.orientation || 0
                    );
                    newBeamIds.push(...newIds);
                }
            });
            
            // Select new elements
            clearSelection();
            newBeamIds.forEach(id => selectedElements.add(id));
            
            results = null;
            if (currentViewMode === '3d') update3DScene();
            else draw();
            
            updateEntityInfoPanel();
            showToast(`Created ${newBeamIds.length} rotated copies (${angleDeg}°)`);
            
            cancelCommand();
        }
        
        // Execute Mirror Command
        function executeMirrorCommand() {
            if (cmdState.selectedBeamIds.length === 0 || !cmdState.basePoint || !cmdState.secondPoint) {
                showToast('Invalid mirror operation', 'warning');
                cancelCommand();
                return;
            }
            
            saveState();
            
            // Mirror line defined by two points
            const p1 = cmdState.basePoint;
            const p2 = cmdState.secondPoint;
            
            // Line direction
            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            const len = Math.sqrt(dx * dx + dy * dy);
            if (len < 0.001) {
                showToast('Mirror line too short', 'warning');
                cancelCommand();
                return;
            }
            
            // Unit vector along line
            const ux = dx / len;
            const uy = dy / len;
            
            const nodeMap = {};
            const newBeamIds = [];
            
            // Collect nodes from beams
            const nodesToMirror = new Set();
            cmdState.selectedBeamIds.forEach(elemId => {
                const elem = model.elements[elemId];
                if (elem) {
                    nodesToMirror.add(elem.n1);
                    nodesToMirror.add(elem.n2);
                }
            });
            
            // Mirror each node
            nodesToMirror.forEach(oldNodeId => {
                const oldNode = model.nodes[oldNodeId];
                if (oldNode) {
                    // Vector from p1 to node
                    const vx = oldNode.x - p1.x;
                    const vy = oldNode.y - p1.y;
                    
                    // Project onto line
                    const dot = vx * ux + vy * uy;
                    const projX = p1.x + dot * ux;
                    const projY = p1.y + dot * uy;
                    
                    // Mirror point
                    const newX = 2 * projX - oldNode.x;
                    const newY = 2 * projY - oldNode.y;
                    // Ayna dogrusu XY duzleminde; kot degismez ama KORUNMALI.
                    const newZ = (typeof oldNode.z === 'number' && isFinite(oldNode.z)) ? oldNode.z : 0;

                    const existingNodeId = findNodeAtLocation(newX, newY, newZ);
                    if (existingNodeId !== null) {
                        nodeMap[oldNodeId] = existingNodeId;
                    } else {
                        const newId = nextNodeId++;
                        model.nodes[newId] = { id: newId, x: newX, y: newY, z: newZ };
                        nodeMap[oldNodeId] = newId;
                    }
                }
            });
            
            // Create mirrored beams
            cmdState.selectedBeamIds.forEach(oldElemId => {
                const oldElem = model.elements[oldElemId];
                if (oldElem) {
                    const newIds = createBeamWithIntersections(
                        nodeMap[oldElem.n1],
                        nodeMap[oldElem.n2],
                        oldElem.section,
                        oldElem.orientation || 0
                    );
                    newBeamIds.push(...newIds);
                }
            });
            
            // Delete originals if requested
            if (!cmdState.keepOriginal) {
                cmdState.selectedBeamIds.forEach(id => delete model.elements[id]);
                // Clean up orphan nodes
                nodesToMirror.forEach(nodeId => {
                    const usedByOther = Object.values(model.elements).some(elem => 
                        elem.n1 === nodeId || elem.n2 === nodeId
                    );
                    if (!usedByOther) delete model.nodes[nodeId];
                });
            }
            
            // Select new elements
            clearSelection();
            newBeamIds.forEach(id => selectedElements.add(id));
            
            results = null;
            if (currentViewMode === '3d') update3DScene();
            else draw();
            
            updateEntityInfoPanel();
            showToast(`Mirrored ${newBeamIds.length} beams`);
            
            cancelCommand();
        }
        
        // Execute Split at ratio
        function executeSplitAtRatio(ratio) {
            if (!cmdState.hoverBeam) {
                showToast('Select a beam first', 'warning');
                return;
            }
            
            const elemId = cmdState.hoverBeam;
            const elem = model.elements[elemId];
            if (!elem) return;
            
            saveState();
            
            const n1 = model.nodes[elem.n1];
            const n2 = model.nodes[elem.n2];
            if (!n1 || !n2) return;
            
            ratio = Math.max(0.01, Math.min(0.99, ratio));
            
            // Create split point
            const z1 = (typeof n1.z === 'number' && isFinite(n1.z)) ? n1.z : 0;
            const z2 = (typeof n2.z === 'number' && isFinite(n2.z)) ? n2.z : 0;
            const splitX = n1.x + (n2.x - n1.x) * ratio;
            const splitY = n1.y + (n2.y - n1.y) * ratio;
            const splitZ = z1 + (z2 - z1) * ratio;

            const existingNodeId = findNodeAtLocation(splitX, splitY, splitZ);
            let splitNodeId;

            if (existingNodeId !== null) {
                splitNodeId = existingNodeId;
            } else {
                splitNodeId = nextNodeId++;
                model.nodes[splitNodeId] = { id: splitNodeId, x: splitX, y: splitY, z: splitZ };
            }
            
            // Create two new beams
            const newElem1Id = nextElementId++;
            model.elements[newElem1Id] = {
                id: newElem1Id,
                n1: elem.n1,
                n2: splitNodeId,
                section: elem.section,
                orientation: elem.orientation || 0,
                lineLoads: []
            };
            
            const newElem2Id = nextElementId++;
            model.elements[newElem2Id] = {
                id: newElem2Id,
                n1: splitNodeId,
                n2: elem.n2,
                section: elem.section,
                orientation: elem.orientation || 0,
                lineLoads: []
            };
            
            // Delete original beam
            delete model.elements[elemId];
            
            // Select new elements
            clearSelection();
            selectedElements.add(newElem1Id);
            selectedElements.add(newElem2Id);
            
            results = null;
            if (currentViewMode === '3d') update3DScene();
            else draw();
            
            updateEntityInfoPanel();
            showToast(`Split at ${(ratio * 100).toFixed(0)}%`);
            
            // Stay in split mode
            cmdState.hoverBeam = null;
            updateCommandUI();
        }
        
        // Execute Split at distance
        function executeSplitAtDistance(distance) {
            if (!cmdState.hoverBeam) {
                showToast('Select a beam first', 'warning');
                return;
            }
            
            const elemId = cmdState.hoverBeam;
            const elem = model.elements[elemId];
            if (!elem) return;
            
            const n1 = model.nodes[elem.n1];
            const n2 = model.nodes[elem.n2];
            if (!n1 || !n2) return;
            
            // Gercek (3B) boy: kolonda 2B boy sifir, oran sonsuz cikiyordu.
            const length = Math.sqrt((n2.x - n1.x) ** 2 + (n2.y - n1.y) ** 2 + ((n2.z || 0) - (n1.z || 0)) ** 2);
            if (length < 1e-9) return;
            const ratio = Math.min(distance / length, 0.99);
            
            executeSplitAtRatio(ratio);
        }
        
        // Execute Split into parts
        function executeSplitIntoParts(parts) {
            if (!cmdState.hoverBeam || parts < 2) {
                showToast('Invalid split', 'warning');
                return;
            }
            
            const elemId = cmdState.hoverBeam;
            const elem = model.elements[elemId];
            if (!elem) return;
            
            saveState();
            
            const n1 = model.nodes[elem.n1];
            const n2 = model.nodes[elem.n2];
            if (!n1 || !n2) return;
            
            const z1 = (typeof n1.z === 'number' && isFinite(n1.z)) ? n1.z : 0;
            const z2 = (typeof n2.z === 'number' && isFinite(n2.z)) ? n2.z : 0;
            const dx = n2.x - n1.x;
            const dy = n2.y - n1.y;
            const dz = z2 - z1;

            // Create split nodes
            const splitNodes = [];
            for (let i = 1; i < parts; i++) {
                const ratio = i / parts;
                const x = n1.x + dx * ratio;
                const y = n1.y + dy * ratio;
                const z = z1 + dz * ratio;

                const existing = findNodeAtLocation(x, y, z);
                if (existing !== null) {
                    splitNodes.push(existing);
                } else {
                    const newId = nextNodeId++;
                    model.nodes[newId] = { id: newId, x, y, z };
                    splitNodes.push(newId);
                }
            }
            
            // Create new beams
            const newBeamIds = [];
            let prevNodeId = elem.n1;
            
            splitNodes.forEach(nodeId => {
                const newElemId = nextElementId++;
                model.elements[newElemId] = {
                    id: newElemId,
                    n1: prevNodeId,
                    n2: nodeId,
                    section: elem.section,
                    orientation: elem.orientation || 0,
                    lineLoads: []
                };
                newBeamIds.push(newElemId);
                prevNodeId = nodeId;
            });
            
            // Last segment
            const lastElemId = nextElementId++;
            model.elements[lastElemId] = {
                id: lastElemId,
                n1: prevNodeId,
                n2: elem.n2,
                section: elem.section,
                orientation: elem.orientation || 0,
                lineLoads: []
            };
            newBeamIds.push(lastElemId);
            
            // Delete original
            delete model.elements[elemId];
            
            // Select new elements
            clearSelection();
            newBeamIds.forEach(id => selectedElements.add(id));
            
            results = null;
            if (currentViewMode === '3d') update3DScene();
            else draw();
            
            updateEntityInfoPanel();
            showToast(`Split into ${parts} segments`);
            
            cancelCommand();
        }
        
        // Execute Split at click point
        function executeSplitAtClick() {
            if (!cmdState.hoverBeam || !cmdState.hoverPoint) {
                return;
            }
            
            executeSplitAtRatio(cmdState.hoverPoint.ratio);
        }
        
        // Ray-segment intersection helper for EXTEND
        function raySegmentIntersect(origin, direction, segStart, segEnd) {
            const EPSILON = 0.0001;
            const dx = segEnd.x - segStart.x, dy = segEnd.y - segStart.y;
            const denom = direction.x * dy - direction.y * dx;
            if (Math.abs(denom) < 1e-10) return null;
            const t = ((segStart.x - origin.x) * dy - (segStart.y - origin.y) * dx) / denom;
            const u = ((segStart.x - origin.x) * direction.y - (segStart.y - origin.y) * direction.x) / denom;
            if (t > EPSILON && u >= 0 && u <= 1) {
                return { x: origin.x + t * direction.x, y: origin.y + t * direction.y, t, u };
            }
            return null;
        }
        
        // Calculate extend preview (like test file)
        function calcExtendPreview(info) {
            const EPSILON = 0.0001;
            const e = model.elements[info.elemId]; 
            if (!e) return null;
            const n1 = model.nodes[e.n1], n2 = model.nodes[e.n2];
            const endNode = model.nodes[info.nodeId];
            const otherNode = info.isN1 ? n2 : n1;
            const len = Math.sqrt((endNode.x - otherNode.x)**2 + (endNode.y - otherNode.y)**2);
            if (len < EPSILON) return null;
            const dir = { x: (endNode.x - otherNode.x) / len, y: (endNode.y - otherNode.y) / len };
            let bestInter = null, bestDist = Infinity, bestOtherId = null;
            Object.entries(model.elements).forEach(([id, other]) => {
                if (+id === info.elemId) return;
                const on1 = model.nodes[other.n1], on2 = model.nodes[other.n2];
                if (!on1 || !on2) return;
                const inter = raySegmentIntersect(endNode, dir, on1, on2);
                if (inter && inter.t > EPSILON && inter.t < bestDist) {
                    bestDist = inter.t;
                    bestInter = { x: inter.x, y: inter.y, dist: inter.t, u: inter.u };
                    bestOtherId = +id;
                }
            });
            if (bestInter) bestInter.otherElemId = bestOtherId;
            return bestInter;
        }
        
        // Execute Extend (like test file - creates new beam and splits target)
        function executeExtendBeam(info) {
            const result = calcExtendPreview(info);
            if (!result) { showToast('No intersection', 'warning'); return; }
            
            saveState();
            const e = model.elements[info.elemId]; 
            if (!e) return;
            
            // Create node at intersection
            const newNodeId = nextNodeId++;
            model.nodes[newNodeId] = { id: newNodeId, x: result.x, y: result.y };
            
            // Create new beam from end to intersection
            const newBeamId = nextElementId++;
            model.elements[newBeamId] = { 
                id: newBeamId, 
                n1: info.nodeId, 
                n2: newNodeId, 
                section: e.section 
            };
            
            // Split the target beam at intersection
            const otherElem = model.elements[result.otherElemId];
            if (otherElem) {
                const on1 = model.nodes[otherElem.n1], on2 = model.nodes[otherElem.n2];
                const d1 = Math.sqrt((result.x - on1.x)**2 + (result.y - on1.y)**2);
                const d2 = Math.sqrt((result.x - on2.x)**2 + (result.y - on2.y)**2);
                if (d1 > 0.001 && d2 > 0.001) {
                    // Split target beam
                    const oSection = otherElem.section;
                    delete model.elements[result.otherElemId];
                    const id1 = nextElementId++; 
                    model.elements[id1] = { id: id1, n1: otherElem.n1, n2: newNodeId, section: oSection };
                    const id2 = nextElementId++; 
                    model.elements[id2] = { id: id2, n1: newNodeId, n2: otherElem.n2, section: oSection };
                    showToast(`Extended ${(result.dist*1000).toFixed(0)} mm + split`);
                } else {
                    // Intersection is at existing node
                    delete model.nodes[newNodeId];
                    model.elements[newBeamId].n2 = d1 < 0.001 ? otherElem.n1 : otherElem.n2;
                    showToast(`Extended to node`);
                }
            }
            
            results = null;
            if (currentViewMode === '3d') update3DScene();
            else draw();
            updateEntityInfoPanel();
        }
        
        // Execute Trim
        function executeTrimBeam(elemId, clickX, clickY) {
            const elem = model.elements[elemId];
            if (!elem) return;
            
            const n1 = model.nodes[elem.n1];
            const n2 = model.nodes[elem.n2];
            if (!n1 || !n2) return;
            
            // Find all intersections with cutting edges
            const intersections = [];
            
            const cutters = cmdState.boundaryEdges.length > 0 
                ? cmdState.boundaryEdges 
                : Object.keys(model.elements).map(id => parseInt(id)).filter(id => id !== elemId);
            
            cutters.forEach(cutterId => {
                if (cutterId === elemId) return;
                
                const cutter = model.elements[cutterId];
                if (!cutter) return;
                
                const cn1 = model.nodes[cutter.n1];
                const cn2 = model.nodes[cutter.n2];
                if (!cn1 || !cn2) return;
                
                const intersection = lineLineIntersection(
                    n1.x, n1.y, n2.x, n2.y,
                    cn1.x, cn1.y, cn2.x, cn2.y
                );
                
                if (intersection && intersection.t1 > 0.01 && intersection.t1 < 0.99 &&
                    intersection.t2 >= 0 && intersection.t2 <= 1) {
                    intersections.push({
                        t: intersection.t1,
                        x: intersection.x,
                        y: intersection.y
                    });
                }
            });
            
            if (intersections.length === 0) {
                showToast('No cutting edge intersection', 'warning');
                return;
            }
            
            // Sort intersections by t
            intersections.sort((a, b) => a.t - b.t);
            
            // Determine which side was clicked
            const dx = n2.x - n1.x;
            const dy = n2.y - n1.y;
            const len = Math.sqrt(dx * dx + dy * dy);
            
            const clickT = ((clickX - n1.x) * dx + (clickY - n1.y) * dy) / (len * len);
            
            saveState();
            
            // Find which segment contains the click
            let keepStart = 0;
            let keepEnd = 1;
            
            for (let i = 0; i < intersections.length; i++) {
                if (clickT < intersections[i].t) {
                    // Click is before this intersection
                    keepStart = i > 0 ? intersections[i - 1].t : 0;
                    keepEnd = intersections[i].t;
                    break;
                }
                if (i === intersections.length - 1) {
                    // Click is after all intersections
                    keepStart = intersections[i].t;
                    keepEnd = 1;
                }
            }
            
            // Determine which part to remove
            // If click is closer to start, remove start portion
            // If click is closer to end, remove end portion
            let trimFromStart = clickT < 0.5;
            
            if (intersections.length === 1) {
                // Single intersection - remove the clicked side
                const intT = intersections[0].t;
                
                // Create node at intersection
                // Kesisim artik z de tasiyor (findIntersectionsWithExistingBeams
                // uc boyutlu kontrol yapiyor), dugum de tasisin.
                let intNodeId = findNodeAtLocation(intersections[0].x, intersections[0].y, intersections[0].z);
                if (intNodeId === null) {
                    intNodeId = nextNodeId++;
                    model.nodes[intNodeId] = { id: intNodeId, x: intersections[0].x, y: intersections[0].y, z: intersections[0].z || 0 };
                }
                
                if (clickT < intT) {
                    // Remove start portion
                    const oldN1 = elem.n1;
                    elem.n1 = intNodeId;
                    
                    // Clean up
                    const oldUsed = Object.values(model.elements).some(e => e.n1 === oldN1 || e.n2 === oldN1);
                    if (!oldUsed) delete model.nodes[oldN1];
                } else {
                    // Remove end portion
                    const oldN2 = elem.n2;
                    elem.n2 = intNodeId;
                    
                    // Clean up
                    const oldUsed = Object.values(model.elements).some(e => e.n1 === oldN2 || e.n2 === oldN2);
                    if (!oldUsed) delete model.nodes[oldN2];
                }
            } else {
                // Multiple intersections - more complex
                // For simplicity, remove the segment containing the click
                delete model.elements[elemId];
                
                // Create beams for non-clicked segments
                let prevNodeId = elem.n1;
                intersections.forEach((int, i) => {
                    let intNodeId = findNodeAtLocation(int.x, int.y, int.z);
                    if (intNodeId === null) {
                        intNodeId = nextNodeId++;
                        model.nodes[intNodeId] = { id: intNodeId, x: int.x, y: int.y, z: int.z || 0 };
                    }
                    
                    // Check if this segment contains the click
                    const segStart = i === 0 ? 0 : intersections[i - 1].t;
                    const segEnd = int.t;
                    
                    if (!(clickT >= segStart && clickT <= segEnd)) {
                        // Keep this segment
                        const newId = nextElementId++;
                        model.elements[newId] = {
                            id: newId,
                            n1: prevNodeId,
                            n2: intNodeId,
                            section: elem.section,
                            orientation: elem.orientation || 0,
                            lineLoads: []
                        };
                    }
                    
                    prevNodeId = intNodeId;
                });
                
                // Last segment
                const lastSegStart = intersections[intersections.length - 1].t;
                if (!(clickT >= lastSegStart && clickT <= 1)) {
                    const newId = nextElementId++;
                    model.elements[newId] = {
                        id: newId,
                        n1: prevNodeId,
                        n2: elem.n2,
                        section: elem.section,
                        orientation: elem.orientation || 0,
                        lineLoads: []
                    };
                }
            }
            
            results = null;
            if (currentViewMode === '3d') update3DScene();
            else draw();
            
            showToast('Beam trimmed');
        }
        
        // Line-line intersection helper
        function lineLineIntersection(x1, y1, x2, y2, x3, y3, x4, y4) {
            const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
            if (Math.abs(denom) < 0.0001) return null;
            
            const t1 = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
            const t2 = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;
            
            return {
                t1: t1,
                t2: t2,
                x: x1 + t1 * (x2 - x1),
                y: y1 + t1 * (y2 - y1)
            };
        }
        
        // Clear command preview
        function clearCommandPreview() {
            // Clear 3D preview objects
            clearPreview3D();
            cmdState.previewData = null;
        }
        
