        // ============== DXF IMPORT ==============
        function importDXF(event) {
            const file = event.target.files[0];
            if (!file) {
                debugLog('No file selected');
                return;
            }
            
            // Open wizard instead of direct import
            openImportWizard(file, 'dxf');
        }
        
        function processImportDXF(file, structureType, deckZ, bulkheadX, bulkheadOrient) {
            debugLog('DXF file selected:', file.name, file.size, 'bytes');
            showLoading('Importing DXF file...');
            
            const reader = new FileReader();
            reader.onload = e => {
                try {
                    const dxfContent = e.target.result;
                    debugLog('DXF content length:', dxfContent.length);
                    
                    const dxfData = parseDXF(dxfContent);
                    debugLog('Parsed DXF:', dxfData.lines.length, 'lines');
                    
                    if (dxfData.lines.length === 0) {
                        hideLoading();
                        showToast('No LINE entities found in DXF', 'warning');
                        return;
                    }
                    
                    // Convert to model with coordinate transformation
                    convertDXFToModelWithTransform(dxfData, structureType, deckZ, bulkheadX, bulkheadOrient);
                    
                    updateModelSummary();
                    fitView();
                    
                    // Calculate model bounds for info message
                    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                    Object.values(model.nodes).forEach(n => {
                        minX = Math.min(minX, n.x);
                        minY = Math.min(minY, n.y);
                        maxX = Math.max(maxX, n.x);
                        maxY = Math.max(maxY, n.y);
                    });
                    const sizeX = ((maxX - minX) * 1000).toFixed(0);
                    const sizeY = ((maxY - minY) * 1000).toFixed(0);
                    
                    const structName = structureType === 'deck' ? 'Deck' : 'Bulkhead';
                    const posInfo = structureType === 'deck' ? 
                        `Z=${(deckZ * 1000).toFixed(0)}mm` : 
                        `X=${(bulkheadX * 1000).toFixed(0)}mm (${bulkheadOrient})`;
                    
                    saveState(); // Save for undo
                    hideLoading();
                    showToast(`${structName} imported: ${Object.keys(model.nodes).length} nodes, ${Object.keys(model.elements).length} elements (${sizeX}×${sizeY}mm) [${posInfo}]`, 'success');
                    
                    // Update section table and dropdowns with imported sections
                    updateProfilesTable();
                    updateSectionDropdowns();
                } catch (err) {
                    hideLoading();
                    showToast('DXF error: ' + err.message, 'error');
                    debugError('DXF import error:', err);
                }
            };
            reader.onerror = () => {
                hideLoading();
                showToast('Error reading file', 'error');
                debugError('FileReader error');
            };
            reader.readAsText(file);
        }
        
        // Convert DXF with coordinate transformation
        function convertDXFToModelWithTransform(dxfData, structureType, deckZ, bulkheadX, bulkheadOrient) {
            // Clear or merge handling
            const hasExistingModel = Object.keys(model.nodes).length > 0;
            let mergeMode = false;
            
            if (hasExistingModel) {
                mergeMode = confirm('Merge with existing model?\n\nYes = Add to current model\nNo = Replace current model');
            }
            
            if (!mergeMode) {
                model.nodes = {};
                model.elements = {};
                model.constraints = {};
                model.loads = [];
                model.pressure = [];
                nextNodeId = 1;
                nextElementId = 1;
            }
            
            // Find bounding box for normalization
            let minX = Infinity, minY = Infinity;
            let maxX = -Infinity, maxY = -Infinity;
            dxfData.lines.forEach(line => {
                minX = Math.min(minX, line.x1, line.x2);
                minY = Math.min(minY, line.y1, line.y2);
                maxX = Math.max(maxX, line.x1, line.x2);
                maxY = Math.max(maxY, line.y1, line.y2);
            });
            
            const width = maxX - minX;
            const height = maxY - minY;
            
            // Determine scale factor (mm to m)
            const scaleFactor = Math.max(width, height) > 100 ? 0.001 : 1;
            
            const TOLERANCE = 0.001;
            
            function findOrCreateNode(rawX, rawY) {
                // Normalize and scale coordinates
                const x = (rawX - minX) * scaleFactor;
                const y = (rawY - minY) * scaleFactor;
                
                // Apply coordinate transformation based on structure type
                let finalX, finalY;
                
                if (structureType === 'deck') {
                    // Deck: XY plane - coordinates stay as is
                    finalX = x;
                    finalY = y;
                } else if (structureType === 'bulkhead') {
                    // Bulkhead: transform based on orientation
                    if (bulkheadOrient === 'YZ') {
                        // YZ plane (transverse)
                        finalX = x;
                        finalY = y;
                    } else {
                        // XZ plane (longitudinal)
                        finalX = x;
                        finalY = y;
                    }
                }
                
                // Check if node exists
                for (const [id, node] of Object.entries(model.nodes)) {
                    if (Math.abs(node.x - finalX) < TOLERANCE && Math.abs(node.y - finalY) < TOLERANCE) {
                        return parseInt(id);
                    }
                }
                
                // Create new node
                const newId = nextNodeId++;
                model.nodes[newId] = { id: newId, x: finalX, y: finalY };
                return newId;
            }
            
            // Process each line
            dxfData.lines.forEach(line => {
                const n1 = findOrCreateNode(line.x1, line.y1);
                const n2 = findOrCreateNode(line.x2, line.y2);
                
                if (n1 !== n2) {
                    // Get section from layer name using existing function
                    // layerToSection returns a section name string and adds to SECTIONS if needed
                    const sectionName = layerToSection(line.layer || '0');
                    
                    const elemId = nextElementId++;
                    model.elements[elemId] = {
                        id: elemId,
                        n1, n2,
                        section: sectionName,
                        orientation: 0,
                        lineLoads: []
                    };
                }
            });
            
            results = null;
            clearSelection();
        }
        
        function parseDXF(content) {
            const lines = content.split(/\r?\n/);
            const result = { lines: [], layers: new Set() };
            
            debugLog('Parsing DXF, total lines:', lines.length);
            
            let i = 0;
            let inEntities = false;
            
            // Find ENTITIES section
            while (i < lines.length) {
                if (lines[i].trim() === 'ENTITIES') {
                    inEntities = true;
                    debugLog('Found ENTITIES at line', i);
                    i++;
                    break;
                }
                i++;
            }
            
            if (!inEntities) {
                debugLog('ENTITIES section not found!');
                return result;
            }
            
            // Parse entities
            while (i < lines.length) {
                const code = lines[i].trim();
                const value = lines[i + 1] ? lines[i + 1].trim() : '';
                
                if (code === '0' && value === 'ENDSEC') break;
                
                if (code === '0' && value === 'LINE') {
                    const lineEntity = parseLineEntity(lines, i + 2);
                    if (lineEntity) {
                        result.lines.push(lineEntity);
                        result.layers.add(lineEntity.layer);
                        debugLog('Found LINE:', lineEntity.layer, '(', lineEntity.x1.toFixed(1), lineEntity.y1.toFixed(1), '->', lineEntity.x2.toFixed(1), lineEntity.y2.toFixed(1), ')');
                    }
                    i = lineEntity ? lineEntity.endIndex : i + 2;
                } else {
                    i++;
                }
            }
            
            return result;
        }
        
        function parseLineEntity(lines, startIdx) {
            const entity = {
                x1: 0, y1: 0, z1: 0,
                x2: 0, y2: 0, z2: 0,
                layer: '0',
                color: 7
            };
            
            let i = startIdx;
            while (i < lines.length) {
                const code = parseInt(lines[i].trim());
                const value = lines[i + 1] ? lines[i + 1].trim() : '';
                
                if (code === 0) {
                    entity.endIndex = i;
                    break;
                }
                
                switch (code) {
                    case 8: entity.layer = value; break;
                    case 62: entity.color = parseInt(value); break;
                    case 10: entity.x1 = parseFloat(value); break;
                    case 20: entity.y1 = parseFloat(value); break;
                    case 30: entity.z1 = parseFloat(value); break;
                    case 11: entity.x2 = parseFloat(value); break;
                    case 21: entity.y2 = parseFloat(value); break;
                    case 31: entity.z2 = parseFloat(value); break;
                }
                
                i += 2;
            }
            
            entity.endIndex = i;
            return entity;
        }
        
        function convertDXFToModel(dxfData) {
            model = { nodes: {}, elements: {}, constraints: {}, loads: [], pressure: [] };
            
            // DXF Color to Steel Grade mapping
            const COLOR_TO_GRADE = {
                1: 'A',      // Red → Grade A
                2: 'AH32',   // Yellow → AH32
                3: 'AH36',   // Green → AH36
                4: 'AH36',   // Cyan → AH36
                5: 'DH32',   // Blue → DH32
                6: 'DH36',   // Magenta → DH36
                7: 'AH36',   // White → AH36 (default)
                256: 'AH36'  // ByLayer → AH36
            };
            
            // Step 1: Find bounding box
            let minX = Infinity, minY = Infinity;
            let maxX = -Infinity, maxY = -Infinity;
            dxfData.lines.forEach(line => {
                minX = Math.min(minX, line.x1, line.x2);
                minY = Math.min(minY, line.y1, line.y2);
                maxX = Math.max(maxX, line.x1, line.x2);
                maxY = Math.max(maxY, line.y1, line.y2);
            });
            
            const width = maxX - minX;
            const height = maxY - minY;
            
            // Step 2: Determine scale factor (mm to m)
            // If dimensions > 100, assume mm
            const scaleFactor = Math.max(width, height) > 100 ? 0.001 : 1;
            
            debugLog(`DXF Import:`);
            debugLog(`  Raw bounds: X[${minX.toFixed(1)}, ${maxX.toFixed(1)}], Y[${minY.toFixed(1)}, ${maxY.toFixed(1)}]`);
            debugLog(`  Size: ${width.toFixed(1)} x ${height.toFixed(1)} (assumed ${scaleFactor === 0.001 ? 'mm' : 'm'})`);
            debugLog(`  Normalized: ${(width*scaleFactor).toFixed(3)}m x ${(height*scaleFactor).toFixed(3)}m`);
            
            const TOLERANCE = 0.001; // 1mm merge tolerance (in meters)
            const points = [];
            const nodeMap = {};
            
            // Step 3: Collect all endpoints (normalized to origin and scaled to meters)
            dxfData.lines.forEach(line => {
                // Normalize: subtract min values to move origin to (0,0)
                // Scale: multiply by scaleFactor to convert mm to m
                const x1 = (line.x1 - minX) * scaleFactor;
                const y1 = (line.y1 - minY) * scaleFactor;
                const x2 = (line.x2 - minX) * scaleFactor;
                const y2 = (line.y2 - minY) * scaleFactor;
                
                points.push({ x: x1, y: y1, z: 0 });
                points.push({ x: x2, y: y2, z: 0 });
            });
            
            // Step 4: Find intersections (using normalized coordinates)
            for (let i = 0; i < dxfData.lines.length; i++) {
                for (let j = i + 1; j < dxfData.lines.length; j++) {
                    const l1 = dxfData.lines[i];
                    const l2 = dxfData.lines[j];
                    
                    const inter = lineIntersection2D(
                        (l1.x1 - minX) * scaleFactor, (l1.y1 - minY) * scaleFactor,
                        (l1.x2 - minX) * scaleFactor, (l1.y2 - minY) * scaleFactor,
                        (l2.x1 - minX) * scaleFactor, (l2.y1 - minY) * scaleFactor,
                        (l2.x2 - minX) * scaleFactor, (l2.y2 - minY) * scaleFactor
                    );
                    if (inter) {
                        points.push({ x: inter.x, y: inter.y, z: 0 });
                    }
                }
            }
            
            // Step 5: Merge close points and create nodes
            const mergedPoints = [];
            points.forEach(p => {
                const existing = mergedPoints.find(mp => 
                    Math.abs(mp.x - p.x) < TOLERANCE &&
                    Math.abs(mp.y - p.y) < TOLERANCE
                );
                if (!existing) {
                    mergedPoints.push({ ...p });
                }
            });
            
            // Sort points for consistent ordering (bottom-left to top-right)
            mergedPoints.sort((a, b) => {
                if (Math.abs(a.y - b.y) < TOLERANCE) return a.x - b.x;
                return a.y - b.y;
            });
            
            // Create nodes
            mergedPoints.forEach((p, idx) => {
                const nodeId = idx + 1;
                model.nodes[nodeId] = { id: nodeId, x: p.x, y: p.y, z: p.z || 0 };
                nodeMap[`${p.x.toFixed(4)},${p.y.toFixed(4)}`] = nodeId;
            });
            
            debugLog(`  Created ${mergedPoints.length} nodes`);
            
            // Helper to find node
            function findNode(x, y) {
                for (const [key, nodeId] of Object.entries(nodeMap)) {
                    const [nx, ny] = key.split(',').map(parseFloat);
                    if (Math.abs(nx - x) < TOLERANCE && Math.abs(ny - y) < TOLERANCE) {
                        return nodeId;
                    }
                }
                return null;
            }
            
            // Step 6: Create elements (split at intersections)
            let elemId = 1;
            
            dxfData.lines.forEach((line, lineIdx) => {
                // Normalized and scaled line coordinates
                const sx1 = (line.x1 - minX) * scaleFactor;
                const sy1 = (line.y1 - minY) * scaleFactor;
                const sx2 = (line.x2 - minX) * scaleFactor;
                const sy2 = (line.y2 - minY) * scaleFactor;
                
                // Get section from layer name
                let sectionInfo = layerToSection(line.layer);
                
                // Get grade from color
                let grade = COLOR_TO_GRADE[line.color] || 'AH36';
                
                // Find all points on this line segment
                const linePoints = [];
                Object.values(model.nodes).forEach(node => {
                    if (pointOnLineSegment(node.x, node.y, sx1, sy1, sx2, sy2, TOLERANCE)) {
                        const dist = Math.sqrt((node.x - sx1)**2 + (node.y - sy1)**2);
                        linePoints.push({ nodeId: node.id, dist });
                    }
                });
                
                // Sort by distance from start
                linePoints.sort((a, b) => a.dist - b.dist);
                
                // Create elements between consecutive points
                for (let i = 0; i < linePoints.length - 1; i++) {
                    const n1 = model.nodes[linePoints[i].nodeId];
                    const n2 = model.nodes[linePoints[i + 1].nodeId];
                    const elemLength = Math.sqrt((n2.x - n1.x)**2 + (n2.y - n1.y)**2);
                    
                    model.elements[elemId] = {
                        id: elemId,
                        n1: linePoints[i].nodeId,
                        n2: linePoints[i + 1].nodeId,
                        section: sectionInfo,
                        grade: grade,
                        dxfColor: line.color,
                        dxfLayer: line.layer,
                        lineLoads: []
                    };
                    
                    debugLog(`  Element ${elemId}: Node ${linePoints[i].nodeId} → ${linePoints[i + 1].nodeId}, L=${(elemLength*1000).toFixed(0)}mm, Section=${sectionInfo}`);
                    elemId++;
                }
            });
            
            debugLog(`  Created ${elemId - 1} elements`);
            
            results = null;
            selectedElement = null;
            selectedNode = null;
            selectedElements.clear();
            selectedNodes.clear();
            setStyle('elementDetails', 'display', 'none');
        }
        
        function lineIntersection2D(x1, y1, x2, y2, x3, y3, x4, y4) {
            const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
            if (Math.abs(denom) < 1e-10) return null;
            
            const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
            const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;
            
            // Check if intersection is within both segments (not at endpoints)
            if (t > 0.001 && t < 0.999 && u > 0.001 && u < 0.999) {
                return {
                    x: x1 + t * (x2 - x1),
                    y: y1 + t * (y2 - y1)
                };
            }
            return null;
        }
        
        function pointOnLineSegment(px, py, x1, y1, x2, y2, tol) {
            const lineLen = Math.sqrt((x2 - x1)**2 + (y2 - y1)**2);
            const d1 = Math.sqrt((px - x1)**2 + (py - y1)**2);
            const d2 = Math.sqrt((px - x2)**2 + (py - y2)**2);
            return Math.abs(d1 + d2 - lineLen) < tol;
        }
        
        function layerToSection(layer) {
            // Parse layer name: PROFILE_PLATEWIDTHxPLATETHICKNESS
            // Example: FB120x12_600x12 → FB 120×12 + Plate 600×12
            // Example: HP200x10_600x12 → HP200x10 + Plate 600×12
            
            const layerClean = layer.trim().replace(/\s+/g, '');
            
            // Split by underscore to separate profile and plate
            const parts = layerClean.split('_');
            const profileStr = parts[0].toUpperCase();
            const plateStr = parts.length > 1 ? parts[1] : null;
            
            // Parse plate dimensions
            let plateWidth = 0, plateThick = 0;
            if (plateStr) {
                const plateMatch = plateStr.match(/(\d+(?:\.\d+)?)[Xx](\d+(?:\.\d+)?)/);
                if (plateMatch) {
                    plateWidth = parseFloat(plateMatch[1]) / 1000;  // mm to m
                    plateThick = parseFloat(plateMatch[2]) / 1000;  // mm to m
                }
            }
            
            // Parse profile
            let profileName = '';
            let profileProps = null;
            
            // HP Profile
            // Ozellikler js/core/profiles.js'ten gelir - arayuzden uretilen ayni profille
            // birebir ayni sayilar. Eskiden burada Iz = A x 0.001 gibi, boyutsal olarak
            // atalet momenti bile olmayan degerler vardi (arayuz yolundan 100 kat farkli).
            const hpMatch = profileStr.match(/HP\s*(\d+)\s*[Xx]\s*(\d+)/);
            if (hpMatch) {
                const b = parseInt(hpMatch[1]), t = parseInt(hpMatch[2]);
                profileName = `HP${b}x${t}`;
                profileProps = SECTIONS[profileName]
                    ? { ...SECTIONS[profileName] }
                    : profilePropertiesSI(profileProperties('HP', { b: b, t: t }));
            }
            
            // FB Profile (Flat Bar)
            const fbMatch = profileStr.match(/FB\s*(\d+)\s*[Xx]\s*(\d+)/);
            if (fbMatch) {
                const h = parseInt(fbMatch[1]), t = parseInt(fbMatch[2]);
                profileName = `FB${h}x${t}`;
                profileProps = profilePropertiesSI(profileProperties('FB', { h: h, t: t }));
            }
            
            // T Profile: T100x10/100x10 or T100x10+100x10 or T400x12+150x20
            // h = web height (flans HARIC)
            const tMatch = profileStr.match(/T\s*(\d+)\s*[Xx]\s*(\d+)\s*[\/\+]\s*(\d+)\s*[Xx]\s*(\d+)/);
            if (tMatch) {
                const h_mm = parseInt(tMatch[1]), tw_mm = parseInt(tMatch[2]);
                const bf_mm = parseInt(tMatch[3]), tf_mm = parseInt(tMatch[4]);
                profileName = `T${h_mm}x${tw_mm}/${bf_mm}x${tf_mm}`;
                profileProps = profilePropertiesSI(
                    profileProperties('T', { h: h_mm, tw: tw_mm, bf: bf_mm, tf: tf_mm }));
            }
            
            // L Profile: L100x100x10
            const lMatch = profileStr.match(/L\s*(\d+)\s*[Xx]\s*(\d+)\s*[Xx]\s*(\d+)/);
            if (lMatch) {
                const a = parseInt(lMatch[1]), b = parseInt(lMatch[2]), t = parseInt(lMatch[3]);
                profileName = `L${a}x${b}x${t}`;
                profileProps = profilePropertiesSI(profileProperties('L', { a: a, b: b, t: t }));
            }
            
            // Default if not parsed - use HP200x10 from catalog
            if (!profileProps) {
                profileName = 'HP200x10';
                const defaultHP = HP_CATALOG.find(hp => hp.name === 'HP200x10');
                if (defaultHP) {
                    profileProps = {
                        A: defaultHP.A * 1e-4,
                        Iy: defaultHP.Ixx * 1e-8,
                        Iz: defaultHP.A * 1e-4 * 0.001,
                        J: defaultHP.A * 1e-4 * 0.0001,
                        Wy: (defaultHP.Ixx * 1e-8) / (defaultHP.dx / 100),
                        h: 0.2,
                        centroidY: 0.2 - (defaultHP.dx / 100)
                    };
                } else {
                    // Fallback approximation
                    profileProps = {
                        A: 25.7e-4,
                        Iy: 886e-8,
                        Iz: 1e-7,
                        J: 1e-8,
                        Wy: 88.6e-6,
                        h: 0.2,
                        centroidY: 0.085
                    };
                }
            }
            
            // Calculate composite section if plate exists
            if (plateWidth > 0 && plateThick > 0) {
                const composite = compositeFromPlateTop(profileProps, plateWidth, plateThick);
                const fullName = `${profileName}_${parts[1]}`;
                
                SECTIONS[fullName] = composite;
                
                // Store plate info for display
                SECTIONS[fullName].plateWidth = plateWidth * 1000;  // back to mm for display
                SECTIONS[fullName].plateThick = plateThick * 1000;
                SECTIONS[fullName].profileName = profileName;
                
                return fullName;
            }
            
            // Profile only
            if (!SECTIONS[profileName]) {
                SECTIONS[profileName] = profileProps;
            }
            return profileName;
        }
        
        // Plaka USTU referansli kompozit kesit (yNA / WyTop / WyBot dondurur).
        // import.js'te ayni adla plaka ALTI referansli baska bir surum vardi; ikisi de
        // global kapsamda oldugu icin sonra yuklenen otekini eziyordu ve import
        // onizlemesi NaN gosteriyordu.
        function compositeFromPlateTop(profile, plateWidth, plateThick) {
            // Profile is below plate
            // Coordinate: Y=0 at plate top, positive downward
            // profile.centroidY is measured from BOTTOM of profile
            // We need distance from plate TOP to profile centroid
            
            const Ap = profile.A;
            const Apl = plateWidth * plateThick;
            const Atotal = Ap + Apl;
            
            // Centroids from plate top
            const yPlate = plateThick / 2;
            // Profile centroid from plate top = plateThick + (profile height - centroid from bottom)
            // = plateThick + distance from profile TOP to centroid
            const profileCentFromTop = profile.h - (profile.centroidY || profile.h / 2);
            const yProfile = plateThick + profileCentFromTop;
            
            // Combined centroid from plate top
            const yNA = (Apl * yPlate + Ap * yProfile) / Atotal;
            
            // Plate Iy about own centroid
            const IyPlate = plateWidth * Math.pow(plateThick, 3) / 12;
            
            // Combined Iy (parallel axis theorem)
            const d1 = yPlate - yNA;
            const d2 = yProfile - yNA;
            const Iy = IyPlate + Apl * d1 * d1 + profile.Iy + Ap * d2 * d2;
            
            // Combined Iz
            const IzPlate = plateThick * Math.pow(plateWidth, 3) / 12;
            const Iz = IzPlate + (profile.Iz || 0);
            
            // Section moduli
            const yTop = yNA;                           // distance from NA to plate top
            const yBot = plateThick + profile.h - yNA;  // distance from NA to profile bottom
            const WyTop = Iy / yTop;
            const WyBot = Iy / yBot;
            
            // Wz for weak axis
            const Wz = Iz / (plateWidth / 2);
            
            return {
                A: Atotal,
                Iy: Iy,
                Iz: Iz,
                J: (plateWidth * Math.pow(plateThick, 3) + profile.h * Math.pow(0.01, 3)) / 3,
                Wy: Math.min(WyTop, WyBot),
                Wz: Wz,
                WyTop: WyTop,
                WyBot: WyBot,
                h: plateThick + profile.h,
                yNA: yNA,
                isComposite: true
            };
        }
        
        // ============== EFFECTIVE BREADTH FUNCTIONS (BV NR467) ==============
        
        function toggleEffectiveBreadth() {
            const enabled = $('plateEnabled')?.checked;
            const section = $('effectiveBreadthSection');
            if (section) {
                section.style.display = enabled ? 'block' : 'none';
            }
            if (enabled) {
                calculateEffectiveBreadth();
            }
        }
        
        function updateMemberTypeInputs() {
            const memberType = document.querySelector('input[name="memberType"]:checked')?.value || 'stiffener';
            const stiffInputs = $('stiffenerInputs');
            const psmInputs = $('psmInputs');
            
            if (stiffInputs) stiffInputs.style.display = memberType === 'stiffener' ? 'block' : 'none';
            if (psmInputs) psmInputs.style.display = memberType === 'psm' ? 'block' : 'none';
            
            calculateEffectiveBreadth();
        }
        
        function toggleCalcByRule() {
            const calcByRule = $('calcByRule')?.checked;
            const ruleInputs = $('ruleInputs');
            const manualInputs = $('manualInputs');
            const plateThickRuleDiv = $('plateThickRuleDiv');
            
            if (ruleInputs) ruleInputs.style.display = calcByRule ? 'block' : 'none';
            if (manualInputs) manualInputs.style.display = calcByRule ? 'none' : 'block';
            if (plateThickRuleDiv) plateThickRuleDiv.style.display = calcByRule ? 'block' : 'none';
            
            if (calcByRule) {
                calculateEffectiveBreadth();
            }
            updateProfilePreview();
        }
        
        function calculateEffectiveBreadth() {
            const memberType = document.querySelector('input[name="memberType"]:checked')?.value || 'stiffener';
            let beff = 0;
            
            if (memberType === 'stiffener') {
                // BV NR467 Pt B, Ch 4, Sec 6, 1.3.1 - Stiffeners (Yielding check)
                const span = parseFloat($('stiffSpan')?.value) || 2.5;      // ℓ in meters
                const spacing = parseFloat($('stiffSpacing')?.value) || 600; // s in mm
                const tpNet = parseFloat($('plateNetThick')?.value) || 12;   // tp,net in mm
                const oneSide = $('oneSide')?.checked || false;
                
                // Convert span to mm for formula (200ℓ where ℓ is in m gives result in mm)
                const spanMM = span * 1000;
                
                if (oneSide) {
                    // One side only (stiffener bounding an opening)
                    // b_eff = min(100ℓ; 0.5s)
                    beff = Math.min(100 * span, 0.5 * spacing);
                } else {
                    // Both sides
                    // b_eff = min(200ℓ; s)
                    beff = Math.min(200 * span, spacing);
                }
                
                // If plate net thickness < 8mm, b_eff ≤ 600mm
                if (tpNet < 8) {
                    beff = Math.min(beff, 600);
                }
                
            } else {
                // BV NR467 Pt B, Ch 4, Sec 6, 1.3.2 - Primary Supporting Members
                const lbdg = parseFloat($('psmBdgSpan')?.value) || 4.0;  // ℓ_bdg in meters
                const S = parseFloat($('psmSpacing')?.value) || 2.5;     // S in meters
                
                const sqrt3 = Math.sqrt(3);
                const ratio = lbdg / (S * sqrt3);
                
                if (ratio >= 1) {
                    // b_eff = S × min[1.12 / (1 + 1.75 / (ℓ_bdg^1.6 / (S√3))); 1.0]
                    const lbdgPow = Math.pow(lbdg, 1.6);
                    const denominator = lbdgPow / (S * sqrt3);
                    const factor = 1.12 / (1 + 1.75 / denominator);
                    beff = S * Math.min(factor, 1.0) * 1000; // Convert to mm
                } else {
                    // b_eff = 0.407 × ℓ_bdg / √3
                    beff = 0.407 * lbdg / sqrt3 * 1000; // Convert to mm
                }
            }
            
            // Round to integer
            beff = Math.round(beff);
            
            // Update display
            setText('calcBeff', beff + ' mm');
            
            // Update the hidden plateWidth input for createProfile
            const plateWidthInput = $('plateWidth');
            if (plateWidthInput) {
                plateWidthInput.value = beff;
            }
            
            updateProfilePreview();
            return beff;
        }
        
        function getEffectiveBreadth() {
            const plateEnabled = $('plateEnabled')?.checked;
            if (!plateEnabled) return { width: 0, thickness: 0 };
            
            const calcByRule = $('calcByRule')?.checked;
            
            let width, thickness;
            if (calcByRule) {
                width = parseFloat($('plateWidth')?.value) || calculateEffectiveBreadth();
                thickness = parseFloat($('plateThickness')?.value) || 12;
            } else {
                width = parseFloat($('plateWidth')?.value) || 300;
                thickness = parseFloat($('plateThicknessManual')?.value) || 12;
            }
            
            return { width, thickness };
        }
        
