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
                        // Koordinat / uzunluk / @dx,dy / eksen kilidi: tek
                        // cozumleyici (system.js), komut cubugundakiyle ayni.
                        cizgiGirdisiIsle(val);
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
                        let dx = 0, dy = 0, dz = 0;
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
                                dz = d * (cmdState.previewData.direction.z || 0);
                            } else {
                                dx = d; // Default to X direction
                            }
                        }
                        if (cmdState.active === CMD.COPY) {
                            executeCopyWithOffset(dx, dy, dz);
                        } else {
                            executeMoveWithOffset(dx, dy, dz);
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
                        // STRETCH: dugum secimi yeter
                        if (cmdState.active === CMD.MOVE && cmdState.stretchNodes && selectedNodes.size > 0) {
                            cmdState.stretchNodes = [...selectedNodes].filter(id => model.nodes[id]);
                            cmdState.phase = PHASE.BASE_POINT;
                            updateCommandUI();
                            showToast(`${cmdState.stretchNodes.length} node(s) selected. Click base point.`);
                        }
                        else if (selectedBeamIds.length > 0) {
                            cmdState.selectedBeamIds = selectedBeamIds;
                            
                            if (cmdState.active === CMD.EXTEND || cmdState.active === CMD.TRIM) {
                                cmdState.boundaryEdges = [];
                                cmdState.phase = PHASE.DESTINATION;
                            } else if (cmdState.active === CMD.SPLIT || cmdState.active === CMD.ARRAY) {
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
            
            // X / Y / Z: cizerken eksen kilidi (SketchUp'taki ok tuslari
            // gibi). Komut girisi bos oldugu surece girise yazilmaz; bir
            // koordinat yazarken basilan harf girdinin parcasidir.
            if (cmdState.active === CMD.LINE && cmdState.linePoints.length > 0 &&
                /^[xyz]$/i.test(e.key) && !e.ctrlKey && !e.altKey &&
                (!isCmdInput || !(cmdElements.input && cmdElements.input.value.trim()))) {
                e.preventDefault();
                e.stopPropagation();
                eksenKilidiDegistir(e.key.toUpperCase());
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
            
            // For LINE command, use last point as base point for ortho
            let orthoBase = cmdState.basePoint;
            if (cmdState.active === CMD.LINE && cmdState.linePoints.length > 0) {
                orthoBase = cmdState.linePoints[cmdState.linePoints.length - 1];
            }

            // Imlecin model noktasi TEK yoldan (imlecNoktasi3D): once ekranda
            // dugum, sonra eksen kilidi, sonra etkin duzlem + ortho + yapisma.
            // Fare hareketi de ayni yolu kullanir; onizleme ile tiklama ayni
            // yere duser.
            const imlec = imlecNoktasi3D(e.clientX, e.clientY, container, orthoBase);
            if (!imlec) {
                showToast('Work plane is edge-on to this view - pick another view or plane', 'warning');
                return true;
            }
            const modelPos = imlec.pos;
            const snapPoint = imlec.snap;
            cmdState.currentSnapPoint = snapPoint || null;

            // Handle based on command and phase
            if (cmdState.active === CMD.COPY || cmdState.active === CMD.MOVE) {
                if (cmdState.phase === PHASE.BASE_POINT) {
                    // Set base point
                    cmdState.basePoint = { x: modelPos.x, y: modelPos.y, z: modelPos.z || 0 };
                    cmdState.basePointScreen = { x: e.clientX, y: e.clientY };
                    showBasePointMarker(e.clientX, e.clientY);
                    cmdState.phase = PHASE.DESTINATION;
                    updateCommandUI();
                    return true;
                } else if (cmdState.phase === PHASE.DESTINATION) {
                    // Calculate offset and execute
                    const offsetX = modelPos.x - cmdState.basePoint.x;
                    const offsetY = modelPos.y - cmdState.basePoint.y;
                    const offsetZ = (modelPos.z || 0) - (cmdState.basePoint.z || 0);
                    
                    if (cmdState.active === CMD.COPY) {
                        executeCopyWithOffset(offsetX, offsetY, offsetZ);
                    } else {
                        executeMoveWithOffset(offsetX, offsetY, offsetZ);
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
                // Fare hareketinde ekrandan bulunan kiris (3B); duzlem noktasi
                // kolonu ve ust kat kirisini bulamiyordu.
                const beamOnPoint = (cmdState.hoverBeam && cmdState.hoverPoint) ? cmdState.hoverPoint
                    : findPointOnBeam(modelPos.x, modelPos.y, 0.2);
                if (beamOnPoint) {
                    executeTrimBeam(beamOnPoint.elemId, beamOnPoint.pointX ?? modelPos.x, beamOnPoint.pointY ?? modelPos.y);
                }
                return true;
            } else if (cmdState.active === CMD.LINE) {
                // Tiklama, yazilan koordinat, uzunluk, @dx,dy - hepsi ayni
                // fonksiyona gider (ciziyeNoktaEkle). Eskiden bes kopya vardi
                // ve bazilari z'yi dusuruyordu.
                ciziyeNoktaEkle({ x: modelPos.x, y: modelPos.y, z: modelPos.z || 0 },
                    snapPoint && snapPoint.type === 'LEN' ? snapPoint : null);
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
            
            // Ofset kopyasi: kot korunur, hedefte dugum varsa ona baglanir,
            // kirisin ozellikleri ve yukleri gecer.
            const harita = dugumleriTuret(new Set([beam.n1, beam.n2]), d => ({ x: d.x + nx, y: d.y + ny, z: d.z || 0 }));
            const newIds = [];
            kirisleriTuret([elemId], harita, newIds);
            
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
            // Birlesik kiris keepNodes[0] -> keepNodes[1] yonunde; parcalar o
            // yone cevrilir ki yukler ve uc ozellikleri dogru yere dussun.
            const L3 = (a, b) => Math.hypot(b.x - a.x, b.y - a.y, (b.z || 0) - (a.z || 0));
            const e1y = (e1.n1 === sharedNode) ? kirisiTersCevir(e1) : e1;
            const e2y = (e2.n2 === sharedNode) ? kirisiTersCevir(e2) : e2;
            const birlesik = kirisleriBirlestirNesne(e1y, e2y, L3(n1a, n1b), L3(n2a, n2b), keepNodes[0], keepNodes[1]);
            delete model.elements[id1];
            delete model.elements[id2];

            // Check if shared node is used by other beams
            const usedElsewhere = Object.values(model.elements).some(b => b.n1 === sharedNode || b.n2 === sharedNode);
            if (!usedElsewhere) delete model.nodes[sharedNode];

            const newId = nextElementId++;
            birlesik.id = newId;
            model.elements[newId] = birlesik;
            
            showToast('Joined');
            cancelCommand();
            if (currentViewMode === '3d') update3DScene();
            else draw();
            updatePropertiesPanel();
        }
        
        // Auto-split beams at intersections.
        //
        // UC BOYUTLU. Eskiden yalnizca x-y'ye bakiyordu: z=3'teki bir kiris,
        // altindan gecen z=0'daki kirisle "kesisti" sayilip ikisi de
        // bolunuyordu; kesisim dugumu z'siz (=0) kuruldugu icin ust kiris
        // zemine dokunan sahte bir dugum kazaniyordu. Kolonun ust ucu da
        // planda zemin kirisinin "ustunde" gorundugu icin zemin kirisi
        // kolon tepesinde bolunuyordu. Bir 3B cerceve boyle kurulamaz.
        //
        // Kesisim = planda kesisen iki dogrunun O noktada AYNI kotada
        // olmasi (snap.js'teki findIntersectionsWithExistingBeams ile ayni
        // olcut). Uc noktanin kiris uzerinde olmasi da 3B uzakliktir.
        function autoSplitAtIntersections(newBeamIds) {
            const EPSILON = 0.0001;
            const KOTA_TOL = 0.001;     // 1 mm
            const z = n => n.z || 0;
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

                    // Plan kesisimi + kota esitligi
                    const d = (n1.x - n2.x) * (on1.y - on2.y) - (n1.y - n2.y) * (on1.x - on2.x);
                    if (Math.abs(d) >= 1e-10) {
                        const t = ((n1.x - on1.x) * (on1.y - on2.y) - (n1.y - on1.y) * (on1.x - on2.x)) / d;
                        const u = -((n1.x - n2.x) * (n1.y - on1.y) - (n1.y - n2.y) * (n1.x - on1.x)) / d;

                        if (t > EPSILON && t < 1 - EPSILON && u > EPSILON && u < 1 - EPSILON) {
                            const zYeni = z(n1) + t * (z(n2) - z(n1));
                            const zVar  = z(on1) + u * (z(on2) - z(on1));
                            if (Math.abs(zYeni - zVar) <= KOTA_TOL) {
                                const ix = n1.x + t * (n2.x - n1.x);
                                const iy = n1.y + t * (n2.y - n1.y);
                                intersections.push({ x: ix, y: iy, z: zYeni, tNew: t, tOther: u, otherElemId: parseInt(otherId) });
                            }
                        }
                    }

                    // Yeni kirisin uc noktasi mevcut kirisin UZERINDE mi (3B)?
                    const checkPointOnSegment = (p, a, b) => {
                        const dx = b.x - a.x, dy = b.y - a.y, dz = z(b) - z(a);
                        const len2 = dx*dx + dy*dy + dz*dz;
                        if (len2 < EPSILON * EPSILON) return null;
                        const t = ((p.x - a.x) * dx + (p.y - a.y) * dy + (z(p) - z(a)) * dz) / len2;
                        if (t <= EPSILON || t >= 1 - EPSILON) return null;
                        const cx = a.x + t * dx, cy = a.y + t * dy, cz = z(a) + t * dz;
                        const dist = Math.sqrt((p.x - cx)**2 + (p.y - cy)**2 + (z(p) - cz)**2);
                        if (dist < KOTA_TOL) return { t, x: cx, y: cy, z: cz };
                        return null;
                    };

                    const n1OnOther = checkPointOnSegment(n1, on1, on2);
                    if (n1OnOther) {
                        endpointSplits.push({ tOther: n1OnOther.t, otherElemId: parseInt(otherId), nodeId: newBeam.n1 });
                    }

                    const n2OnOther = checkPointOnSegment(n2, on1, on2);
                    if (n2OnOther) {
                        endpointSplits.push({ tOther: n2OnOther.t, otherElemId: parseInt(otherId), nodeId: newBeam.n2 });
                    }
                });

                if (intersections.length > 0) {
                    intersections.sort((a, b) => a.tNew - b.tNew);
                    totalSplits += intersections.length;

                    // Create nodes at intersections (z ile)
                    const newNodes = intersections.map(inter => {
                        const existing = findNodeAt(inter.x, inter.y, 0.001, inter.z);
                        if (existing) return existing;
                        const id = nextNodeId++;
                        model.nodes[id] = { x: inter.x, y: inter.y, z: inter.z };
                        return id;
                    });

                    // Yeni kirisi parcala (ozellikler ve yukler dogru araliklarla)
                    kirisiParcala(newId, newNodes, intersections.map(i => i.tNew));

                    // Diger kirisleri kesisim dugumunde bol. Ayni kiris birden
                    // fazla yerde kesiliyorsa ilk bolmeden sonra kimligi
                    // degisir: dugumu iceren parca yeniden bulunur.
                    intersections.forEach((inter, idx) => {
                        const nodeId = newNodes[idx];
                        let hedefId = inter.otherElemId;
                        if (!model.elements[hedefId]) {
                            const p = model.nodes[nodeId];
                            hedefId = Object.keys(model.elements).map(Number).find(id => {
                                const e = model.elements[id], a = model.nodes[e.n1], b = model.nodes[e.n2];
                                if (!a || !b || e.n1 === nodeId || e.n2 === nodeId) return false;
                                const k = dugumunKirisKesri(e, nodeId);
                                if (k <= EPSILON || k >= 1 - EPSILON) return false;
                                const cx = a.x + k * (b.x - a.x), cy = a.y + k * (b.y - a.y), cz = z(a) + k * (z(b) - z(a));
                                return Math.hypot(p.x - cx, p.y - cy, z(p) - cz) < KOTA_TOL;
                            });
                            if (hedefId === undefined) return;
                        }
                        const otherBeam = model.elements[hedefId];
                        if (otherBeam.n1 === nodeId || otherBeam.n2 === nodeId) return;
                        kirisiDugumdeBol(hedefId, nodeId);
                    });
                }

                // Process endpoint splits (for parallel copy / T joints)
                endpointSplits.forEach(split => {
                    const otherBeam = model.elements[split.otherElemId];
                    if (!otherBeam || otherBeam.n1 === split.nodeId || otherBeam.n2 === split.nodeId) return;

                    kirisiDugumdeBol(split.otherElemId, split.nodeId);
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
            
            // For LINE command, use last point as base point for ortho
            let orthoBase = cmdState.basePoint;
            if (cmdState.active === CMD.LINE && cmdState.linePoints.length > 0) {
                orthoBase = cmdState.linePoints[cmdState.linePoints.length - 1];
            }

            // Tiklamayla AYNI yol (imlecNoktasi3D) - bkz. handleCommandClick3D.
            const imlec = imlecNoktasi3D(e.clientX, e.clientY, container, orthoBase);
            if (!imlec) { hideSnapMarker(); hideTooltip(); return; }
            const modelPos = imlec.pos;
            const snapPoint = imlec.snap;
            cmdState.currentSnapPoint = snapPoint || null;

            // Update coordinates display
            updateCoordsDisplay(modelPos.x, modelPos.y, modelPos.z);

            // Gorsel snap isaretcisi (kapsayiciya gore konum).
            if (snapPoint && typeof modelToScreen3D === 'function') {
                const sp = modelToScreen3D(snapPoint.x, snapPoint.y, container, snapPoint.z || 0);
                if (sp) {
                    const cRect = container.getBoundingClientRect();
                    const etiket = snapPoint.type === 'LEN'
                        ? `= ${(snapPoint.boy * 1000).toFixed(0)} mm${snapPoint.paralel ? ' (parallel)' : ''}${snapPoint.eksen ? ' on ' + snapPoint.eksen : ''}`
                        : (snapPoint.type === 'AXIS' ? `On ${snapPoint.eksen} axis` : undefined);
                    showSnapMarker(sp.x - cRect.left, sp.y - cRect.top, snapPoint.type, etiket);
                }
            } else {
                hideSnapMarker();
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
                    updateCopyMovePreview3D(dx, dy, (modelPos.z || 0) - (cmdState.basePoint.z || 0));
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
                // Imlecin altindaki kiris EKRANDAN bulunur (kolonlar ve ust
                // kat kirisleri dahil); duzlem noktasi x-y'de bakiyordu.
                const beamPoint = ekrandaKirisNoktasi(e.clientX, e.clientY, container, 12);

                if (beamPoint) {
                    cmdState.hoverBeam = beamPoint.elemId;
                    cmdState.hoverPoint = beamPoint;

                    const screenPos = modelToScreen3D(beamPoint.pointX, beamPoint.pointY, container, beamPoint.pointZ || 0);
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
                // TRIM - find beam segment under cursor (ekrandan, 3B)
                const beamPoint = ekrandaKirisNoktasi(e.clientX, e.clientY, container, 12);
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
                    
                    // Track cursor direction for distance input. UC boyut:
                    // yazilan uzunluk imlecin yonunde gider, Z'de de.
                    if (dist > 1) { // More than 1mm movement
                        const L = dist / 1000;
                        cmdState.lastCursorDir = { x: dx / L, y: dy / L, z: dz / L };
                    }

                    // Show direction indicator in tooltip
                    const dirText = yonOku(cmdState.lastCursorDir);

                    // Cizerken asil bakilan sey uzunluk; once o gelir ve
                    // buyuk yazilir. X/Y zaten durum seridinde, "Type distance
                    // + Enter" da komut cubugunda yaziyor - imlecin yaninda
                    // dort satir okumak zorunda kalmayin diye buradan cikti.
                    let tipText = `<span class="distance">${dist.toFixed(0)} mm ${dirText}</span>`;
                    if (cmdState.eksenKilidi) tipText += ` <span style="color:var(--warning);font-size:var(--fs-xs)">${cmdState.eksenKilidi} LOCK</span>`;
                    if (cmdState.orthoMode) tipText += ` <span style="color:var(--success);font-size:var(--fs-xs)">ORTHO</span>`;
                    if (snapPoint && snapPoint.type) tipText += ` <span style="color:var(--accent-info);font-size:var(--fs-xs)">${snapPoint.type === 'LEN' ? '= ' + (snapPoint.boy * 1000).toFixed(0) : (snapPoint.type === 'AXIS' ? snapPoint.eksen + ' AXIS' : snapPoint.type)}</span>`;
                    showTooltipAt(e.clientX, e.clientY, tipText);

                    updateLinePreview3D(modelPos);
                } else {
                    // First point - just show coordinates
                    const zMM = ((modelPos.z || 0) * 1000).toFixed(0);
                    let tipText = `<span style="color:var(--text-2);font-size:var(--fs-xs)">X: ${xMM}  Y: ${yMM}  Z: ${zMM}</span>`;
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
        
        // offsetZ eklendi: XZ/YZ duzleminde tasima/kopyalama onizlemesi
        // z'yi gostermezse ne yaptiginiz gorunmuyor.
        function updateCopyMovePreview3D(offsetX, offsetY, offsetZ = 0) {
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
                    n1.x + offsetX, n1.y + offsetY, (n1.z || 0) + (offsetZ || 0),
                    n2.x + offsetX, n2.y + offsetY, (n2.z || 0) + (offsetZ || 0)
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
                    rn1.x, rn1.y, rn1.z || 0,
                    rn2.x, rn2.y, rn2.z || 0
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
                    mn1.x, mn1.y, mn1.z || 0,
                    mn2.x, mn2.y, mn2.z || 0
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
                lastPt.x, lastPt.y, (lastPt.z || 0) + 0.01,
                currentPos.x, currentPos.y, (currentPos.z || 0) + 0.01
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
                n1.x + nx, n1.y + ny, (n1.z || 0) + 0.01,
                n2.x + nx, n2.y + ny, (n2.z || 0) + 0.01
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
