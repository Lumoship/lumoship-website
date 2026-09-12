        // ============== SNAP FUNCTIONS ==============
        function toggleSnap() {
            view.snapEnabled = !view.snapEnabled;
            // Keep object-snap master flag in sync
            if (typeof cmdState !== 'undefined') cmdState.snapMode = view.snapEnabled;
            const btn = document.getElementById('btnSnap');
            if (btn) {
                if (view.snapEnabled) btn.classList.add('active');
                else btn.classList.remove('active');
            }
            if (!view.snapEnabled && typeof hideSnapMarker === 'function') hideSnapMarker();
            showToast(view.snapEnabled ? 'Object Snap ON' : 'Object Snap OFF');
        }
        
        // Toggle individual object-snap modes (from dropdown)
        function setSnapOption(type, checked) {
            if (typeof cmdState === 'undefined') return;
            if (type === 'intersection') cmdState.snapIntersection = checked;
            else if (type === 'perpendicular') cmdState.snapPerpendicular = checked;
            else if (type === 'nearest') cmdState.snapNearest = checked;
            else if (type === 'grid') cmdState.snapGrid = checked;
        }
        
        function findSnapNode(screenX, screenY) {
            if (!view.snapEnabled) return null;
            
            let closest = null;
            let closestDist = view.snapDistance;
            
            for (const [id, node] of Object.entries(model.nodes)) {
                const p = worldToScreen(node.x, node.y);
                const dist = Math.sqrt((screenX - p.x)**2 + (screenY - p.y)**2);
                if (dist < closestDist) {
                    closestDist = dist;
                    closest = { id: parseInt(id), node, screenPos: p };
                }
            }
            return closest;
        }
        
        // ============== LINE INTERSECTION UTILITIES ==============
        function lineIntersection(p1, p2, p3, p4) {
            // Returns intersection point of line (p1-p2) and line (p3-p4)
            // Returns null if lines don't intersect or are parallel
            const x1 = p1.x, y1 = p1.y, x2 = p2.x, y2 = p2.y;
            const x3 = p3.x, y3 = p3.y, x4 = p4.x, y4 = p4.y;
            
            const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
            if (Math.abs(denom) < 1e-10) return null; // Parallel lines
            
            const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
            const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;
            
            // Check if intersection is within both line segments
            if (t > 0.001 && t < 0.999 && u > 0.001 && u < 0.999) {
                return {
                    x: x1 + t * (x2 - x1),
                    y: y1 + t * (y2 - y1),
                    t: t, // Parameter on first line
                    u: u  // Parameter on second line
                };
            }
            return null;
        }
        
        function findIntersectionsWithExistingBeams(newN1, newN2, excludeElemIds = []) {
            // Find all intersections between a new beam (newN1 to newN2) and existing beams
            const intersections = [];
            
            Object.entries(model.elements).forEach(([elemId, elem]) => {
                if (excludeElemIds.includes(parseInt(elemId))) return;
                
                const n1 = model.nodes[elem.n1];
                const n2 = model.nodes[elem.n2];
                if (!n1 || !n2) return;
                
                const inter = lineIntersection(newN1, newN2, n1, n2);
                if (inter) {
                    intersections.push({
                        x: inter.x,
                        y: inter.y,
                        t: inter.t, // Position on new beam (0-1)
                        existingElemId: parseInt(elemId),
                        existingT: inter.u // Position on existing beam (0-1)
                    });
                }
            });
            
            // Sort by t (position along new beam)
            intersections.sort((a, b) => a.t - b.t);
            return intersections;
        }
        
        function createNodeAtIntersection(x, y) {
            // Check if a node already exists at this location
            const tolerance = 0.01; // 1cm tolerance
            for (const [nodeId, node] of Object.entries(model.nodes)) {
                if (Math.abs(node.x - x) < tolerance && Math.abs(node.y - y) < tolerance) {
                    return parseInt(nodeId); // Return existing node
                }
            }
            
            // Create new node
            const newId = nextNodeId++;
            model.nodes[newId] = { id: newId, x: x, y: y };
            return newId;
        }
        
        function splitBeamAtNode(elemId, nodeId) {
            // Split an existing beam at a node point
            const elem = model.elements[elemId];
            if (!elem) return;
            
            const node = model.nodes[nodeId];
            const n1 = model.nodes[elem.n1];
            const n2 = model.nodes[elem.n2];
            if (!node || !n1 || !n2) return;
            
            // Create two new beams
            const newElem1Id = nextElementId++;
            const newElem2Id = nextElementId++;
            
            model.elements[newElem1Id] = {
                id: newElem1Id,
                n1: elem.n1,
                n2: nodeId,
                section: elem.section,
                orientation: elem.orientation || 0,
                lineLoads: []
            };
            
            model.elements[newElem2Id] = {
                id: newElem2Id,
                n1: nodeId,
                n2: elem.n2,
                section: elem.section,
                orientation: elem.orientation || 0,
                lineLoads: []
            };
            
            // Delete original beam
            delete model.elements[elemId];
            
            return [newElem1Id, newElem2Id];
        }
        
        function createBeamWithIntersections(n1Id, n2Id, section, orientation = 0) {
            // Create a beam and automatically split at intersections with existing beams
            const n1 = model.nodes[n1Id];
            const n2 = model.nodes[n2Id];
            if (!n1 || !n2) return [];
            
            const intersections = findIntersectionsWithExistingBeams(n1, n2);
            
            // Create intersection nodes and split existing beams
            const splitNodes = [n1Id];
            
            intersections.forEach(inter => {
                // Create or find node at intersection
                const nodeId = createNodeAtIntersection(inter.x, inter.y);
                splitNodes.push(nodeId);
                
                // Split the existing beam at this intersection
                splitBeamAtNode(inter.existingElemId, nodeId);
            });
            
            splitNodes.push(n2Id);
            
            // Create new beam segments
            const newBeamIds = [];
            for (let i = 0; i < splitNodes.length - 1; i++) {
                const newElemId = nextElementId++;
                model.elements[newElemId] = {
                    id: newElemId,
                    n1: splitNodes[i],
                    n2: splitNodes[i + 1],
                    section: section,
                    orientation: orientation,
                    lineLoads: []
                };
                newBeamIds.push(newElemId);
            }
            
            return newBeamIds;
        }
        
