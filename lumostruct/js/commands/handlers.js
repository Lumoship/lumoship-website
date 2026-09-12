        // ============== KEYBOARD HANDLER FOR COMMANDS ==============
        
        // Add command shortcuts to existing keydown handler
        const originalKeyHandler = document.onkeydown;
        
        document.addEventListener('keydown', function(e) {
            // Skip if in input fields (except command input)
            const isCmdInput = e.target.id === 'cmdInput' || e.target.id === 'dynInputValue';
            if ((e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') && !isCmdInput) {
                return;
            }
            
            // Ctrl+Z: Undo
            if (e.ctrlKey && (e.key === 'z' || e.key === 'Z')) {
                e.preventDefault();
                e.stopPropagation();
                undo();
                return;
            }
            
            // Ctrl+Y: Redo
            if (e.ctrlKey && (e.key === 'y' || e.key === 'Y')) {
                e.preventDefault();
                e.stopPropagation();
                redo();
                return;
            }
            
            // F8: Toggle Ortho
            if (e.key === 'F8') {
                e.preventDefault();
                e.stopPropagation();
                toggleOrthoMode();
                return;
            }
            
            // F3: Toggle Snap
            if (e.key === 'F3') {
                e.preventDefault();
                e.stopPropagation();
                toggleSnapMode();
                return;
            }
            
            // ESC: Cancel command
            if (e.key === 'Escape') {
                if (cmdState.active !== CMD.NONE) {
                    e.preventDefault();
                    e.stopPropagation();
                    cancelCommand();
                    return;
                }
            }
            
            // Enter or Space: Process input or confirm
            if (e.key === 'Enter' || e.key === ' ') {
                // If cmdInput is focused, let handleCommandInput handle it
                if (document.activeElement && document.activeElement.id === 'cmdInput') {
                    return; // handleCommandInput will process this
                }
                
                e.preventDefault();
                e.stopPropagation();
                
                // Blur any focused button
                if (document.activeElement && document.activeElement.tagName === 'BUTTON') {
                    document.activeElement.blur();
                }
                
                const input = cmdElements.input;
                const val = input ? input.value.trim() : '';
                const valUpper = val.toUpperCase();
                
                if (val) {
                    // Process input value based on command
                    if (cmdState.active === CMD.NONE) {
                        startCommand(valUpper);
                    }
                    else if (cmdState.active === CMD.LINE) {
                        // LINE command - process coordinate or distance
                        // Try coordinate format: X,Y or X,Y,Z (mm)
                        const coordMatch = val.match(/^(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)(?:\s*[,;\s]\s*(-?\d+(?:\.\d+)?))?$/);
                        if (coordMatch) {
                            const x = parseFloat(coordMatch[1]) / 1000;
                            const y = parseFloat(coordMatch[2]) / 1000;
                            const z = coordMatch[3] !== undefined ? parseFloat(coordMatch[3]) / 1000 : 0;
                            
                            cmdState.linePoints.push({ x, y, z });
                            
                            if (cmdState.linePoints.length >= 2) {
                                saveState();
                                const pts = cmdState.linePoints;
                                const p1 = pts[pts.length - 2];
                                const p2 = pts[pts.length - 1];
                                
                                // Update direction for next distance input
                                const ddx = p2.x - p1.x;
                                const ddy = p2.y - p1.y;
                                const dlen = Math.sqrt(ddx*ddx + ddy*ddy);
                                if (dlen > 0.001) {
                                    cmdState.lastCursorDir = { x: ddx/dlen, y: ddy/dlen };
                                }
                                
                                let n1Id = findNodeAt(p1.x, p1.y, 0.01, p1.z || 0);
                                if (!n1Id) { n1Id = nextNodeId++; model.nodes[n1Id] = { x: p1.x, y: p1.y, z: p1.z || 0 }; }
                                
                                let n2Id = findNodeAt(p2.x, p2.y, 0.01, p2.z || 0);
                                if (!n2Id) { n2Id = nextNodeId++; model.nodes[n2Id] = { x: p2.x, y: p2.y, z: p2.z || 0 }; }
                                
                                const beamId = nextElementId++;
                                model.elements[beamId] = { n1: n1Id, n2: n2Id, section: (document.getElementById('addBeamSection')?.value) || 'HP200x10' };
                                
                                autoSplitAtIntersections([beamId]);
                                
                                // Force render update
                                if (currentViewMode === '3d') {
                                    update3DScene();
                                    if (threeRenderer && threeScene && threeCamera) {
                                        threeRenderer.render(threeScene, threeCamera);
                                    }
                                } else {
                                    draw();
                                }
                                
                                
                                const distMM = (dlen * 1000).toFixed(0);
                                showToast(`Line: ${distMM} mm → Next point or distance`);
                            } else {
                                // First point - set default direction
                                cmdState.lastCursorDir = { x: 1, y: 0 };
                                if (currentViewMode === '3d') update3DScene();
                                else draw();
                                showToast(`Start: (${(x*1000).toFixed(0)}, ${(y*1000).toFixed(0)}, ${(z*1000).toFixed(0)}) → Next point or distance`);
                            }
                            updateCommandUI();
                        }
                        // Try relative coordinate: @X,Y
                        else if (val.startsWith('@') || val.startsWith('@')) {
                            const relMatch = val.match(/^@(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)$/);
                            if (relMatch && cmdState.linePoints.length > 0) {
                                const lastPt = cmdState.linePoints[cmdState.linePoints.length - 1];
                                const dx = parseFloat(relMatch[1]) / 1000;
                                const dy = parseFloat(relMatch[2]) / 1000;
                                const x = lastPt.x + dx;
                                const y = lastPt.y + dy;
                                
                                // Update direction for next distance input
                                const dlen = Math.sqrt(dx*dx + dy*dy);
                                if (dlen > 0.001) {
                                    cmdState.lastCursorDir = { x: dx/dlen, y: dy/dlen };
                                }
                                
                                const z = lastPt.z || 0;  // stay on the same work plane
                                cmdState.linePoints.push({ x, y, z });
                                
                                saveState();
                                let n1Id = findNodeAt(lastPt.x, lastPt.y, 0.01, lastPt.z || 0);
                                if (!n1Id) { n1Id = nextNodeId++; model.nodes[n1Id] = { x: lastPt.x, y: lastPt.y, z: lastPt.z || 0 }; }
                                
                                let n2Id = findNodeAt(x, y, 0.01, z);
                                if (!n2Id) { n2Id = nextNodeId++; model.nodes[n2Id] = { x: x, y: y, z: z }; }
                                
                                const beamId = nextElementId++;
                                model.elements[beamId] = { n1: n1Id, n2: n2Id, section: (document.getElementById('addBeamSection')?.value) || 'HP200x10' };
                                
                                autoSplitAtIntersections([beamId]);
                                
                                // Force render update
                                if (currentViewMode === '3d') {
                                    update3DScene();
                                    if (threeRenderer && threeScene && threeCamera) {
                                        threeRenderer.render(threeScene, threeCamera);
                                    }
                                } else {
                                    draw();
                                }
                                
                                
                                const distMM = (dlen * 1000).toFixed(0);
                                showToast(`Relative: ${distMM} mm → Next point or distance`);
                                updateCommandUI();
                            }
                        }
                        // Try distance (single number)
                        else {
                            const dist = parseFloat(val);
                            if (!isNaN(dist) && dist > 0 && cmdState.linePoints.length > 0) {
                                processLineDistanceInput(dist);
                            } else if (!isNaN(dist) && dist > 0 && cmdState.linePoints.length === 0) {
                                showToast('First specify a start point', 'warning');
                            }
                        }
                    }
                    else if (cmdState.active === CMD.NODE_MOVE && cmdState.selectedNode) {
                        // NODE_MOVE: Move node to coordinates
                        const node = model.nodes[cmdState.selectedNode];
                        if (node && cmdState.basePoint) {
                            let newX = node.x, newY = node.y;
                            if (val.includes(',')) {
                                const isRel = val.startsWith('@');
                                const parts = val.replace('@', '').split(',');
                                const x = parseFloat(parts[0]) / 1000, y = parseFloat(parts[1]) / 1000;
                                newX = isRel ? cmdState.basePoint.x + x : x;
                                newY = isRel ? cmdState.basePoint.y + y : y;
                            }
                            saveState();
                            node.x = newX; node.y = newY;
                            showToast(`Node → X:${(newX*1000).toFixed(0)} Y:${(newY*1000).toFixed(0)}`);
                            cancelCommand();
                            if (currentViewMode === '3d') update3DScene();
                            else draw();
                        }
                    }
                    else if (cmdState.active === CMD.OFFSET && cmdState.phase === PHASE.DESTINATION) {
                        const dist = parseFloat(val);
                        if (!isNaN(dist) && dist > 0) {
                            cmdState.offsetDist = dist / 1000; // mm to m
                            executeOffset();
                        }
                    }
                    else if (cmdState.active === CMD.SPLIT) {
                        processSplitInput(val);
                    }
                    else if ((cmdState.active === CMD.COPY || cmdState.active === CMD.MOVE) && cmdState.phase === PHASE.DESTINATION) {
                        let dx = 0, dy = 0;
                        if (val.includes(',')) {
                            // Format: X,Y or @X,Y (mm)
                            const isRel = val.startsWith('@');
                            const parts = val.replace('@', '').split(',');
                            dx = parseFloat(parts[0]) / 1000 || 0;
                            dy = parseFloat(parts[1]) / 1000 || 0;
                            // Note: for COPY/MOVE, @ is always relative to base point (default behavior)
                        } else if (val.includes('<')) {
                            // Format: distance<angle
                            const parts = val.split('<');
                            const d = parseFloat(parts[0]) / 1000 || 0;
                            const a = parseFloat(parts[1]) || 0;
                            dx = d * Math.cos(a * Math.PI / 180);
                            dy = d * Math.sin(a * Math.PI / 180);
                        } else {
                            // Just distance - use last direction
                            const d = parseFloat(val) / 1000 || 0;
                            if (cmdState.previewData && cmdState.previewData.direction) {
                                dx = d * cmdState.previewData.direction.x;
                                dy = d * cmdState.previewData.direction.y;
                            } else {
                                dx = d; // Default to X direction
                            }
                        }
                        if (cmdState.active === CMD.COPY) {
                            executeCopyWithOffset(dx, dy);
                        } else {
                            executeMoveWithOffset(dx, dy);
                        }
                    }
                    else if (cmdState.active === CMD.ROTATE && cmdState.phase === PHASE.DESTINATION) {
                        const angle = parseFloat(val) || 0;
                        if (cmdState.keepOriginal) {
                            executeRotateCopy(angle);
                        } else {
                            executeRotate(angle);
                        }
                    }
                    if (input) {
                        input.value = '';
                        // Keep focus for LINE command
                        if (cmdState.active === CMD.LINE) {
                            setTimeout(() => input.focus(), 10);
                        }
                    }
                } else {
                    // Empty input - handle based on state
                    if (cmdState.active === CMD.NONE && cmdState.lastCommand) {
                        // Repeat last command
                        startCommand(cmdState.lastCommand);
                    }
                    else if (cmdState.active === CMD.LINE && cmdState.linePoints.length > 0) {
                        cancelCommand();
                        showToast('Line finished');
                    }
                    else if (cmdState.active === CMD.NODE_MOVE) {
                        cancelCommand();
                    }
                    else if (cmdState.active !== CMD.NONE && cmdState.phase === PHASE.SELECT) {
                        // Confirm selection and move to next phase
                        const selectedBeamIds = getSelectedBeamIds();
                        if (selectedBeamIds.length > 0) {
                            cmdState.selectedBeamIds = selectedBeamIds;
                            
                            if (cmdState.active === CMD.EXTEND || cmdState.active === CMD.TRIM) {
                                cmdState.boundaryEdges = [];
                                cmdState.phase = PHASE.DESTINATION;
                            } else if (cmdState.active === CMD.SPLIT) {
                                cmdState.phase = PHASE.DESTINATION;
                            } else {
                                cmdState.phase = PHASE.BASE_POINT;
                            }
                            updateCommandUI();
                            showToast(`${selectedBeamIds.length} beam(s) selected. Click base point.`);
                        } else {
                            showToast('Select objects first', 'warning');
                        }
                    }
                }
                return;
            }
            
            // Delete key
            if (e.key === 'Delete') {
                e.preventDefault();
                e.stopPropagation();
                deleteSelected();
                return;
            }
            
            // F key for Fit View (only when not in input)
            if ((e.key === 'f' || e.key === 'F') && !isCmdInput && !e.ctrlKey && cmdState.active === CMD.NONE) {
                e.preventDefault();
                e.stopPropagation();
                if (currentViewMode === '3d') fit3DView();
                else fitView();
                return;
            }
            
            // Letter keys - focus input and type (AutoCAD style: type command then Space)
            if (cmdState.active === CMD.NONE && !isCmdInput && /^[a-z]$/i.test(e.key) && !e.ctrlKey) {
                e.preventDefault();
                e.stopPropagation();
                if (cmdElements.input) {
                    cmdElements.input.focus();
                    cmdElements.input.value = e.key.toLowerCase();
                }
                return;
            }
            
            // Number keys when command active - focus input
            if (cmdState.active !== CMD.NONE && !isCmdInput && /^[0-9\-.,<@%]$/.test(e.key)) {
                e.preventDefault();
                e.stopPropagation();
                if (cmdElements.input) {
                    cmdElements.input.focus();
                    cmdElements.input.value = e.key;
                }
                return;
            }
        }, true); // Use capture to get priority
        
        // ============== 3D MOUSE HANDLER FOR COMMANDS ==============
        
        // Override 3D click handler for command system
        const original3DClickHandler = typeof handle3DClick === 'function' ? handle3DClick : null;
        
        function handleCommandClick3D(e, container) {
            if (cmdState.active === CMD.NONE) {
                // Normal selection - call original handler if exists
                if (original3DClickHandler) {
                    // Selection will be handled by existing code
                }
                return false; // Let normal handler proceed
            }
            
            const modelPos = screenToModel3D(e.clientX, e.clientY, container);
            
            // For LINE command, use last point as base point for ortho
            let orthoBase = cmdState.basePoint;
            if (cmdState.active === CMD.LINE && cmdState.linePoints.length > 0) {
                orthoBase = cmdState.linePoints[cmdState.linePoints.length - 1];
            }
            
            // Apply ortho constraint if base point is set
            if (orthoBase && cmdState.orthoMode) {
                const constrained = applyOrtho(
                    orthoBase.x, orthoBase.y,
                    modelPos.x, modelPos.y
                );
                modelPos.x = constrained.x;
                modelPos.y = constrained.y;
            }
            
            // Apply snap (but respect ortho constraint)
            const snapPoint = findSnapPoint(modelPos.x, modelPos.y);
            cmdState.currentSnapPoint = snapPoint || null;
            if (snapPoint) {
                if (orthoBase && cmdState.orthoMode) {
                    // In ortho mode, only apply snap in the ortho direction
                    if (Math.abs(modelPos.x - orthoBase.x) > Math.abs(modelPos.y - orthoBase.y)) {
                        modelPos.x = snapPoint.x;
                        // Keep Y constrained to ortho
                    } else {
                        modelPos.y = snapPoint.y;
                        // Keep X constrained to ortho
                    }
                } else {
                    modelPos.x = snapPoint.x;
                    modelPos.y = snapPoint.y;
                }
            }
            
            // Handle based on command and phase
            if (cmdState.active === CMD.COPY || cmdState.active === CMD.MOVE) {
                if (cmdState.phase === PHASE.BASE_POINT) {
                    // Set base point
                    cmdState.basePoint = { x: modelPos.x, y: modelPos.y };
                    cmdState.basePointScreen = { x: e.clientX, y: e.clientY };
                    showBasePointMarker(e.clientX, e.clientY);
                    cmdState.phase = PHASE.DESTINATION;
                    updateCommandUI();
                    return true;
                } else if (cmdState.phase === PHASE.DESTINATION) {
                    // Calculate offset and execute
                    const offsetX = modelPos.x - cmdState.basePoint.x;
                    const offsetY = modelPos.y - cmdState.basePoint.y;
                    
                    if (cmdState.active === CMD.COPY) {
                        executeCopyWithOffset(offsetX, offsetY);
                    } else {
                        executeMoveWithOffset(offsetX, offsetY);
                    }
                    return true;
                }
            } else if (cmdState.active === CMD.ROTATE) {
                if (cmdState.phase === PHASE.BASE_POINT) {
                    cmdState.basePoint = { x: modelPos.x, y: modelPos.y };
                    cmdState.basePointScreen = { x: e.clientX, y: e.clientY };
                    showBasePointMarker(e.clientX, e.clientY);
                    cmdState.phase = PHASE.DESTINATION;
                    cmdState.keepOriginal = false; // Default: rotate in place
                    updateCommandUI();
                    return true;
                } else if (cmdState.phase === PHASE.DESTINATION) {
                    // Calculate angle from base point
                    const dx = modelPos.x - cmdState.basePoint.x;
                    const dy = modelPos.y - cmdState.basePoint.y;
                    const angle = Math.atan2(dy, dx) * 180 / Math.PI;
                    
                    if (cmdState.keepOriginal) {
                        executeRotateCopy(angle);
                    } else {
                        executeRotate(angle);
                    }
                    return true;
                }
            } else if (cmdState.active === CMD.MIRROR) {
                if (cmdState.phase === PHASE.BASE_POINT) {
                    cmdState.basePoint = { x: modelPos.x, y: modelPos.y };
                    cmdState.basePointScreen = { x: e.clientX, y: e.clientY };
                    showBasePointMarker(e.clientX, e.clientY);
                    cmdState.phase = PHASE.SECOND_POINT;
                    updateCommandUI();
                    return true;
                } else if (cmdState.phase === PHASE.SECOND_POINT) {
                    cmdState.secondPoint = { x: modelPos.x, y: modelPos.y };
                    cmdState.phase = PHASE.CONFIRM;
                    updateCommandUI();
                    
                    // Auto-execute with keep original = true
                    cmdState.keepOriginal = true;
                    executeMirrorCommand();
                    return true;
                }
            } else if (cmdState.active === CMD.SPLIT) {
                if (cmdState.hoverBeam && cmdState.hoverPoint) {
                    executeSplitAtClick();
                    return true;
                }
            } else if (cmdState.active === CMD.EXTEND) {
                // Find beam end near click (returns {elemId, nodeId, isN1})
                const clickResult = findBeamEndNearPoint(modelPos.x, modelPos.y, 0.2);
                if (clickResult) {
                    executeExtendBeam(clickResult);
                }
                return true;
            } else if (cmdState.active === CMD.TRIM) {
                // Find beam segment containing click
                const beamOnPoint = findPointOnBeam(modelPos.x, modelPos.y, 0.2);
                if (beamOnPoint) {
                    executeTrimBeam(beamOnPoint.elemId, modelPos.x, modelPos.y);
                }
                return true;
            } else if (cmdState.active === CMD.LINE) {
                // LINE command - add point
                cmdState.linePoints.push({ x: modelPos.x, y: modelPos.y, z: modelPos.z || 0 });
                
                if (cmdState.linePoints.length >= 2) {
                    saveState();
                    const pts = cmdState.linePoints;
                    const p1 = pts[pts.length - 2];
                    const p2 = pts[pts.length - 1];
                    
                    // Update direction for next distance input
                    const dx = p2.x - p1.x;
                    const dy = p2.y - p1.y;
                    const len = Math.sqrt(dx*dx + dy*dy);
                    if (len > 0.001) {
                        cmdState.lastCursorDir = { x: dx/len, y: dy/len };
                    }
                    
                    // Find or create nodes (use 10mm tolerance for finding existing nodes)
                    let n1Id = findNodeAt(p1.x, p1.y, 0.01, p1.z || 0);
                    if (!n1Id) { n1Id = nextNodeId++; model.nodes[n1Id] = { x: p1.x, y: p1.y, z: p1.z || 0 }; }
                    
                    let n2Id = findNodeAt(p2.x, p2.y, 0.01, p2.z || 0);
                    if (!n2Id) { n2Id = nextNodeId++; model.nodes[n2Id] = { x: p2.x, y: p2.y, z: p2.z || 0 }; }
                    
                    // Create beam
                    const beamId = nextElementId++;
                    model.elements[beamId] = { n1: n1Id, n2: n2Id, section: (document.getElementById('addBeamSection')?.value) || 'HP200x10' };
                    
                    // Auto-split at intersections
                    autoSplitAtIntersections([beamId]);
                    
                    // Force render update
                    if (currentViewMode === '3d') {
                        update3DScene();
                        if (threeRenderer && threeScene && threeCamera) {
                            threeRenderer.render(threeScene, threeCamera);
                        }
                    } else {
                        draw();
                    }
                    updatePropertiesPanel();
                    
                    
                    const distMM = (len * 1000).toFixed(0);
                    showToast(`Line: ${distMM} mm → Next point?`);
                } else {
                    // First point - show feedback
                    showToast(`Start: (${(modelPos.x*1000).toFixed(0)}, ${(modelPos.y*1000).toFixed(0)}) → Next point or distance`);
                    // Set default direction for distance input
                    cmdState.lastCursorDir = { x: 1, y: 0 };
                }
                
                cmdState.basePoint = { x: modelPos.x, y: modelPos.y };
                updateCommandUI();
                
                // Keep focus on input for distance entry
                if (cmdElements.input) {
                    setTimeout(() => cmdElements.input.focus(), 10);
                }
                return true;
            } else if (cmdState.active === CMD.OFFSET) {
                if (cmdState.phase === PHASE.SELECT) {
                    // Select beam to offset
                    const beamOnPoint = findPointOnBeam(modelPos.x, modelPos.y, 0.2);
                    if (beamOnPoint) {
                        cmdState.selectedBeamIds = [beamOnPoint.elemId];
                        cmdState.phase = PHASE.DESTINATION;
                        updateCommandUI();
                        showToast('OFFSET: Click side or type distance (mm)');
                    }
                    return true;
                } else if (cmdState.phase === PHASE.DESTINATION && cmdState.selectedBeamIds.length > 0) {
                    // Determine side based on click position
                    const elemId = cmdState.selectedBeamIds[0];
                    const beam = model.elements[elemId];
                    if (beam) {
                        const n1 = model.nodes[beam.n1], n2 = model.nodes[beam.n2];
                        const dx = n2.x - n1.x, dy = n2.y - n1.y;
                        const len = Math.sqrt(dx*dx + dy*dy);
                        const nx = -dy/len, ny = dx/len;
                        const midX = (n1.x + n2.x)/2, midY = (n1.y + n2.y)/2;
                        cmdState.offsetSide = ((modelPos.x - midX) * nx + (modelPos.y - midY) * ny) > 0 ? 1 : -1;
                        executeOffset();
                    }
                    return true;
                }
            } else if (cmdState.active === CMD.JOIN) {
                // Select beams to join
                const beamOnPoint = findPointOnBeam(modelPos.x, modelPos.y, 0.2);
                if (beamOnPoint) {
                    if (cmdState.selectedBeamIds.length === 0) {
                        cmdState.selectedBeamIds = [beamOnPoint.elemId];
                        highlightBeamForCommand(beamOnPoint.elemId);
                        showToast('JOIN: Select second beam');
                    } else if (cmdState.selectedBeamIds.length === 1 && beamOnPoint.elemId !== cmdState.selectedBeamIds[0]) {
                        executeJoin(cmdState.selectedBeamIds[0], beamOnPoint.elemId);
                    }
                    return true;
                }
            }
            
            return false;
        }
        
        // Find beam end near point (for extend)
        function findBeamEndNearPoint(x, y, tolerance = 0.15) {
            let result = null;
            let minDist = tolerance;
            
            Object.entries(model.elements).forEach(([elemId, elem]) => {
                const n1 = model.nodes[elem.n1];
                const n2 = model.nodes[elem.n2];
                if (!n1 || !n2) return;
                
                // Check distance to n1
                const dist1 = Math.sqrt((n1.x - x) ** 2 + (n1.y - y) ** 2);
                if (dist1 < minDist) {
                    minDist = dist1;
                    result = { elemId: parseInt(elemId), nodeId: elem.n1, isN1: true };
                }
                
                // Check distance to n2
                const dist2 = Math.sqrt((n2.x - x) ** 2 + (n2.y - y) ** 2);
                if (dist2 < minDist) {
                    minDist = dist2;
                    result = { elemId: parseInt(elemId), nodeId: elem.n2, isN1: false };
                }
            });
            
            return result;
        }
        
        // Find node at position
        function findNodeAt(x, y, tolerance = 0.001, z = null) {
            for (const [id, n] of Object.entries(model.nodes)) {
                const dz = (z === null) ? 0 : ((n.z || 0) - z);
                const dist = Math.sqrt((n.x - x)**2 + (n.y - y)**2 + dz*dz);
                if (dist < tolerance) return parseInt(id);
            }
            return null;
        }
        
        // Execute OFFSET command
        function executeOffset() {
            if (cmdState.selectedBeamIds.length === 0) { cancelCommand(); return; }
            saveState();
            
            const elemId = cmdState.selectedBeamIds[0];
            const beam = model.elements[elemId];
            if (!beam) { cancelCommand(); return; }
            
            const n1 = model.nodes[beam.n1], n2 = model.nodes[beam.n2];
            const dx = n2.x - n1.x, dy = n2.y - n1.y;
            const len = Math.sqrt(dx*dx + dy*dy);
            const nx = -dy/len * cmdState.offsetDist * cmdState.offsetSide;
            const ny = dx/len * cmdState.offsetDist * cmdState.offsetSide;
            
            const newN1 = nextNodeId++; model.nodes[newN1] = { x: n1.x + nx, y: n1.y + ny };
            const newN2 = nextNodeId++; model.nodes[newN2] = { x: n2.x + nx, y: n2.y + ny };
            const newId = nextElementId++;
            model.elements[newId] = { n1: newN1, n2: newN2, section: beam.section };
            
            autoSplitAtIntersections([newId]);
            
            showToast(`Offset ${(cmdState.offsetDist*1000).toFixed(0)} mm`);
            cancelCommand();
            if (currentViewMode === '3d') update3DScene();
            else draw();
            updatePropertiesPanel();
        }
        
        // Execute JOIN command
        function executeJoin(id1, id2) {
            const e1 = model.elements[id1], e2 = model.elements[id2];
            if (!e1 || !e2) { cancelCommand(); return; }
            
            const n1a = model.nodes[e1.n1], n1b = model.nodes[e1.n2];
            const n2a = model.nodes[e2.n1], n2b = model.nodes[e2.n2];
            
            // Check collinearity
            const dx1 = n1b.x - n1a.x, dy1 = n1b.y - n1a.y;
            const dx2 = n2b.x - n2a.x, dy2 = n2b.y - n2a.y;
            const cross = Math.abs(dx1 * dy2 - dy1 * dx2);
            const len1 = Math.sqrt(dx1*dx1 + dy1*dy1), len2 = Math.sqrt(dx2*dx2 + dy2*dy2);
            
            if (cross / (len1 * len2) > 0.01) {
                showToast('Beams not collinear', 'warning');
                cancelCommand(); return;
            }
            
            // Find shared node
            let sharedNode = null, keepNodes = [];
            if (e1.n1 === e2.n1 || e1.n1 === e2.n2) { sharedNode = e1.n1; keepNodes = [e1.n2, e1.n1 === e2.n1 ? e2.n2 : e2.n1]; }
            else if (e1.n2 === e2.n1 || e1.n2 === e2.n2) { sharedNode = e1.n2; keepNodes = [e1.n1, e1.n2 === e2.n1 ? e2.n2 : e2.n1]; }
            
            if (!sharedNode) {
                showToast('Beams not connected', 'warning');
                cancelCommand(); return;
            }
            
            saveState();
            delete model.elements[id1];
            delete model.elements[id2];
            
            // Check if shared node is used by other beams
            const usedElsewhere = Object.values(model.elements).some(b => b.n1 === sharedNode || b.n2 === sharedNode);
            if (!usedElsewhere) delete model.nodes[sharedNode];
            
            const newId = nextElementId++;
            model.elements[newId] = { n1: keepNodes[0], n2: keepNodes[1], section: e1.section };
            
            showToast('Joined');
            cancelCommand();
            if (currentViewMode === '3d') update3DScene();
            else draw();
            updatePropertiesPanel();
        }
        
        // Auto-split beams at intersections
        function autoSplitAtIntersections(newBeamIds) {
            const EPSILON = 0.0001;
            let totalSplits = 0;
            
            newBeamIds.forEach(newId => {
                const newBeam = model.elements[newId];
                if (!newBeam) return;
                const n1 = model.nodes[newBeam.n1], n2 = model.nodes[newBeam.n2];
                if (!n1 || !n2) return;
                
                const intersections = [];
                const endpointSplits = [];
                
                Object.entries(model.elements).forEach(([otherId, otherBeam]) => {
                    if (parseInt(otherId) === newId) return;
                    const on1 = model.nodes[otherBeam.n1], on2 = model.nodes[otherBeam.n2];
                    if (!on1 || !on2) return;
                    
                    // Check segment intersection
                    const d = (n1.x - n2.x) * (on1.y - on2.y) - (n1.y - n2.y) * (on1.x - on2.x);
                    if (Math.abs(d) >= 1e-10) {
                        const t = ((n1.x - on1.x) * (on1.y - on2.y) - (n1.y - on1.y) * (on1.x - on2.x)) / d;
                        const u = -((n1.x - n2.x) * (n1.y - on1.y) - (n1.y - n2.y) * (n1.x - on1.x)) / d;
                        
                        if (t > EPSILON && t < 1 - EPSILON && u > EPSILON && u < 1 - EPSILON) {
                            const ix = n1.x + t * (n2.x - n1.x);
                            const iy = n1.y + t * (n2.y - n1.y);
                            intersections.push({ x: ix, y: iy, tNew: t, tOther: u, otherElemId: parseInt(otherId) });
                        }
                    }
                    
                    // Check if new beam endpoints are on other beam (for parallel copy)
                    const checkPointOnSegment = (px, py, x1, y1, x2, y2) => {
                        const dx = x2 - x1, dy = y2 - y1;
                        const len = Math.sqrt(dx*dx + dy*dy);
                        if (len < EPSILON) return null;
                        const t = ((px - x1) * dx + (py - y1) * dy) / (len * len);
                        if (t <= EPSILON || t >= 1 - EPSILON) return null;
                        const cx = x1 + t * dx, cy = y1 + t * dy;
                        const dist = Math.sqrt((px - cx)**2 + (py - cy)**2);
                        if (dist < 0.001) return { t, x: cx, y: cy };
                        return null;
                    };
                    
                    const n1OnOther = checkPointOnSegment(n1.x, n1.y, on1.x, on1.y, on2.x, on2.y);
                    if (n1OnOther) {
                        endpointSplits.push({ x: n1.x, y: n1.y, tOther: n1OnOther.t, otherElemId: parseInt(otherId), nodeId: newBeam.n1 });
                    }
                    
                    const n2OnOther = checkPointOnSegment(n2.x, n2.y, on1.x, on1.y, on2.x, on2.y);
                    if (n2OnOther) {
                        endpointSplits.push({ x: n2.x, y: n2.y, tOther: n2OnOther.t, otherElemId: parseInt(otherId), nodeId: newBeam.n2 });
                    }
                });
                
                if (intersections.length > 0) {
                    intersections.sort((a, b) => a.tNew - b.tNew);
                    totalSplits += intersections.length;
                    
                    // Create nodes at intersections
                    const newNodes = intersections.map(inter => {
                        const existing = findNodeAt(inter.x, inter.y, 0.001);
                        if (existing) return existing;
                        const id = nextNodeId++;
                        model.nodes[id] = { x: inter.x, y: inter.y };
                        return id;
                    });
                    
                    // Split new beam
                    const section = newBeam.section;
                    const origN1 = newBeam.n1, origN2 = newBeam.n2;
                    delete model.elements[newId];
                    
                    let prevNode = origN1;
                    newNodes.forEach(nodeId => {
                        const id = nextElementId++;
                        model.elements[id] = { n1: prevNode, n2: nodeId, section };
                        prevNode = nodeId;
                    });
                    const lastId = nextElementId++;
                    model.elements[lastId] = { n1: prevNode, n2: origN2, section };
                    
                    // Split other beams
                    intersections.forEach((inter, idx) => {
                        const otherBeam = model.elements[inter.otherElemId];
                        if (!otherBeam) return;
                        const nodeId = newNodes[idx];
                        if (otherBeam.n1 === nodeId || otherBeam.n2 === nodeId) return;
                        
                        const oSection = otherBeam.section;
                        const oN1 = otherBeam.n1, oN2 = otherBeam.n2;
                        delete model.elements[inter.otherElemId];
                        
                        const id1 = nextElementId++; model.elements[id1] = { n1: oN1, n2: nodeId, section: oSection };
                        const id2 = nextElementId++; model.elements[id2] = { n1: nodeId, n2: oN2, section: oSection };
                    });
                }
                
                // Process endpoint splits (for parallel copy)
                endpointSplits.forEach(split => {
                    const otherBeam = model.elements[split.otherElemId];
                    if (!otherBeam || otherBeam.n1 === split.nodeId || otherBeam.n2 === split.nodeId) return;
                    
                    const oSection = otherBeam.section;
                    const oN1 = otherBeam.n1, oN2 = otherBeam.n2;
                    delete model.elements[split.otherElemId];
                    
                    const id1 = nextElementId++; model.elements[id1] = { n1: oN1, n2: split.nodeId, section: oSection };
                    const id2 = nextElementId++; model.elements[id2] = { n1: split.nodeId, n2: oN2, section: oSection };
                    totalSplits++;
                });
            });
            
            if (totalSplits > 0) showToast(`Auto-split: ${totalSplits}`, 'success');
        }
        
        // Highlight beam for command preview
        function highlightBeamForCommand(beamId) {
            // Will be shown in preview
            if (currentViewMode === '3d') update3DScene();
            else draw();
        }
        
        // ============== 3D MOUSE MOVE HANDLER FOR COMMANDS ==============
        
        function handleCommandMouseMove3D(e, container) {
            if (cmdState.active === CMD.NONE) return;
            
            const modelPos = screenToModel3D(e.clientX, e.clientY, container);
            
            // Update coordinates display
            updateCoordsDisplay(modelPos.x, modelPos.y);
            
            // For LINE command, use last point as base point for ortho
            let orthoBase = cmdState.basePoint;
            if (cmdState.active === CMD.LINE && cmdState.linePoints.length > 0) {
                orthoBase = cmdState.linePoints[cmdState.linePoints.length - 1];
            }
            
            // Apply ortho constraint if base point is set
            if (orthoBase && cmdState.orthoMode) {
                const constrained = applyOrtho(
                    orthoBase.x, orthoBase.y,
                    modelPos.x, modelPos.y
                );
                modelPos.x = constrained.x;
                modelPos.y = constrained.y;
            }
            
            // Apply snap (but respect ortho constraint)
            const snapPoint = findSnapPoint(modelPos.x, modelPos.y);
            cmdState.currentSnapPoint = snapPoint || null;
            // Visual object-snap marker (container-relative position)
            if (snapPoint && typeof modelToScreen3D === 'function') {
                const sp = modelToScreen3D(snapPoint.x, snapPoint.y, container, snapPoint.z || 0);
                if (sp) {
                    const cRect = container.getBoundingClientRect();
                    showSnapMarker(sp.x - cRect.left, sp.y - cRect.top, snapPoint.type);
                }
            } else {
                hideSnapMarker();
            }
            if (snapPoint) {
                if (orthoBase && cmdState.orthoMode) {
                    // In ortho mode, only apply snap in the ortho direction
                    if (Math.abs(modelPos.x - orthoBase.x) > Math.abs(modelPos.y - orthoBase.y)) {
                        modelPos.x = snapPoint.x;
                        // Keep Y constrained to ortho
                    } else {
                        modelPos.y = snapPoint.y;
                        // Keep X constrained to ortho
                    }
                } else {
                    modelPos.x = snapPoint.x;
                    modelPos.y = snapPoint.y;
                }
            }
            
            // Handle based on command
            if (cmdState.active === CMD.COPY || cmdState.active === CMD.MOVE) {
                if (cmdState.phase === PHASE.DESTINATION && cmdState.basePoint) {
                    // Show direction line
                    const baseScreen = modelToScreen3D(cmdState.basePoint.x, cmdState.basePoint.y, container, cmdState.basePoint.z || 0);
                    const currentScreen = modelToScreen3D(modelPos.x, modelPos.y, container, modelPos.z || 0);
                    showDirectionLine(baseScreen.x, baseScreen.y, currentScreen.x, currentScreen.y);
                    
                    // Calculate and show distance
                    const dx = modelPos.x - cmdState.basePoint.x;
                    const dy = modelPos.y - cmdState.basePoint.y;
                    const dist = Math.sqrt(dx * dx + dy * dy) * 1000; // m to mm
                    
                    // Store direction for keyboard input
                    const len = Math.sqrt(dx * dx + dy * dy);
                    if (len > 0.001) {
                        cmdState.previewData = {
                            direction: { x: dx / len, y: dy / len }
                        };
                    }
                    
                    // Show tooltip with distance
                    let tipText = `<span class="distance">${dist.toFixed(0)} mm</span>`;
                    if (cmdState.orthoMode) tipText += ` <span style="color:var(--success);font-size:var(--fs-xs)">[ORTHO]</span>`;
                    showTooltipAt(e.clientX, e.clientY, tipText);
                    
                    // Update 3D preview
                    updateCopyMovePreview3D(dx, dy);
                }
            } else if (cmdState.active === CMD.ROTATE) {
                if (cmdState.phase === PHASE.DESTINATION && cmdState.basePoint) {
                    // Show angle indicator
                    const dx = modelPos.x - cmdState.basePoint.x;
                    const dy = modelPos.y - cmdState.basePoint.y;
                    const angle = Math.atan2(dy, dx) * 180 / Math.PI;
                    
                    // Show direction line
                    const baseScreen = modelToScreen3D(cmdState.basePoint.x, cmdState.basePoint.y, container, cmdState.basePoint.z || 0);
                    const currentScreen = modelToScreen3D(modelPos.x, modelPos.y, container, modelPos.z || 0);
                    showDirectionLine(baseScreen.x, baseScreen.y, currentScreen.x, currentScreen.y);
                    
                    // Show tooltip with angle
                    showTooltipAt(e.clientX, e.clientY, 
                        `<span class="ratio">${angle.toFixed(1)}°</span>`
                    );
                    
                    // Update preview
                    updateRotatePreview3D(angle);
                }
            } else if (cmdState.active === CMD.MIRROR) {
                if (cmdState.phase === PHASE.SECOND_POINT && cmdState.basePoint) {
                    // Show mirror line
                    const baseScreen = modelToScreen3D(cmdState.basePoint.x, cmdState.basePoint.y, container, cmdState.basePoint.z || 0);
                    const currentScreen = modelToScreen3D(modelPos.x, modelPos.y, container, modelPos.z || 0);
                    showMirrorLine(baseScreen.x, baseScreen.y, currentScreen.x, currentScreen.y);
                    
                    // Update preview
                    updateMirrorPreview3D(cmdState.basePoint, modelPos);
                }
            } else if (cmdState.active === CMD.SPLIT) {
                // Find point on beam under cursor
                const beamPoint = findPointOnBeam(modelPos.x, modelPos.y);
                
                if (beamPoint) {
                    cmdState.hoverBeam = beamPoint.elemId;
                    cmdState.hoverPoint = beamPoint;
                    
                    const screenPos = modelToScreen3D(beamPoint.pointX, beamPoint.pointY, container);
                    showSplitPoint(screenPos.x, screenPos.y);
                    
                    // Show tooltip
                    showTooltipAt(e.clientX, e.clientY, 
                        `<span class="ratio">${(beamPoint.ratio * 100).toFixed(0)}%</span>` +
                        `<span class="distance">${(beamPoint.distance * 1000).toFixed(0)} mm</span>`
                    );
                    
                    // Highlight beam
                    highlightBeamForSplit(beamPoint.elemId);
                } else {
                    cmdState.hoverBeam = null;
                    cmdState.hoverPoint = null;
                    hideSplitPoint();
                    hideTooltip();
                    clearSplitHighlight();
                }
            } else if (cmdState.active === CMD.EXTEND) {
                // EXTEND - find beam end under cursor
                const beamEnd = findBeamEndNearPoint(modelPos.x, modelPos.y, 0.2);
                if (beamEnd) {
                    cmdState.hoverInfo = beamEnd;
                    const preview = calcExtendPreview(beamEnd);
                    if (preview) {
                        showTooltipAt(e.clientX, e.clientY, 
                            `<span class="distance">Extend: ${(preview.dist*1000).toFixed(0)} mm</span>`
                        );
                    } else {
                        showTooltipAt(e.clientX, e.clientY, 
                            `<span class="distance">No target</span>`
                        );
                    }
                    // Highlight the beam end
                    highlightBeamEnd(beamEnd.elemId, beamEnd.nodeId);
                } else {
                    cmdState.hoverInfo = null;
                    hideTooltip();
                    if (currentViewMode === '3d') update3DScene();
                }
            } else if (cmdState.active === CMD.TRIM) {
                // TRIM - find beam segment under cursor
                const beamPoint = findPointOnBeam(modelPos.x, modelPos.y);
                if (beamPoint) {
                    cmdState.hoverBeam = beamPoint.elemId;
                    cmdState.hoverPoint = beamPoint;
                    showTooltipAt(e.clientX, e.clientY, 
                        `<span class="distance">Click to trim</span>`
                    );
                    highlightBeamForSplit(beamPoint.elemId);
                } else {
                    cmdState.hoverBeam = null;
                    cmdState.hoverPoint = null;
                    hideTooltip();
                    clearSplitHighlight();
                }
            } else if (cmdState.active === CMD.LINE) {
                // LINE preview - always show coordinates
                const xMM = (modelPos.x * 1000).toFixed(0);
                const yMM = (modelPos.y * 1000).toFixed(0);
                
                if (cmdState.linePoints.length > 0) {
                    const lastPt = cmdState.linePoints[cmdState.linePoints.length - 1];
                    const baseScreen = modelToScreen3D(lastPt.x, lastPt.y, container, lastPt.z || 0);
                    const currentScreen = modelToScreen3D(modelPos.x, modelPos.y, container, modelPos.z || 0);
                    showDirectionLine(baseScreen.x, baseScreen.y, currentScreen.x, currentScreen.y);
                    
                    const dx = modelPos.x - lastPt.x;
                    const dy = modelPos.y - lastPt.y;
                    const dz = (modelPos.z || 0) - (lastPt.z || 0);
                    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) * 1000;
                    
                    // Track cursor direction for distance input
                    if (dist > 1) { // More than 1mm movement
                        cmdState.lastCursorDir = { x: dx, y: dy };
                        if (cmdState.orthoMode) {
                            // Store ortho direction
                            if (Math.abs(dx) > Math.abs(dy)) {
                                cmdState.orthoDir = { x: dx > 0 ? 1 : -1, y: 0 };
                            } else {
                                cmdState.orthoDir = { x: 0, y: dy > 0 ? 1 : -1 };
                            }
                        }
                    }
                    
                    // Show direction indicator in tooltip
                    let dirText = '';
                    if (cmdState.lastCursorDir) {
                        const cdx = cmdState.lastCursorDir.x;
                        const cdy = cmdState.lastCursorDir.y;
                        if (Math.abs(cdx) > Math.abs(cdy)) {
                            dirText = cdx > 0 ? '→' : '←';
                        } else {
                            dirText = cdy > 0 ? '↑' : '↓';
                        }
                    }
                    
                    // Cizerken asil bakilan sey uzunluk; once o gelir ve
                    // buyuk yazilir. X/Y zaten durum seridinde, "Type distance
                    // + Enter" da komut cubugunda yaziyor - imlecin yaninda
                    // dort satir okumak zorunda kalmayin diye buradan cikti.
                    let tipText = `<span class="distance">${dist.toFixed(0)} mm ${dirText}</span>`;
                    if (cmdState.orthoMode) tipText += ` <span style="color:var(--success);font-size:var(--fs-xs)">ORTHO</span>`;
                    if (snapPoint && snapPoint.type) tipText += ` <span style="color:var(--accent-info);font-size:var(--fs-xs)">${snapPoint.type}</span>`;
                    showTooltipAt(e.clientX, e.clientY, tipText);
                    
                    updateLinePreview3D(modelPos);
                } else {
                    // First point - just show coordinates
                    let tipText = `<span style="color:var(--text-2);font-size:var(--fs-xs)">X: ${xMM}  Y: ${yMM}</span>`;
                    if (snapPoint && snapPoint.type) tipText += `<br><span style="color:var(--accent-info);font-size:var(--fs-xs)">[${snapPoint.type}]</span>`;
                    showTooltipAt(e.clientX, e.clientY, tipText);
                }
            } else if (cmdState.active === CMD.OFFSET && cmdState.phase === PHASE.DESTINATION) {
                // OFFSET preview
                if (cmdState.selectedBeamIds.length > 0) {
                    const elemId = cmdState.selectedBeamIds[0];
                    const beam = model.elements[elemId];
                    if (beam) {
                        const n1 = model.nodes[beam.n1], n2 = model.nodes[beam.n2];
                        const dx = n2.x - n1.x, dy = n2.y - n1.y;
                        const len = Math.sqrt(dx*dx + dy*dy);
                        const nx = -dy/len, ny = dx/len;
                        const midX = (n1.x + n2.x)/2, midY = (n1.y + n2.y)/2;
                        const side = ((modelPos.x - midX) * nx + (modelPos.y - midY) * ny) > 0 ? 1 : -1;
                        cmdState.offsetSide = side;
                        
                        showTooltipAt(e.clientX, e.clientY, 
                            `<span class="distance">Offset: ${(cmdState.offsetDist*1000).toFixed(0)} mm</span>`
                        );
                        
                        updateOffsetPreview3D(side);
                    }
                }
            }
        }
        
        // ============== 3D PREVIEW RENDERING ==============
        
        let previewGroup = null;
        
        function updateCopyMovePreview3D(offsetX, offsetY) {
            if (!threeScene) return;
            
            // Remove existing preview
            clearPreview3D();
            
            previewGroup = new THREE.Group();
            previewGroup.userData.isPreview = true;
            
            // Create preview geometry for selected beams
            cmdState.selectedBeamIds.forEach(elemId => {
                const elem = model.elements[elemId];
                if (!elem) return;
                
                const n1 = model.nodes[elem.n1];
                const n2 = model.nodes[elem.n2];
                if (!n1 || !n2) return;
                
                const geometry = new THREE.BufferGeometry();
                const positions = new Float32Array([
                    n1.x + offsetX, n1.y + offsetY, 0,
                    n2.x + offsetX, n2.y + offsetY, 0
                ]);
                geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
                
                const material = new THREE.LineBasicMaterial({ 
                    color: 0x22c55e, 
                    opacity: 0.6, 
                    transparent: true,
                    linewidth: 2
                });
                
                const line = new THREE.Line(geometry, material);
                previewGroup.add(line);
            });
            
            threeScene.add(previewGroup);
            animate3D();
        }
        
        function updateRotatePreview3D(angleDeg) {
            if (!threeScene || !cmdState.basePoint) return;
            
            clearPreview3D();
            
            previewGroup = new THREE.Group();
            previewGroup.userData.isPreview = true;
            
            const angleRad = angleDeg * Math.PI / 180;
            const cx = cmdState.basePoint.x;
            const cy = cmdState.basePoint.y;
            
            cmdState.selectedBeamIds.forEach(elemId => {
                const elem = model.elements[elemId];
                if (!elem) return;
                
                const n1 = model.nodes[elem.n1];
                const n2 = model.nodes[elem.n2];
                if (!n1 || !n2) return;
                
                // Rotate points
                const rotatePoint = (px, py) => {
                    const dx = px - cx;
                    const dy = py - cy;
                    return {
                        x: cx + dx * Math.cos(angleRad) - dy * Math.sin(angleRad),
                        y: cy + dx * Math.sin(angleRad) + dy * Math.cos(angleRad)
                    };
                };
                
                const rn1 = rotatePoint(n1.x, n1.y);
                const rn2 = rotatePoint(n2.x, n2.y);
                
                const geometry = new THREE.BufferGeometry();
                const positions = new Float32Array([
                    rn1.x, rn1.y, 0,
                    rn2.x, rn2.y, 0
                ]);
                geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
                
                const material = new THREE.LineBasicMaterial({ 
                    color: 0xfbbf24, 
                    opacity: 0.6, 
                    transparent: true
                });
                
                const line = new THREE.Line(geometry, material);
                previewGroup.add(line);
            });
            
            threeScene.add(previewGroup);
            animate3D();
        }
        
        function updateMirrorPreview3D(p1, p2) {
            if (!threeScene) return;
            
            clearPreview3D();
            
            previewGroup = new THREE.Group();
            previewGroup.userData.isPreview = true;
            
            // Line direction
            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            const len = Math.sqrt(dx * dx + dy * dy);
            if (len < 0.001) return;
            
            const ux = dx / len;
            const uy = dy / len;
            
            cmdState.selectedBeamIds.forEach(elemId => {
                const elem = model.elements[elemId];
                if (!elem) return;
                
                const n1 = model.nodes[elem.n1];
                const n2 = model.nodes[elem.n2];
                if (!n1 || !n2) return;
                
                // Mirror function
                const mirrorPoint = (px, py) => {
                    const vx = px - p1.x;
                    const vy = py - p1.y;
                    const dot = vx * ux + vy * uy;
                    const projX = p1.x + dot * ux;
                    const projY = p1.y + dot * uy;
                    return {
                        x: 2 * projX - px,
                        y: 2 * projY - py
                    };
                };
                
                const mn1 = mirrorPoint(n1.x, n1.y);
                const mn2 = mirrorPoint(n2.x, n2.y);
                
                const geometry = new THREE.BufferGeometry();
                const positions = new Float32Array([
                    mn1.x, mn1.y, 0,
                    mn2.x, mn2.y, 0
                ]);
                geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
                
                const material = new THREE.LineBasicMaterial({ 
                    color: 0xa855f7, 
                    opacity: 0.6, 
                    transparent: true
                });
                
                const line = new THREE.Line(geometry, material);
                previewGroup.add(line);
            });
            
            threeScene.add(previewGroup);
            animate3D();
        }
        
        function clearPreview3D() {
            if (previewGroup && threeScene) {
                threeScene.remove(previewGroup);
                previewGroup.traverse(obj => {
                    if (obj.geometry) obj.geometry.dispose();
                    if (obj.material) obj.material.dispose();
                });
                previewGroup = null;
            }
        }
        
        // LINE preview
        function updateLinePreview3D(currentPos) {
            if (!threeScene || cmdState.linePoints.length === 0) return;
            
            clearPreview3D();
            
            previewGroup = new THREE.Group();
            previewGroup.userData.isPreview = true;
            
            const lastPt = cmdState.linePoints[cmdState.linePoints.length - 1];
            
            const geometry = new THREE.BufferGeometry();
            const positions = new Float32Array([
                lastPt.x, lastPt.y, 0.01,
                currentPos.x, currentPos.y, 0.01
            ]);
            geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            
            const material = new THREE.LineBasicMaterial({ 
                color: 0x22c55e, 
                opacity: 0.8, 
                transparent: true
            });
            
            const line = new THREE.Line(geometry, material);
            previewGroup.add(line);
            
            threeScene.add(previewGroup);
            animate3D();
        }
        
        // OFFSET preview
        function updateOffsetPreview3D(side) {
            if (!threeScene || cmdState.selectedBeamIds.length === 0) return;
            
            clearPreview3D();
            
            previewGroup = new THREE.Group();
            previewGroup.userData.isPreview = true;
            
            const elemId = cmdState.selectedBeamIds[0];
            const beam = model.elements[elemId];
            if (!beam) return;
            
            const n1 = model.nodes[beam.n1], n2 = model.nodes[beam.n2];
            const dx = n2.x - n1.x, dy = n2.y - n1.y;
            const len = Math.sqrt(dx*dx + dy*dy);
            const nx = -dy/len * cmdState.offsetDist * side;
            const ny = dx/len * cmdState.offsetDist * side;
            
            const geometry = new THREE.BufferGeometry();
            const positions = new Float32Array([
                n1.x + nx, n1.y + ny, 0.01,
                n2.x + nx, n2.y + ny, 0.01
            ]);
            geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            
            const material = new THREE.LineBasicMaterial({ 
                color: 0x22c55e, 
                opacity: 0.8, 
                transparent: true
            });
            
            const line = new THREE.Line(geometry, material);
            previewGroup.add(line);
            
            threeScene.add(previewGroup);
            animate3D();
        }
        
        // Highlight beam for split
        let splitHighlightBeam = null;
        
        function highlightBeamForSplit(elemId) {
            // This would modify the beam's appearance in the 3D scene
            // For now, we'll rely on the split point indicator
            splitHighlightBeam = elemId;
        }
        
        function highlightBeamEnd(elemId, nodeId) {
            // Highlight beam end for extend command
            // For now, just store the info - visual feedback comes from tooltip
            cmdState.hoverBeam = elemId;
        }
        
        function clearSplitHighlight() {
            splitHighlightBeam = null;
        }
        
        // ============== INTEGRATE WITH EXISTING 3D HANDLERS ==============
        // Command handlers are now integrated directly into 3D container event listeners above
        // No additional setup needed - handled in initThreeJS() mousedown/mousemove/mouseup handlers
