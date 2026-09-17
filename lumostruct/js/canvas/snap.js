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
        
        // Dugumun kotu. Iki boyutlu cizimden gelen dugumlerde z yok; yoklugu
        // sifir demek - modelin geri kalani da boyle sayiyor.
        function dugumKotu(n) { return (n && typeof n.z === 'number' && isFinite(n.z)) ? n.z : 0; }
        const KESISIM_TOL = 0.01;   // 1 cm - dugum aramadaki tolerans ile ayni

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
                    // PLANDA kesismek YETMEZ. lineIntersection yalnizca x-y'ye
                    // bakiyor; bu, iki kiris birbirinin ustunden geciyorsa da
                    // "kesisti" der. Uc boyutlu bir modelde bunun bedeli agir:
                    // baska bir kotaya kopyalanan her kiris, altindan gecen her
                    // seye dugumle yapisiyordu.
                    //
                    // Gercek kesisim, planda kesistikleri yerde IKI kirisin de
                    // ayni kotada olmasini ister. Yeni kirisin t noktasindaki
                    // z'si ile mevcut kirisin u noktasindaki z'sini karsilastir.
                    const zYeni = dugumKotu(newN1) + inter.t * (dugumKotu(newN2) - dugumKotu(newN1));
                    const zVar  = dugumKotu(n1) + inter.u * (dugumKotu(n2) - dugumKotu(n1));
                    if (Math.abs(zYeni - zVar) > KESISIM_TOL) return;
                    intersections.push({
                        x: inter.x,
                        y: inter.y,
                        z: zYeni,
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
        
        function createNodeAtIntersection(x, y, z) {
            // Check if a node already exists at this location
            const tolerance = 0.01; // 1cm tolerance
            const kz = (typeof z === 'number' && isFinite(z)) ? z : 0;
            for (const [nodeId, node] of Object.entries(model.nodes)) {
                if (Math.abs(node.x - x) < tolerance && Math.abs(node.y - y) < tolerance &&
                    Math.abs(dugumKotu(node) - kz) < tolerance) {
                    return parseInt(nodeId); // Return existing node
                }
            }
            
            // Create new node
            const newId = nextNodeId++;
            model.nodes[newId] = { id: newId, x: x, y: y, z: kz };
            return newId;
        }
        
        // Mevcut kirisi dugumde ikiye boler - ozellikler ve hat yukleri
        // parcalara dogru araliklarla gecer (js/core/kiris.js).
        function splitBeamAtNode(elemId, nodeId) {
            return kirisiDugumdeBol(elemId, nodeId);
        }

        // Kiris kurar, mevcut kirislerle kesisimlerinde boler. kaynak (istege
        // bagli): ozellikleri ve hat yukleri kopyalanacak kiris - kopya,
        // ayna, dondurme, dizi buradan gecer.
        function createBeamWithIntersections(n1Id, n2Id, section, orientation = 0, kaynak = null) {
            const n1 = model.nodes[n1Id];
            const n2 = model.nodes[n2Id];
            if (!n1 || !n2) return [];

            const intersections = findIntersectionsWithExistingBeams(n1, n2);

            // Once tam kiris (ozellikleriyle), sonra kesisimlerde parcala.
            const yeniId = nextElementId++;
            const yeni = kaynak ? kirisTuret(kaynak, n1Id, n2Id) : { n1: n1Id, n2: n2Id, section: section, orientation: orientation, lineLoads: [] };
            yeni.id = yeniId;
            yeni.section = section;
            yeni.orientation = orientation;
            model.elements[yeniId] = yeni;
            if (intersections.length === 0) return [yeniId];

            const dugumler = [], kesirler = [];
            intersections.forEach(inter => {
                const nodeId = createNodeAtIntersection(inter.x, inter.y, inter.z);
                splitBeamAtNode(inter.existingElemId, nodeId);
                dugumler.push(nodeId);
                kesirler.push(dugumunKirisKesri(yeni, nodeId));
            });
            // Kesisimler kiris boyunca sirali olmali
            const sira = kesirler.map((k, i) => i).sort((i, j) => kesirler[i] - kesirler[j]);
            return kirisiParcala(yeniId, sira.map(i => dugumler[i]), sira.map(i => kesirler[i]));
        }
        
