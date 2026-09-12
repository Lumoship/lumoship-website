        // ============== INITIALIZATION ==============
        // Deferred until DOM + all modules are loaded (avoids "not defined" races)
        window.addEventListener('DOMContentLoaded', function() {
            if (typeof saveState === 'function') saveState();
            if (typeof draw === 'function') draw();
            if (typeof populateHPCatalog === 'function') populateHPCatalog();
            if (typeof updateSectionDropdowns === 'function') updateSectionDropdowns();
            if (typeof calculateEffectiveBreadth === 'function') calculateEffectiveBreadth();
            if (typeof updateProfilePreview === 'function') updateProfilePreview();
            setTimeout(function() {
                if (typeof initCommandSystem === 'function') initCommandSystem();
            }, 100);
        });
        
        // ============== COMMAND SYSTEM HELPERS ==============
        
        // Show/Hide Base Point Marker
        function showBasePointMarker(screenX, screenY) {
            if (cmdElements.basePointMarker) {
                cmdElements.basePointMarker.style.left = screenX + 'px';
                cmdElements.basePointMarker.style.top = screenY + 'px';
                cmdElements.basePointMarker.classList.add('visible');
            }
        }
        
        function hideBasePointMarker() {
            if (cmdElements.basePointMarker) {
                cmdElements.basePointMarker.classList.remove('visible');
            }
        }
        
        // Show/Hide Direction Line
        function showDirectionLine(startX, startY, endX, endY) {
            if (cmdElements.directionLine) {
                const dx = endX - startX;
                const dy = endY - startY;
                const length = Math.sqrt(dx * dx + dy * dy);
                const angle = Math.atan2(dy, dx) * 180 / Math.PI;
                
                cmdElements.directionLine.style.left = startX + 'px';
                cmdElements.directionLine.style.top = startY + 'px';
                cmdElements.directionLine.style.width = length + 'px';
                cmdElements.directionLine.style.transform = `rotate(${angle}deg)`;
                cmdElements.directionLine.classList.add('visible');
            }
        }
        
        function hideDirectionLine() {
            if (cmdElements.directionLine) {
                cmdElements.directionLine.classList.remove('visible');
            }
        }
        
        // Show/Hide Mirror Line
        function showMirrorLine(x1, y1, x2, y2) {
            if (cmdElements.mirrorLine) {
                const dx = x2 - x1;
                const dy = y2 - y1;
                const length = Math.sqrt(dx * dx + dy * dy);
                const angle = Math.atan2(dx, -dy) * 180 / Math.PI; // Perpendicular
                
                cmdElements.mirrorLine.style.left = x1 + 'px';
                cmdElements.mirrorLine.style.top = y1 + 'px';
                cmdElements.mirrorLine.style.height = length + 'px';
                cmdElements.mirrorLine.style.transform = `rotate(${angle}deg)`;
                cmdElements.mirrorLine.classList.add('visible');
            }
        }
        
        function hideMirrorLine() {
            if (cmdElements.mirrorLine) {
                cmdElements.mirrorLine.classList.remove('visible');
            }
        }
        
        // Show/Hide Split Point
        function showSplitPoint(screenX, screenY) {
            if (cmdElements.splitPoint) {
                cmdElements.splitPoint.style.left = screenX + 'px';
                cmdElements.splitPoint.style.top = screenY + 'px';
                cmdElements.splitPoint.classList.add('visible');
            }
        }
        
        function hideSplitPoint() {
            if (cmdElements.splitPoint) {
                cmdElements.splitPoint.classList.remove('visible');
            }
        }
        
        // Show/Hide Tooltip
        function showTooltipAt(screenX, screenY, html) {
            if (cmdElements.tooltip) {
                cmdElements.tooltip.innerHTML = html;
                cmdElements.tooltip.style.left = (screenX + 15) + 'px';
                cmdElements.tooltip.style.top = (screenY - 30) + 'px';
                cmdElements.tooltip.classList.add('visible');
            }
        }
        
        function hideTooltip() {
            if (cmdElements.tooltip) {
                cmdElements.tooltip.classList.remove('visible');
            }
        }
        
        // Show/Hide Dynamic Input
        function showDynamicInput(screenX, screenY, value = '') {
            if (cmdElements.dynamicInput && cmdElements.dynInputValue) {
                cmdElements.dynamicInput.style.left = (screenX + 20) + 'px';
                cmdElements.dynamicInput.style.top = (screenY + 20) + 'px';
                cmdElements.dynamicInput.classList.add('active');
                cmdElements.dynInputValue.value = value;
                cmdElements.dynInputValue.focus();
                cmdElements.dynInputValue.select();
            }
        }
        
        function hideDynamicInput() {
            if (cmdElements.dynamicInput) {
                cmdElements.dynamicInput.classList.remove('active');
            }
        }
        
        // Update Coordinates Display
        function updateCoordsDisplay(modelX, modelY) {
            if (cmdElements.coords) {
                cmdElements.coords.textContent = `X: ${modelX.toFixed(3)}  Y: ${modelY.toFixed(3)}`;
            }
        }
        
        // ============== COORDINATE CONVERSION ==============
        
        // Screen to Model coordinates (3D view)
        function screenToModel3D(screenX, screenY, container) {
            if (!threeCamera || !container) return { x: 0, y: 0, z: 0 };
            
            const rect = container.getBoundingClientRect();
            const mouse = new THREE.Vector2(
                ((screenX - rect.left) / rect.width) * 2 - 1,
                -((screenY - rect.top) / rect.height) * 2 + 1
            );
            
            const raycaster = new THREE.Raycaster();
            raycaster.setFromCamera(mouse, threeCamera);
            
            // Project onto the active work plane (or Z=0 by default)
            let normal, constant;
            if (typeof activeWorkPlane !== 'undefined' && activeWorkPlane) {
                const o = activeWorkPlane.offset;
                if (activeWorkPlane.axis === 'X') { normal = new THREE.Vector3(1, 0, 0); constant = -o; }
                else if (activeWorkPlane.axis === 'Y') { normal = new THREE.Vector3(0, 1, 0); constant = -o; }
                else { normal = new THREE.Vector3(0, 0, 1); constant = -o; }
            } else {
                normal = new THREE.Vector3(0, 0, 1); constant = 0;
            }
            const plane = new THREE.Plane(normal, constant);
            const intersection = new THREE.Vector3();
            raycaster.ray.intersectPlane(plane, intersection);
            
            if (intersection) {
                return { x: intersection.x, y: intersection.y, z: intersection.z };
            }
            
            return { x: 0, y: 0, z: 0 };
        }
        
        // Model to Screen coordinates (3D view)
        function modelToScreen3D(modelX, modelY, container, modelZ = 0) {
            if (!threeCamera || !container) return { x: 0, y: 0 };
            
            const rect = container.getBoundingClientRect();
            const vector = new THREE.Vector3(modelX, modelY, modelZ);
            vector.project(threeCamera);
            
            return {
                x: ((vector.x + 1) / 2) * rect.width + rect.left,
                y: ((-vector.y + 1) / 2) * rect.height + rect.top
            };
        }
        
        // Apply Ortho constraint
        function applyOrtho(baseX, baseY, currentX, currentY) {
            if (!cmdState.orthoMode) return { x: currentX, y: currentY };
            
            const dx = currentX - baseX;
            const dy = currentY - baseY;
            
            // Constrain to horizontal or vertical
            if (Math.abs(dx) > Math.abs(dy)) {
                return { x: currentX, y: baseY };
            } else {
                return { x: baseX, y: currentY };
            }
        }
        
        // Grid size for grid snap (0.1m = 100mm)
        var GRID_SIZE = 0.1;
        var SNAP_EPSILON = 0.0001;
        
        // Segment intersection helper
        function segmentIntersect(p1, p2, p3, p4) {
            const d = (p1.x - p2.x) * (p3.y - p4.y) - (p1.y - p2.y) * (p3.x - p4.x);
            if (Math.abs(d) < 1e-10) return null;
            const t = ((p1.x - p3.x) * (p3.y - p4.y) - (p1.y - p3.y) * (p3.x - p4.x)) / d;
            const u = -((p1.x - p2.x) * (p1.y - p3.y) - (p1.y - p2.y) * (p1.x - p3.x)) / d;
            if (t > 0.001 && t < 0.999 && u > 0.001 && u < 0.999) {
                return { x: p1.x + t * (p2.x - p1.x), y: p1.y + t * (p2.y - p1.y), t, u };
            }
            return null;
        }
        
        function findSnapPoint(modelX, modelY, tolerance = 0.15) {
            if (!cmdState.snapMode) return null;
            
            let best = null;
            let minDist = tolerance;
            let snapType = '';
            
            // 1. Endpoint snap (highest priority)
            Object.values(model.nodes).forEach(node => {
                const dist = Math.sqrt((node.x - modelX) ** 2 + (node.y - modelY) ** 2);
                if (dist < minDist) {
                    minDist = dist;
                    best = { x: node.x, y: node.y };
                    snapType = 'END';
                }
            });
            
            // 2. Midpoint snap
            Object.values(model.elements).forEach(elem => {
                const n1 = model.nodes[elem.n1];
                const n2 = model.nodes[elem.n2];
                if (n1 && n2) {
                    const midX = (n1.x + n2.x) / 2;
                    const midY = (n1.y + n2.y) / 2;
                    const dist = Math.sqrt((midX - modelX) ** 2 + (midY - modelY) ** 2);
                    if (dist < minDist) {
                        minDist = dist;
                        best = { x: midX, y: midY };
                        snapType = 'MID';
                    }
                }
            });
            
            // 3. Intersection snap
            if (cmdState.snapIntersection) {
                const elems = Object.values(model.elements);
                for (let i = 0; i < elems.length; i++) {
                    for (let j = i + 1; j < elems.length; j++) {
                        const e1 = elems[i], e2 = elems[j];
                        const n1 = model.nodes[e1.n1], n2 = model.nodes[e1.n2];
                        const n3 = model.nodes[e2.n1], n4 = model.nodes[e2.n2];
                        if (!n1 || !n2 || !n3 || !n4) continue;
                        const inter = segmentIntersect(n1, n2, n3, n4);
                        if (inter) {
                            const dist = Math.sqrt((inter.x - modelX) ** 2 + (inter.y - modelY) ** 2);
                            if (dist < minDist) {
                                minDist = dist;
                                best = { x: inter.x, y: inter.y };
                                snapType = 'INT';
                            }
                        }
                    }
                }
            }
            
            // 4. Perpendicular snap (when drawing line from base point)
            if (cmdState.snapPerpendicular && cmdState.basePoint) {
                Object.values(model.elements).forEach(elem => {
                    const n1 = model.nodes[elem.n1], n2 = model.nodes[elem.n2];
                    if (!n1 || !n2) return;
                    const dx = n2.x - n1.x, dy = n2.y - n1.y;
                    const len = Math.sqrt(dx*dx + dy*dy);
                    if (len < SNAP_EPSILON) return;
                    // Project basePoint onto line
                    const t = ((cmdState.basePoint.x - n1.x) * dx + (cmdState.basePoint.y - n1.y) * dy) / (len * len);
                    if (t < 0 || t > 1) return;
                    const perpX = n1.x + t * dx, perpY = n1.y + t * dy;
                    const dist = Math.sqrt((perpX - modelX) ** 2 + (perpY - modelY) ** 2);
                    if (dist < minDist) {
                        minDist = dist;
                        best = { x: perpX, y: perpY };
                        snapType = 'PERP';
                    }
                });
            }
            
            // 5. Nearest snap - closest point on any beam
            if (cmdState.snapNearest && !best) {
                Object.values(model.elements).forEach(elem => {
                    const n1 = model.nodes[elem.n1], n2 = model.nodes[elem.n2];
                    if (!n1 || !n2) return;
                    
                    const dx = n2.x - n1.x, dy = n2.y - n1.y;
                    const len = Math.sqrt(dx*dx + dy*dy);
                    if (len < 0.001) return;
                    
                    // Project point onto line segment
                    let t = ((modelX - n1.x) * dx + (modelY - n1.y) * dy) / (len * len);
                    t = Math.max(0, Math.min(1, t));
                    
                    const nearX = n1.x + t * dx;
                    const nearY = n1.y + t * dy;
                    const dist = Math.sqrt((nearX - modelX) ** 2 + (nearY - modelY) ** 2);
                    
                    if (dist < minDist) {
                        minDist = dist;
                        best = { x: nearX, y: nearY };
                        snapType = 'NEAR';
                    }
                });
            }
            
            // 6. Grid snap (lowest priority)
            if (cmdState.snapGrid && !best) {
                const gx = Math.round(modelX / GRID_SIZE) * GRID_SIZE;
                const gy = Math.round(modelY / GRID_SIZE) * GRID_SIZE;
                const dist = Math.sqrt((gx - modelX) ** 2 + (gy - modelY) ** 2);
                if (dist < tolerance) {
                    best = { x: gx, y: gy };
                    snapType = 'GRID';
                }
            }
            
            if (best) best.type = snapType;
            return best;
        }
        
        // ============== OBJECT SNAP MARKER (visual) ==============
        var SNAP_MARKER_CONFIG = {
            END:  { color: 'var(--success)', label: 'Endpoint',      shape: '<rect x="5" y="5" width="14" height="14" fill="none" stroke="var(--success)" stroke-width="2"/>' },
            MID:  { color: 'var(--warning)', label: 'Midpoint',      shape: '<polygon points="12,4 20,19 4,19" fill="none" stroke="var(--warning)" stroke-width="2"/>' },
            INT:  { color: 'var(--warning)', label: 'Intersection',  shape: '<line x1="5" y1="5" x2="19" y2="19" stroke="var(--warning)" stroke-width="2"/><line x1="19" y1="5" x2="5" y2="19" stroke="var(--warning)" stroke-width="2"/>' },
            NEAR: { color: 'var(--primary)', label: 'Nearest',       shape: '<polygon points="12,4 20,12 12,20 4,12" fill="none" stroke="var(--primary)" stroke-width="2"/>' },
            GRID: { color: 'var(--text-2)', label: '',          shape: '<line x1="12" y1="4" x2="12" y2="20" stroke="var(--text-2)" stroke-width="1.5"/><line x1="4" y1="12" x2="20" y2="12" stroke="var(--text-2)" stroke-width="1.5"/>' },
            PERP: { color: 'var(--primary)', label: 'Perpendicular', shape: '<path d="M5 5 L5 19 L19 19" fill="none" stroke="var(--primary)" stroke-width="2"/><rect x="6" y="14" width="5" height="5" fill="none" stroke="var(--primary)" stroke-width="1.2"/>' }
        };
        
        function showSnapMarker(screenX, screenY, type) {
            const marker = document.getElementById('snapMarker');
            const svg = document.getElementById('snapMarkerSvg');
            const label = document.getElementById('snapMarkerLabel');
            if (!marker || !svg) return;
            const c = SNAP_MARKER_CONFIG[type] || SNAP_MARKER_CONFIG.END;
            svg.innerHTML = c.shape;
            if (label) { label.textContent = c.label; label.style.color = c.color; }
            marker.style.left = screenX + 'px';
            marker.style.top = screenY + 'px';
            marker.style.display = 'block';
        }
        
        function hideSnapMarker() {
            const marker = document.getElementById('snapMarker');
            if (marker) marker.style.display = 'none';
        }
        
        // Find point on beam (for split)
        function findPointOnBeam(modelX, modelY, tolerance = 0.15) {
            let result = null;
            let minDist = tolerance;
            
            Object.entries(model.elements).forEach(([elemId, elem]) => {
                const n1 = model.nodes[elem.n1];
                const n2 = model.nodes[elem.n2];
                if (!n1 || !n2) return;
                
                // Calculate distance from point to line segment
                const dx = n2.x - n1.x;
                const dy = n2.y - n1.y;
                const length = Math.sqrt(dx * dx + dy * dy);
                if (length < 0.001) return;
                
                // Parameter t along the line
                let t = ((modelX - n1.x) * dx + (modelY - n1.y) * dy) / (length * length);
                t = Math.max(0, Math.min(1, t));
                
                // Closest point on line
                const closestX = n1.x + t * dx;
                const closestY = n1.y + t * dy;
                
                const dist = Math.sqrt((modelX - closestX) ** 2 + (modelY - closestY) ** 2);
                
                if (dist < minDist && t > 0.01 && t < 0.99) {
                    minDist = dist;
                    result = {
                        elemId: parseInt(elemId),
                        ratio: t,
                        distance: t * length,
                        totalLength: length,
                        pointX: closestX,
                        pointY: closestY
                    };
                }
            });
            
            return result;
        }
        
