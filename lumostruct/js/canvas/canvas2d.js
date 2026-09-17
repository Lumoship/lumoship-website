        // ============== CANVAS ==============
        const canvas = document.getElementById('mainCanvas');
        const ctx = canvas.getContext('2d');
        
        function resizeCanvas() {
            const container = canvas.parentElement;
            if (!container) return;
            
            const rect = container.getBoundingClientRect();
            const w = Math.floor(rect.width);
            const h = Math.floor(rect.height);
            
            if (w > 0 && h > 0 && (canvas.width !== w || canvas.height !== h)) {
                canvas.width = w;
                canvas.height = h;
            }
            
            if (canvas.width > 0 && canvas.height > 0) {
                draw();
            }
        }
        
        // Multiple resize attempts for reliability
        window.addEventListener('resize', resizeCanvas);
        window.addEventListener('resize', () => {
            // Also resize Three.js renderer
            if (threeRenderer && threeCamera) {
                const container = document.getElementById('threeContainer');
                if (container && container.parentElement) {
                    const rect = container.parentElement.getBoundingClientRect();
                    kamerayiYenidenOlcekle(rect.width, rect.height);
                }
            }
        });
        
        window.addEventListener('load', () => {
            // Initialize DOM element cache
            initDOMCache();
            
            resizeCanvas();
            setTimeout(resizeCanvas, 100);
            setTimeout(resizeCanvas, 500);
            
            // Start with Three.js 3D view (Plan mode)
            setTimeout(() => {
                initThreeJS();
                document.getElementById('threeContainer').style.display = 'block';
                document.getElementById('mainCanvas').style.display = 'none';
                update3DScene();
                setViewMode('plan', false);
                animate3D();
                
                // Otomatik kayit: soru sorulmaz, geri yuklenir.
                otomatikKaydiGeriYukle();
            }, 200);
        });
        
        // Her acilista "Restore previous session?" penceresi cikiyordu - hem
        // bos bir otomatik kayit icin bile, hem de calisma geri gelsin diye her
        // seferinde tiklamak gerekiyordu. Bir cizim programi belgesini geri
        // acar, izin istemez: dolu bir kayit varsa sessizce yuklenir ve durum
        // cubugunda soylenir. Sifirdan baslamak icin Model > Clear Model var.
        function otomatikKaydiGeriYukle() {
            const kayit = loadAutoSave();
            if (!kayit || !kayit.model) return;

            const dugum = Object.keys(kayit.model.nodes || {}).length;
            const eleman = Object.keys(kayit.model.elements || {}).length;
            if (!dugum && !eleman) return;   // bos kayit: geri yuklenecek bir sey yok

            if (!restoreAutoSave()) return;

            // restoreAutoSave durum cubuguna yaziyor ama arkasindan calisan
            // fitView/updateCommandUI mesajin ustune yaziyordu: model sessizce
            // geri geliyor, kullanici neden dolu oldugunu anlamiyordu.
            const ne = formatTimeAgo(kayit.timestamp);
            setTimeout(() => {
                showToast('Restored your last model from ' + ne +
                          ' - ' + dugum + ' nodes, ' + eleman + ' beams', 'info', 5000, true);
            }, 400);
        }
        
        // Also resize when tab becomes visible
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) resizeCanvas();
        });
        
        // Initial resize
        requestAnimationFrame(() => {
            resizeCanvas();
            setTimeout(resizeCanvas, 50);
            setTimeout(resizeCanvas, 200);
            setTimeout(resizeCanvas, 500);
        });
        
        // Pan & Zoom
        let isPanning = false, startX, startY;
        let selectedElement = null;
        let selectedNode = null;
        let selectedElements = new Set();  // Multiple selection
        let selectedNodes = new Set();     // Multiple node selection
        
        // Measurement tool
        let measureMode = false;
        let measurePoint1 = null;  // {x, y, screenX, screenY, nodeId}
        let measurePoint2 = null;
        let measureHoverPoint = null;  // Current mouse position while measuring
        
        // Box selection
        let isBoxSelecting = false;
        let boxStartX, boxStartY, boxEndX, boxEndY;
        let isRightDragging = false;
        let rightDragStartX = 0, rightDragStartY = 0;
        
        canvas.addEventListener('mousedown', e => {
            const mouseX = e.offsetX;
            const mouseY = e.offsetY;
            
            // Measurement mode click handling
            if (measureMode && e.button === 0) {
                handleMeasureClick(mouseX, mouseY);
                return;
            }
            
            // Right-click drag to rotate to 3D view
            if (e.button === 2) {
                isRightDragging = true;
                rightDragStartX = e.clientX;
                rightDragStartY = e.clientY;
                e.preventDefault();
                return;
            }
            
            // Shift+Click for box selection start
            if (e.shiftKey) {
                isBoxSelecting = true;
                boxStartX = mouseX;
                boxStartY = mouseY;
                boxEndX = mouseX;
                boxEndY = mouseY;
                return;
            }
            
            // Check if clicked on a node first
            const clickedNode = getNodeAtPosition(mouseX, mouseY);
            if (clickedNode) {
                // Ctrl+Click to add to selection
                if (e.ctrlKey) {
                    if (selectedNodes.has(clickedNode.id)) {
                        selectedNodes.delete(clickedNode.id);
                    } else {
                        selectedNodes.add(clickedNode.id);
                    }
                } else {
                    selectedNodes.clear();
                    selectedElements.clear();
                    selectedNodes.add(clickedNode.id);
                }
                selectedElement = null;
                selectedNode = clickedNode;
                showNodeDetails(clickedNode);
                updateEntityInfoPanel();
                draw();
                return;
            }
            
            // Check if clicked on an element
            const clickedElem = getElementAtPosition(mouseX, mouseY);
            if (clickedElem) {
                // Ctrl+Click to add to selection
                if (e.ctrlKey) {
                    if (selectedElements.has(clickedElem.id)) {
                        selectedElements.delete(clickedElem.id);
                    } else {
                        selectedElements.add(clickedElem.id);
                    }
                } else {
                    selectedElements.clear();
                    selectedNodes.clear();
                    selectedElements.add(clickedElem.id);
                }
                selectedElement = clickedElem;
                selectedNode = null;
                showElementDetails(clickedElem);
                updateEntityInfoPanel();
                draw();
                return;
            }
            
            // Clear selection if clicked on empty area
            if (!e.ctrlKey) {
                clearSelection();
            }
            
            isPanning = true;
            startX = e.clientX - view.offsetX;
            startY = e.clientY - view.offsetY;
        });
        
        // Perspective rotation state
        let perspectiveAngleX = 0;  // Pitch (up/down tilt)
        let perspectiveAngleY = 0;  // Yaw (left/right rotation)
        
        canvas.addEventListener('mousemove', e => {
            const mouseX = e.offsetX;
            const mouseY = e.offsetY;
            
            // Measurement mode hover
            if (measureMode) {
                updateMeasureHover(mouseX, mouseY);
                return;
            }
            
            // Right-drag for 3D rotation preview with perspective
            if (isRightDragging) {
                const dx = e.clientX - rightDragStartX;
                const dy = e.clientY - rightDragStartY;
                
                // Update perspective angles based on drag
                perspectiveAngleY = dx * 0.3;  // degrees
                perspectiveAngleX = dy * 0.3;
                
                // Clamp angles
                perspectiveAngleX = Math.max(-60, Math.min(60, perspectiveAngleX));
                perspectiveAngleY = Math.max(-60, Math.min(60, perspectiveAngleY));
                
                // Draw with perspective
                drawWithPerspective(perspectiveAngleX, perspectiveAngleY);
                return;
            }
            
            if (isBoxSelecting) {
                boxEndX = e.offsetX;
                boxEndY = e.offsetY;
                draw();
                drawSelectionBox();
                return;
            }
            
            if (isPanning) {
                view.offsetX = e.clientX - startX;
                view.offsetY = e.clientY - startY;
                draw();
            }
        });
        
        canvas.addEventListener('mouseup', e => {
            // Right-drag release - switch to 3D if dragged enough
            if (isRightDragging) {
                const dx = e.clientX - rightDragStartX;
                const dy = e.clientY - rightDragStartY;
                const dragDistance = Math.sqrt(dx * dx + dy * dy);
                
                isRightDragging = false;
                
                if (dragDistance > 50) {
                    // Smooth transition to 3D view
                    smoothTransitionTo3D(perspectiveAngleX, perspectiveAngleY);
                } else {
                    // Reset perspective and redraw normal
                    perspectiveAngleX = 0;
                    perspectiveAngleY = 0;
                    draw();
                }
                return;
            }
            
            if (isBoxSelecting) {
                isBoxSelecting = false;
                selectItemsInBox();
                draw();
                return;
            }
            isPanning = false;
        });
        
        // Draw model with perspective transformation
        function drawWithPerspective(angleX, angleY) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#0a0e17';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            
            // Convert to radians
            const radX = angleX * Math.PI / 180;
            const radY = angleY * Math.PI / 180;
            
            const cosX = Math.cos(radX);
            const sinX = Math.sin(radX);
            const cosY = Math.cos(radY);
            const sinY = Math.sin(radY);
            
            // Draw grid with perspective
            if (view.showGrid) {
                ctx.strokeStyle = 'rgba(30, 41, 59, 0.5)';
                ctx.lineWidth = 1;
                
                const gridSize = 20;
                const step = 1;
                for (let x = -gridSize; x <= gridSize; x += step) {
                    const p1 = project3D(x, -gridSize, 0, cosX, sinX, cosY, sinY);
                    const p2 = project3D(x, gridSize, 0, cosX, sinX, cosY, sinY);
                    ctx.beginPath();
                    ctx.moveTo(p1.x, p1.y);
                    ctx.lineTo(p2.x, p2.y);
                    ctx.stroke();
                }
                for (let y = -gridSize; y <= gridSize; y += step) {
                    const p1 = project3D(-gridSize, y, 0, cosX, sinX, cosY, sinY);
                    const p2 = project3D(gridSize, y, 0, cosX, sinX, cosY, sinY);
                    ctx.beginPath();
                    ctx.moveTo(p1.x, p1.y);
                    ctx.lineTo(p2.x, p2.y);
                    ctx.stroke();
                }
            }
            
            // Draw axes with perspective
            const origin = project3D(0, 0, 0, cosX, sinX, cosY, sinY);
            const axisLen = 3;
            
            // X axis (red)
            const xEnd = project3D(axisLen, 0, 0, cosX, sinX, cosY, sinY);
            ctx.strokeStyle = '#ef4444';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(origin.x, origin.y);
            ctx.lineTo(xEnd.x, xEnd.y);
            ctx.stroke();
            
            // Y axis (green)
            const yEnd = project3D(0, axisLen, 0, cosX, sinX, cosY, sinY);
            ctx.strokeStyle = '#22c55e';
            ctx.beginPath();
            ctx.moveTo(origin.x, origin.y);
            ctx.lineTo(yEnd.x, yEnd.y);
            ctx.stroke();
            
            // Z axis (blue)
            const zEnd = project3D(0, 0, axisLen, cosX, sinX, cosY, sinY);
            ctx.strokeStyle = '#3b82f6';
            ctx.beginPath();
            ctx.moveTo(origin.x, origin.y);
            ctx.lineTo(zEnd.x, zEnd.y);
            ctx.stroke();
            
            // Draw beams with perspective and depth
            Object.values(model.elements).forEach(elem => {
                const n1 = model.nodes[elem.n1];
                const n2 = model.nodes[elem.n2];
                if (!n1 || !n2) return;
                
                const p1 = project3D(n1.x, n1.y, n1.z || 0, cosX, sinX, cosY, sinY);
                const p2 = project3D(n2.x, n2.y, n2.z || 0, cosX, sinX, cosY, sinY);
                
                // Draw beam with gradient based on depth
                const avgDepth = (p1.depth + p2.depth) / 2;
                const brightness = Math.max(0.3, Math.min(1, 1 - avgDepth * 0.02));
                
                ctx.strokeStyle = `rgba(56, 189, 248, ${brightness})`;
                ctx.lineWidth = Math.max(2, 4 * brightness);
                ctx.beginPath();
                ctx.moveTo(p1.x, p1.y);
                ctx.lineTo(p2.x, p2.y);
                ctx.stroke();
            });
            
            // Draw nodes with perspective
            Object.values(model.nodes).forEach(node => {
                const p = project3D(node.x, node.y, node.z || 0, cosX, sinX, cosY, sinY);
                const brightness = Math.max(0.4, Math.min(1, 1 - p.depth * 0.02));
                const radius = Math.max(3, 5 * brightness);
                
                ctx.fillStyle = `rgba(251, 191, 36, ${brightness})`;
                ctx.beginPath();
                ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
                ctx.fill();
            });
            
            // Draw constraints
            Object.entries(model.constraints).forEach(([nodeId, bc]) => {
                const node = model.nodes[nodeId];
                if (!node) return;
                
                const p = project3D(node.x, node.y, node.z || 0, cosX, sinX, cosY, sinY);
                const size = 12;
                
                ctx.fillStyle = 'rgba(168, 85, 247, 0.8)';
                ctx.beginPath();
                ctx.moveTo(p.x, p.y);
                ctx.lineTo(p.x - size, p.y + size);
                ctx.lineTo(p.x + size, p.y + size);
                ctx.closePath();
                ctx.fill();
            });
            
            // Draw loads
            model.loads.forEach(load => {
                const node = model.nodes[load.nodeId];
                if (!node) return;
                
                const p = project3D(node.x, node.y, node.z || 0, cosX, sinX, cosY, sinY);
                const arrowLen = 40;
                
                ctx.strokeStyle = '#ef4444';
                ctx.fillStyle = '#ef4444';
                ctx.lineWidth = 2;
                
                // Arrow pointing down for Fz
                if (load.Fz && load.Fz !== 0) {
                    const dir = load.Fz > 0 ? -1 : 1;
                    ctx.beginPath();
                    ctx.moveTo(p.x, p.y);
                    ctx.lineTo(p.x, p.y + dir * arrowLen);
                    ctx.stroke();
                    
                    // Arrow head
                    ctx.beginPath();
                    ctx.moveTo(p.x, p.y + dir * arrowLen);
                    ctx.lineTo(p.x - 5, p.y + dir * (arrowLen - 10));
                    ctx.lineTo(p.x + 5, p.y + dir * (arrowLen - 10));
                    ctx.closePath();
                    ctx.fill();
                }
            });
            
            // Info overlay
            const totalAngle = Math.sqrt(angleX * angleX + angleY * angleY);
            ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
            ctx.fillRect(canvas.width / 2 - 140, 10, 280, 50);
            ctx.strokeStyle = '#3b82f6';
            ctx.lineWidth = 1;
            ctx.strokeRect(canvas.width / 2 - 140, 10, 280, 50);
            
            ctx.fillStyle = '#e2e8f0';
            ctx.font = 'bold 14px Inter, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('<span class="icon"><svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8" cy="8" r="1" fill="currentColor"/><circle cx="16" cy="8" r="1" fill="currentColor"/><circle cx="8" cy="16" r="1" fill="currentColor"/><circle cx="16" cy="16" r="1" fill="currentColor"/><circle cx="12" cy="12" r="1" fill="currentColor"/></svg></span> Rotating to 3D View...', canvas.width / 2, 32);
            
            ctx.fillStyle = '#94a3b8';
            ctx.font = '12px Inter, sans-serif';
            ctx.fillText(`Angle: ${totalAngle.toFixed(0)}° | Release to switch`, canvas.width / 2, 50);
        }
        
        // Project 3D point to 2D screen
        function project3D(x, y, z, cosX, sinX, cosY, sinY) {
            // Rotate around Y axis (yaw)
            let x1 = x * cosY - z * sinY;
            let z1 = x * sinY + z * cosY;
            
            // Rotate around X axis (pitch)
            let y1 = y * cosX - z1 * sinX;
            let z2 = y * sinX + z1 * cosX;
            
            // Simple perspective projection
            const fov = 500;
            const distance = fov + z2;
            const scale = fov / Math.max(distance, 100);
            
            // Apply view transform
            const screenX = canvas.width / 2 + x1 * view.scale * scale + view.offsetX;
            const screenY = canvas.height / 2 - y1 * view.scale * scale + view.offsetY;
            
            return { x: screenX, y: screenY, depth: z2 };
        }
        
        // Smooth transition to 3D view
        function smoothTransitionTo3D(finalAngleX, finalAngleY) {
            // Animate the last few frames then switch
            let frame = 0;
            const totalFrames = 15;
            
            function animateTransition() {
                frame++;
                const progress = frame / totalFrames;
                const eased = 1 - Math.pow(1 - progress, 3);  // Ease out cubic
                
                // Increase angles towards isometric
                const targetAngleX = 35;
                const targetAngleY = 45;
                
                const currentAngleX = finalAngleX + (targetAngleX - finalAngleX) * eased;
                const currentAngleY = finalAngleY + (targetAngleY - finalAngleY) * eased;
                
                drawWithPerspective(currentAngleX, currentAngleY);
                
                if (frame < totalFrames) {
                    requestAnimationFrame(animateTransition);
                } else {
                    // Switch to actual 3D view
                    perspectiveAngleX = 0;
                    perspectiveAngleY = 0;
                    setViewMode('3d');
                }
            }
            
            animateTransition();
        }
        
        canvas.addEventListener('mouseleave', () => {
            isPanning = false;
            isRightDragging = false;
            if (isBoxSelecting) {
                isBoxSelecting = false;
                draw();
            }
        });
        
        canvas.addEventListener('wheel', e => {
            e.preventDefault();
            
            // Get mouse position relative to canvas
            const mouseX = e.offsetX;
            const mouseY = e.offsetY;
            
            // Calculate world coordinates before zoom
            const worldX = (mouseX - canvas.width/2 - view.offsetX) / view.scale;
            const worldY = -(mouseY - canvas.height/2 - view.offsetY) / view.scale;
            
            // Zoom - VERY gradual (2% per scroll tick)
            const zoomFactor = e.deltaY > 0 ? 0.98 : 1.02;
            view.scale *= zoomFactor;
            view.scale = Math.max(0.1, Math.min(2000, view.scale));  // Very wide range
            
            // Adjust offset to zoom toward mouse position
            const newScreenX = canvas.width/2 + worldX * view.scale + view.offsetX;
            const newScreenY = canvas.height/2 - worldY * view.scale + view.offsetY;
            
            view.offsetX += mouseX - newScreenX;
            view.offsetY += mouseY - newScreenY;
            
            updateZoomLevel();
            draw();
        }, { passive: false });
        
        // Right-click context menu (only if not dragging)
        canvas.addEventListener('contextmenu', e => {
            e.preventDefault();  // Always prevent default context menu
            if (currentViewMode === '3d') return;
            if (isRightDragging) return;
            
            // Only show context menu if it was a simple right-click (not drag)
            const dx = e.clientX - rightDragStartX;
            const dy = e.clientY - rightDragStartY;
            if (Math.sqrt(dx * dx + dy * dy) < 10) {
                showContextMenu(e);
            }
        });
        
        // Hide context menu on click anywhere
        document.addEventListener('click', e => {
            if (!e.target.closest('.context-menu')) {
                hideContextMenu();
            }
        });
        
        function worldToScreen(x, y) {
            return {
                x: canvas.width/2 + x * view.scale + view.offsetX,
                y: canvas.height/2 - y * view.scale + view.offsetY
            };
        }
        
        function draw() {
            // Always use Three.js
            if (!threeInitialized) {
                // Initialize Three.js if not done yet
                initThreeJS();
                document.getElementById('threeContainer').style.display = 'block';
                document.getElementById('mainCanvas').style.display = 'none';
                
                // Start render loop
                animate3D();
                
                // Set initial camera position
                setTimeout(() => {
                    setViewMode(currentViewMode || 'plan', false);
                }, 50);
            }
            
            update3DScene();
        }
        
        function drawGrid() {
            ctx.strokeStyle = '#1e293b';
            ctx.lineWidth = 1;
            
            const step = view.scale;
            const ox = (canvas.width/2 + view.offsetX) % step;
            const oy = (canvas.height/2 + view.offsetY) % step;
            
            for (let x = ox; x < canvas.width; x += step) {
                ctx.beginPath();
                ctx.moveTo(x, 0);
                ctx.lineTo(x, canvas.height);
                ctx.stroke();
            }
            
            for (let y = oy; y < canvas.height; y += step) {
                ctx.beginPath();
                ctx.moveTo(0, y);
                ctx.lineTo(canvas.width, y);
                ctx.stroke();
            }
        }
        
        function drawAxes() {
            // Small origin marker - very minimal
            const origin = worldToScreen(0, 0);
            
            // Small cross at origin
            ctx.strokeStyle = 'rgba(148, 163, 184, 0.4)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(origin.x - 8, origin.y);
            ctx.lineTo(origin.x + 8, origin.y);
            ctx.moveTo(origin.x, origin.y - 8);
            ctx.lineTo(origin.x, origin.y + 8);
            ctx.stroke();
            
            // Small "O" label
            ctx.fillStyle = 'rgba(148, 163, 184, 0.5)';
            ctx.font = '9px Inter, sans-serif';
            ctx.fillText('O', origin.x + 10, origin.y - 5);
        }
        
        // Fixed axis indicator in bottom-left corner - Premium minimal design
        function drawAxisIndicator() {
            const size = 32;
            const margin = 15;
            const cx = margin + size/2;
            const cy = canvas.height - margin - size/2;
            
            // Subtle background
            ctx.beginPath();
            ctx.arc(cx, cy, size/2 + 3, 0, Math.PI * 2);
            const isDarkMode = !document.body.classList.contains('light-mode');
            ctx.fillStyle = isDarkMode ? 'rgba(15, 23, 42, 0.7)' : 'rgba(255, 255, 255, 0.85)';
            ctx.fill();
            ctx.strokeStyle = isDarkMode ? 'rgba(71, 85, 105, 0.4)' : 'rgba(148, 163, 184, 0.5)';
            ctx.lineWidth = 1;
            ctx.stroke();
            
            const axisLen = size * 0.35;
            
            // X axis (red)
            ctx.strokeStyle = '#ef4444';
            ctx.fillStyle = '#ef4444';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo(cx + axisLen, cy);
            ctx.stroke();
            ctx.font = 'bold 8px Inter, sans-serif';
            ctx.fillText('X', cx + axisLen + 2, cy + 3);
            
            // Y axis (green)
            ctx.strokeStyle = '#22c55e';
            ctx.fillStyle = '#22c55e';
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo(cx, cy - axisLen);
            ctx.stroke();
            ctx.fillText('Y', cx - 3, cy - axisLen - 3);
            
            // Z axis (blue) - diagonal
            ctx.strokeStyle = '#3b82f6';
            ctx.fillStyle = '#3b82f6';
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo(cx - axisLen * 0.5, cy + axisLen * 0.5);
            ctx.stroke();
            ctx.fillText('Z', cx - axisLen * 0.5 - 8, cy + axisLen * 0.5 + 8);
            
            // Center dot
            ctx.beginPath();
            ctx.arc(cx, cy, 2, 0, Math.PI * 2);
            ctx.fillStyle = isDarkMode ? '#94a3b8' : '#64748b';
            ctx.fill();
        }
        
        function drawNodes() {
            Object.entries(model.nodes).forEach(([id, node]) => {
                const nodeId = parseInt(id);
                const p = worldToScreen(node.x, node.y);
                
                // Check if selected
                const isSelected = selectedNodes.has(nodeId) || (selectedNode && selectedNode.id === nodeId);
                
                // Check if has constraint
                const hasConstraint = model.constraints[nodeId];
                
                // Node appearance based on state
                let size = 5;
                let primaryColor = '#60a5fa';  // Light blue
                let secondaryColor = '#3b82f6'; // Darker blue
                
                if (isSelected) {
                    size = 7;
                    primaryColor = '#fbbf24';  // Amber
                    secondaryColor = '#f59e0b';
                } else if (results && results.displacements[nodeId]) {
                    const uz = Math.abs(results.displacements[nodeId].Uz) * 1000;
                    const maxUz = Math.abs(results.maxDeflection) * 1000;
                    const ratio = maxUz > 0 ? uz / maxUz : 0;
                    primaryColor = getColorForRatio(ratio);
                    secondaryColor = primaryColor;
                }
                
                // Glow effect for selected nodes
                if (isSelected) {
                    ctx.shadowColor = '#fbbf24';
                    ctx.shadowBlur = 12;
                }
                
                // Draw diamond shape
                ctx.beginPath();
                ctx.moveTo(p.x, p.y - size);      // Top
                ctx.lineTo(p.x + size, p.y);      // Right
                ctx.lineTo(p.x, p.y + size);      // Bottom
                ctx.lineTo(p.x - size, p.y);      // Left
                ctx.closePath();
                
                // Gradient fill
                const gradient = ctx.createLinearGradient(p.x - size, p.y - size, p.x + size, p.y + size);
                gradient.addColorStop(0, primaryColor);
                gradient.addColorStop(1, secondaryColor);
                ctx.fillStyle = gradient;
                ctx.fill();
                
                // Border
                ctx.strokeStyle = isSelected ? '#92400e' : '#1e3a5f';
                ctx.lineWidth = isSelected ? 2 : 1.5;
                ctx.stroke();
                
                // Reset shadow
                ctx.shadowColor = 'transparent';
                ctx.shadowBlur = 0;
                
                // Node ID label
                if (view.showNodeIds || (isSelected && view.scale > 25)) {
                    ctx.fillStyle = isSelected ? '#fbbf24' : '#cbd5e1';
                    ctx.font = isSelected ? 'bold 10px Inter, sans-serif' : '9px Inter, sans-serif';
                    ctx.textAlign = 'center';
                    ctx.fillText(nodeId, p.x, p.y - size - 4);
                }
                
                // Node coordinates label
                if (view.showNodeCoords) {
                    ctx.fillStyle = '#94a3b8';
                    ctx.font = '8px Inter, sans-serif';
                    ctx.textAlign = 'center';
                    const coordText = `(${node.x.toFixed(2)}, ${node.y.toFixed(2)})`;
                    ctx.fillText(coordText, p.x, p.y + size + 12);
                }
            });
        }
        
        function drawElements() {
            // Section type to color mapping
            const sectionColors = {
                'HP': { primary: '#3b82f6', secondary: '#1d4ed8' },  // Blue
                'FB': { primary: '#10b981', secondary: '#047857' },  // Green
                'T':  { primary: '#8b5cf6', secondary: '#6d28d9' },  // Purple
                'L':  { primary: '#f59e0b', secondary: '#d97706' },  // Amber
                'default': { primary: '#64748b', secondary: '#475569' }  // Gray
            };
            
            Object.entries(model.elements).forEach(([id, elem]) => {
                const elemId = parseInt(id);
                const n1 = model.nodes[elem.n1];
                const n2 = model.nodes[elem.n2];
                if (!n1 || !n2) return;
                
                const p1 = worldToScreen(n1.x, n1.y);
                const p2 = worldToScreen(n2.x, n2.y);
                
                // Check if selected
                const isSelected = selectedElements.has(elemId) || (selectedElement && selectedElement.id === elemId);
                
                // Get section type for color
                const sectionType = elem.section ? elem.section.match(/^(HP|FB|T|L)/)?.[1] || 'default' : 'default';
                const colors = sectionColors[sectionType] || sectionColors['default'];
                
                // Check for stress visualization - show when in Results tab OR when stress toggle is on
                let stressColor = null;
                const shouldShowStress = (showResultsVisualization || view.showStress) && results && results.elementResults;
                if (shouldShowStress && results.elementResults[elemId]) {
                    const elemResult = results.elementResults[elemId];
                    const stress = elemResult.vonMises || 0;
                    const sigmaLimit = parseFloat(document.getElementById('sigmaLimit')?.value) || 355;
                    stressColor = getStressColor(stress, sigmaLimit);
                }
                
                // Create gradient along beam
                const gradient = ctx.createLinearGradient(p1.x, p1.y, p2.x, p2.y);
                
                if (isSelected) {
                    gradient.addColorStop(0, '#fbbf24');
                    gradient.addColorStop(0.5, '#f59e0b');
                    gradient.addColorStop(1, '#fbbf24');
                    ctx.lineWidth = 5;
                    
                    // Glow effect
                    ctx.shadowColor = '#f59e0b';
                    ctx.shadowBlur = 8;
                } else if (stressColor) {
                    // Use stress color
                    gradient.addColorStop(0, stressColor);
                    gradient.addColorStop(0.5, stressColor);
                    gradient.addColorStop(1, stressColor);
                    ctx.lineWidth = 4;
                } else {
                    gradient.addColorStop(0, colors.secondary);
                    gradient.addColorStop(0.5, colors.primary);
                    gradient.addColorStop(1, colors.secondary);
                    ctx.lineWidth = 3;
                }
                
                // Draw beam with rounded caps
                ctx.beginPath();
                ctx.moveTo(p1.x, p1.y);
                ctx.lineTo(p2.x, p2.y);
                ctx.strokeStyle = gradient;
                ctx.lineCap = 'round';
                ctx.stroke();
                
                // Reset shadow
                ctx.shadowColor = 'transparent';
                ctx.shadowBlur = 0;
                ctx.lineCap = 'butt';
                
                // Draw section label on element
                if (view.showLabels || (isSelected && view.scale > 30)) {
                    const midX = (p1.x + p2.x) / 2;
                    const midY = (p1.y + p2.y) / 2;
                    
                    const sec = SECTIONS[elem.section];
                    let label = elem.section;
                    if (sec && sec.profileName) {
                        label = sec.profileName;
                    }
                    
                    // Background pill for label
                    ctx.font = '9px Inter, sans-serif';
                    const textWidth = ctx.measureText(label).width;
                    const pillPadding = 4;
                    const pillHeight = 14;
                    
                    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
                    ctx.beginPath();
                    ctx.roundRect(midX - textWidth/2 - pillPadding, midY - pillHeight/2, textWidth + pillPadding * 2, pillHeight, 3);
                    ctx.fill();
                    
                    // Label text
                    ctx.fillStyle = isSelected ? '#fbbf24' : colors.primary;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(label, midX, midY);
                    ctx.textBaseline = 'alphabetic';
                }
                
                // Draw element ID
                if (view.showElemIds || (isSelected && view.scale > 40)) {
                    const midX = (p1.x + p2.x) / 2;
                    const midY = (p1.y + p2.y) / 2 - 12;
                    ctx.fillStyle = isSelected ? '#fbbf24' : '#475569';
                    ctx.font = '8px Inter, sans-serif';
                    ctx.textAlign = 'center';
                    ctx.fillText((model.elements[elemId] && model.elements[elemId].ad) ? model.elements[elemId].ad : `E${elemId}`, midX, midY);
                }
            });
        }
        
        function drawDeformed() {
            if (!results) return;
            
            const scale = view.deformationScale;
            
            Object.values(model.elements).forEach(elem => {
                const n1 = model.nodes[elem.n1];
                const n2 = model.nodes[elem.n2];
                if (!n1 || !n2) return;
                
                const d1 = results.displacements[elem.n1];
                const d2 = results.displacements[elem.n2];
                if (!d1 || !d2) return;
                
                // In 2D plan view, show Uz as vertical offset (Y direction on screen)
                const p1 = worldToScreen(n1.x, n1.y);
                const p2 = worldToScreen(n2.x, n2.y);
                
                // Offset by Uz displacement (scaled) - shown as perpendicular offset
                const offset1 = d1.Uz * scale * view.scale;  // Convert to screen pixels
                const offset2 = d2.Uz * scale * view.scale;
                
                ctx.beginPath();
                ctx.moveTo(p1.x, p1.y - offset1);
                ctx.lineTo(p2.x, p2.y - offset2);
                ctx.strokeStyle = '#22c55e';
                ctx.lineWidth = 3;
                ctx.setLineDash([]);
                ctx.stroke();
            });
            
            // Draw deformed nodes
            Object.values(model.nodes).forEach(node => {
                const d = results.displacements[node.id];
                if (!d) return;
                
                const p = worldToScreen(node.x, node.y);
                const offset = d.Uz * scale * view.scale;
                
                ctx.beginPath();
                ctx.arc(p.x, p.y - offset, 4, 0, Math.PI * 2);
                ctx.fillStyle = '#22c55e';
                ctx.fill();
            });
        }
        
        function drawMomentDiagram() {
            if (!results || !results.elementResults) return;
            
            // Olcek gercek tepe degerinden gelmeli - uc ve orta noktalara bakmak,
            // aciklik icindeki tepeyi kacirip diyagrami cerceveden tasiriyordu.
            let maxM = 0;
            Object.values(results.elementResults).forEach(res => {
                if (res.diagram && res.diagram.M) {
                    res.diagram.M.forEach(v => { maxM = Math.max(maxM, Math.abs(v)); });
                }
                maxM = Math.max(maxM, Math.abs(res.Mmax || 0),
                                Math.abs(res.M1 || 0), Math.abs(res.M2 || 0));
            });
            
            if (maxM === 0) return;
            
            const diagramHeight = 50 * view.diagramScale; // Max diagram height in pixels
            
            Object.entries(model.elements).forEach(([elemId, elem]) => {
                const n1 = model.nodes[elem.n1];
                const n2 = model.nodes[elem.n2];
                if (!n1 || !n2) return;
                
                const res = results.elementResults[elemId];
                if (!res) return;
                
                const p1 = worldToScreen(n1.x, n1.y);
                const p2 = worldToScreen(n2.x, n2.y);
                
                // Calculate perpendicular direction
                const dx = p2.x - p1.x;
                const dy = p2.y - p1.y;
                const len = Math.sqrt(dx*dx + dy*dy);
                const perpX = -dy / len;
                const perpY = dx / len;
                
                // Cozucunun ornekledigi egriyi ciz. Eskiden uc noktadan quadratic Bezier
                // uyduruluyordu: isaret degistiren moment ve kismi yukun kirigi kayboluyordu.
                const samples = (res.diagram && res.diagram.M && res.diagram.M.length > 1)
                    ? res.diagram.M
                    : [res.M1 || 0, res.Mmid || 0, res.M2 || 0];

                ctx.beginPath();
                ctx.moveTo(p1.x, p1.y);
                for (let si = 0; si < samples.length; si++) {
                    const t = si / (samples.length - 1);
                    const off = (samples[si] || 0) / maxM * diagramHeight;
                    ctx.lineTo(p1.x + dx * t + perpX * off, p1.y + dy * t + perpY * off);
                }
                ctx.lineTo(p2.x, p2.y);
                ctx.closePath();
                
                // Fill with semi-transparent purple
                ctx.fillStyle = 'rgba(168, 85, 247, 0.3)';
                ctx.fill();
                
                // Outline
                ctx.strokeStyle = '#a855f7';
                ctx.lineWidth = 2;
                ctx.setLineDash([]);
                ctx.stroke();
                
                // Draw moment values
                if (view.scale > 20) {
                    ctx.font = '10px Inter, sans-serif';
                    ctx.fillStyle = '#a855f7';
                    ctx.textAlign = 'center';
                    
                    // M1 value
                    if (Math.abs(res.M1) > 0.01) {
                        ctx.fillText(
                            Math.abs(res.M1).toFixed(1),
                            p1.x + perpX * m1 * 1.3,
                            p1.y + perpY * m1 * 1.3
                        );
                    }
                    
                    // M2 value
                    if (Math.abs(res.M2) > 0.01) {
                        ctx.fillText(
                            Math.abs(res.M2).toFixed(1),
                            p2.x + perpX * m2 * 1.3,
                            p2.y + perpY * m2 * 1.3
                        );
                    }
                    
                    // Max value at mid
                    if (Math.abs(res.Mmid) > Math.max(Math.abs(res.M1), Math.abs(res.M2)) * 1.1) {
                        ctx.fillText(
                            Math.abs(res.Mmid).toFixed(1),
                            midX + perpX * mMid * 1.3,
                            midY + perpY * mMid * 1.3
                        );
                    }
                }
            });
            
            // Draw legend
            ctx.fillStyle = '#a855f7';
            ctx.font = '12px Inter, sans-serif';
            ctx.textAlign = 'left';
            ctx.fillText('M (kNm)', 10, 20);
            ctx.fillText('Max: ' + Math.abs(results.maxMoment || 0).toFixed(2) + ' kNm', 10, 35);
        }
        
        function drawShearDiagram() {
            if (!results || !results.elementResults) return;
            
            // Find max shear for scaling
            let maxV = 0;
            Object.values(results.elementResults).forEach(res => {
                maxV = Math.max(maxV, Math.abs(res.V1 || 0), Math.abs(res.V2 || 0));
            });
            
            if (maxV === 0) return;
            
            const diagramHeight = 40 * view.diagramScale; // Max diagram height in pixels
            
            Object.entries(model.elements).forEach(([elemId, elem]) => {
                const n1 = model.nodes[elem.n1];
                const n2 = model.nodes[elem.n2];
                if (!n1 || !n2) return;
                
                const res = results.elementResults[elemId];
                if (!res) return;
                
                const p1 = worldToScreen(n1.x, n1.y);
                const p2 = worldToScreen(n2.x, n2.y);
                
                // Calculate perpendicular direction
                const dx = p2.x - p1.x;
                const dy = p2.y - p1.y;
                const len = Math.sqrt(dx*dx + dy*dy);
                const perpX = -dy / len;
                const perpY = dx / len;
                
                // Scale shears to diagram height
                const v1 = (res.V1 || 0) / maxV * diagramHeight;
                const v2 = (res.V2 || 0) / maxV * diagramHeight;
                
                // Draw rectangular shear diagram
                ctx.beginPath();
                ctx.moveTo(p1.x, p1.y);
                ctx.lineTo(p1.x + perpX * v1, p1.y + perpY * v1);
                ctx.lineTo(p2.x + perpX * v2, p2.y + perpY * v2);
                ctx.lineTo(p2.x, p2.y);
                ctx.closePath();
                
                // Fill with semi-transparent cyan
                ctx.fillStyle = 'rgba(34, 211, 238, 0.3)';
                ctx.fill();
                
                // Outline
                ctx.strokeStyle = '#22d3ee';
                ctx.lineWidth = 2;
                ctx.setLineDash([]);
                ctx.stroke();
                
                // Draw shear values
                if (view.scale > 20) {
                    ctx.font = '10px Inter, sans-serif';
                    ctx.fillStyle = '#22d3ee';
                    ctx.textAlign = 'center';
                    
                    // V1 value
                    if (Math.abs(res.V1) > 0.01) {
                        ctx.fillText(
                            Math.abs(res.V1).toFixed(1),
                            p1.x + perpX * v1 * 1.4,
                            p1.y + perpY * v1 * 1.4
                        );
                    }
                    
                    // V2 value
                    if (Math.abs(res.V2) > 0.01) {
                        ctx.fillText(
                            Math.abs(res.V2).toFixed(1),
                            p2.x + perpX * v2 * 1.4,
                            p2.y + perpY * v2 * 1.4
                        );
                    }
                }
            });
            
            // Draw legend
            ctx.fillStyle = '#22d3ee';
            ctx.font = '12px Inter, sans-serif';
            ctx.textAlign = 'left';
            ctx.fillText('V (kN)', 10, 20);
            ctx.fillText('Max: ' + Math.abs(results.maxShear || 0).toFixed(2) + ' kN', 10, 35);
        }
        
        function drawConstraints() {
            Object.entries(model.constraints).forEach(([nodeId, bc]) => {
                const node = model.nodes[nodeId];
                if (!node) return;
                
                const p = worldToScreen(node.x, node.y);
                
                // Determine constraint type
                let constraintType = 'partial';  // default
                let constrainedDofs = [];
                
                if (typeof bc === 'string') {
                    if (bc === 'fixed') constraintType = 'fixed';
                    else if (bc === 'simply_supported' || bc === 'pinned') constraintType = 'pinned';
                    else if (bc === 'roller') constraintType = 'roller';
                } else if (typeof bc === 'object') {
                    const dofs = ['Ux', 'Uy', 'Uz', 'Rx', 'Ry', 'Rz'];
                    constrainedDofs = dofs.filter(d => bc[d]);
                    
                    if (constrainedDofs.length === 6) {
                        constraintType = 'fixed';
                    } else if (constrainedDofs.length >= 3 && bc.Uz && (bc.Rx || bc.Ry)) {
                        constraintType = 'pinned';
                    } else if (constrainedDofs.length === 1 && bc.Uz) {
                        constraintType = 'roller';
                    }
                }
                
                // Colors
                const mainColor = '#22c55e';  // Green for supports
                const darkColor = '#15803d';
                
                ctx.save();
                
                if (constraintType === 'fixed') {
                    // Fixed support: Filled triangle + hatching ground
                    const triSize = 12;
                    const groundWidth = triSize * 2.2;
                    const groundY = p.y + triSize + 4;
                    
                    // Triangle
                    ctx.beginPath();
                    ctx.moveTo(p.x, p.y + 4);
                    ctx.lineTo(p.x - triSize, groundY);
                    ctx.lineTo(p.x + triSize, groundY);
                    ctx.closePath();
                    
                    // Gradient fill for triangle
                    const triGradient = ctx.createLinearGradient(p.x, p.y, p.x, groundY);
                    triGradient.addColorStop(0, mainColor);
                    triGradient.addColorStop(1, darkColor);
                    ctx.fillStyle = triGradient;
                    ctx.fill();
                    ctx.strokeStyle = darkColor;
                    ctx.lineWidth = 1.5;
                    ctx.stroke();
                    
                    // Ground line
                    ctx.beginPath();
                    ctx.moveTo(p.x - groundWidth/2, groundY);
                    ctx.lineTo(p.x + groundWidth/2, groundY);
                    ctx.strokeStyle = darkColor;
                    ctx.lineWidth = 2;
                    ctx.stroke();
                    
                    // Hatching lines
                    ctx.strokeStyle = darkColor;
                    ctx.lineWidth = 1;
                    const hatchSpacing = 4;
                    const hatchLen = 6;
                    for (let hx = p.x - groundWidth/2 + 2; hx <= p.x + groundWidth/2; hx += hatchSpacing) {
                        ctx.beginPath();
                        ctx.moveTo(hx, groundY);
                        ctx.lineTo(hx - hatchLen * 0.7, groundY + hatchLen);
                        ctx.stroke();
                    }
                    
                } else if (constraintType === 'pinned') {
                    // Pinned support: Circle (pivot) + Triangle
                    const triSize = 10;
                    const circleRadius = 4;
                    const groundY = p.y + circleRadius * 2 + triSize + 2;
                    
                    // Circle (pivot point)
                    ctx.beginPath();
                    ctx.arc(p.x, p.y + circleRadius + 2, circleRadius, 0, Math.PI * 2);
                    ctx.fillStyle = '#0a0e17';
                    ctx.fill();
                    ctx.strokeStyle = mainColor;
                    ctx.lineWidth = 2;
                    ctx.stroke();
                    
                    // Triangle below circle
                    ctx.beginPath();
                    ctx.moveTo(p.x, p.y + circleRadius * 2 + 2);
                    ctx.lineTo(p.x - triSize, groundY);
                    ctx.lineTo(p.x + triSize, groundY);
                    ctx.closePath();
                    ctx.strokeStyle = mainColor;
                    ctx.lineWidth = 2;
                    ctx.stroke();
                    
                    // Ground line
                    ctx.beginPath();
                    ctx.moveTo(p.x - triSize - 2, groundY);
                    ctx.lineTo(p.x + triSize + 2, groundY);
                    ctx.stroke();
                    
                } else if (constraintType === 'roller') {
                    // Roller support: Triangle + two wheels + ground line
                    const triSize = 10;
                    const wheelRadius = 3;
                    const wheelY = p.y + triSize + wheelRadius + 4;
                    const groundY = wheelY + wheelRadius + 2;
                    
                    // Triangle (outline only)
                    ctx.beginPath();
                    ctx.moveTo(p.x, p.y + 4);
                    ctx.lineTo(p.x - triSize, p.y + triSize + 4);
                    ctx.lineTo(p.x + triSize, p.y + triSize + 4);
                    ctx.closePath();
                    ctx.strokeStyle = mainColor;
                    ctx.lineWidth = 2;
                    ctx.stroke();
                    
                    // Wheels
                    ctx.fillStyle = mainColor;
                    ctx.beginPath();
                    ctx.arc(p.x - triSize/2, wheelY, wheelRadius, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.beginPath();
                    ctx.arc(p.x + triSize/2, wheelY, wheelRadius, 0, Math.PI * 2);
                    ctx.fill();
                    
                    // Ground line
                    ctx.beginPath();
                    ctx.moveTo(p.x - triSize - 4, groundY);
                    ctx.lineTo(p.x + triSize + 4, groundY);
                    ctx.strokeStyle = darkColor;
                    ctx.lineWidth = 2;
                    ctx.stroke();
                    
                } else {
                    // Partial constraint: Small triangle with DOF indicators
                    const triSize = 8;
                    
                    ctx.beginPath();
                    ctx.moveTo(p.x, p.y + 4);
                    ctx.lineTo(p.x - triSize, p.y + triSize + 8);
                    ctx.lineTo(p.x + triSize, p.y + triSize + 8);
                    ctx.closePath();
                    ctx.strokeStyle = '#f59e0b';  // Amber for partial
                    ctx.lineWidth = 2;
                    ctx.stroke();
                    
                    // Show constrained DOFs
                    if (constrainedDofs.length > 0 && constrainedDofs.length < 6) {
                        ctx.fillStyle = '#f59e0b';
                        ctx.font = '7px Inter, sans-serif';
                        ctx.textAlign = 'center';
                        const label = constrainedDofs.length <= 3 ? constrainedDofs.join(',') : constrainedDofs.length + ' DOF';
                        ctx.fillText(label, p.x, p.y + triSize + 20);
                    }
                }
                
                ctx.restore();
            });
        }
        
        function drawLoads() {
            // Find max load value for proportional scaling
            let maxLoadValue = 0;
            model.loads.forEach(load => {
                if (load.Fz) maxLoadValue = Math.max(maxLoadValue, Math.abs(load.Fz));
                if (load.Fx) maxLoadValue = Math.max(maxLoadValue, Math.abs(load.Fx));
                if (load.Fy) maxLoadValue = Math.max(maxLoadValue, Math.abs(load.Fy));
            });
            Object.values(model.elements).forEach(elem => {
                if (elem.lineLoads) {
                    elem.lineLoads.forEach(ll => {
                        maxLoadValue = Math.max(maxLoadValue, Math.abs(ll.value || ll.q || 0));
                    });
                }
            });
            if (maxLoadValue === 0) maxLoadValue = 10;
            
            // Point loads
            model.loads.forEach(load => {
                const node = model.nodes[load.nodeId];
                if (!node) return;
                
                const p = worldToScreen(node.x, node.y);
                
                // Force Z (vertical)
                if (load.Fz && load.Fz !== 0) {
                    drawPremiumArrow(p.x, p.y, load.Fz, 'Fz', maxLoadValue);
                }
                
                // Force X (horizontal)
                if (load.Fx && load.Fx !== 0) {
                    drawPremiumArrow(p.x, p.y, load.Fx, 'Fx', maxLoadValue);
                }
                
                // Force Y
                if (load.Fy && load.Fy !== 0) {
                    drawPremiumArrow(p.x, p.y, load.Fy, 'Fy', maxLoadValue);
                }
                
                // Moments
                if (load.Mx && load.Mx !== 0) {
                    drawMomentArrow(p.x, p.y, load.Mx, 'Mx');
                }
                if (load.My && load.My !== 0) {
                    drawMomentArrow(p.x, p.y, load.My, 'My');
                }
            });
            
            // Helper function for premium force arrow
            function drawPremiumArrow(px, py, value, type, maxVal) {
                // Proportional scaling: min 0.5x, max 1.0x
                const loadRatio = Math.sqrt(Math.abs(value) / maxVal);
                const scaleFactor = 0.5 + loadRatio * 0.5;
                
                const baseArrowLen = 35;
                const arrowLen = baseArrowLen * scaleFactor;
                const arrowWidth = 8 * scaleFactor;
                const headLen = 12 * scaleFactor;
                
                // Direction based on type and sign
                let dirX = 0, dirY = 0;
                if (type === 'Fz') {
                    dirY = value < 0 ? 1 : -1;  // Negative = down
                } else if (type === 'Fx') {
                    dirX = value > 0 ? 1 : -1;
                } else if (type === 'Fy') {
                    dirY = value > 0 ? -1 : 1;  // In screen coords, Y is inverted
                }
                
                // Colors - red for down/compression, blue for up/tension
                const isDown = (type === 'Fz' && value < 0) || (type === 'Fy' && value < 0);
                const mainColor = isDown ? '#ef4444' : '#3b82f6';
                const darkColor = isDown ? '#b91c1c' : '#1d4ed8';
                
                const startX = px - dirX * arrowLen;
                const startY = py - dirY * arrowLen;
                const endX = px;
                const endY = py;
                
                ctx.save();
                
                // Arrow shaft with gradient
                const gradient = ctx.createLinearGradient(startX, startY, endX, endY);
                gradient.addColorStop(0, mainColor);
                gradient.addColorStop(1, darkColor);
                
                ctx.strokeStyle = gradient;
                ctx.lineWidth = 3;
                ctx.lineCap = 'round';
                ctx.beginPath();
                ctx.moveTo(startX, startY);
                ctx.lineTo(endX - dirX * headLen * 0.7, endY - dirY * headLen * 0.7);
                ctx.stroke();
                
                // Arrow head (filled triangle)
                ctx.fillStyle = darkColor;
                ctx.beginPath();
                ctx.moveTo(endX, endY);
                ctx.lineTo(endX - dirX * headLen - dirY * arrowWidth/2, endY - dirY * headLen + dirX * arrowWidth/2);
                ctx.lineTo(endX - dirX * headLen + dirY * arrowWidth/2, endY - dirY * headLen - dirX * arrowWidth/2);
                ctx.closePath();
                ctx.fill();
                
                // Value label
                if (view.scale > 20) {
                    const labelX = startX - dirX * 5;
                    const labelY = startY - dirY * 5;
                    
                    ctx.font = 'bold 9px Inter, sans-serif';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    
                    // Background pill
                    const labelText = `${Math.abs(value).toFixed(1)} kN`;
                    const textWidth = ctx.measureText(labelText).width;
                    ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
                    ctx.beginPath();
                    ctx.roundRect(labelX - textWidth/2 - 4, labelY - 7, textWidth + 8, 14, 3);
                    ctx.fill();
                    
                    ctx.fillStyle = mainColor;
                    ctx.fillText(labelText, labelX, labelY);
                }
                
                ctx.restore();
            }
            
            // Helper function for moment arrow (circular)
            function drawMomentArrow(px, py, value, type) {
                const radius = 15;
                const startAngle = -Math.PI * 0.7;
                const endAngle = Math.PI * 0.7;
                const clockwise = value > 0;
                
                const color = '#a855f7';  // Purple for moments
                
                ctx.save();
                ctx.strokeStyle = color;
                ctx.fillStyle = color;
                ctx.lineWidth = 2;
                
                // Circular arc
                ctx.beginPath();
                if (clockwise) {
                    ctx.arc(px, py - 20, radius, startAngle, endAngle, false);
                } else {
                    ctx.arc(px, py - 20, radius, endAngle, startAngle, false);
                }
                ctx.stroke();
                
                // Arrow head at end of arc
                const arrowAngle = clockwise ? endAngle : startAngle;
                const arrowX = px + Math.cos(arrowAngle) * radius;
                const arrowY = py - 20 + Math.sin(arrowAngle) * radius;
                const tangentAngle = arrowAngle + (clockwise ? Math.PI/2 : -Math.PI/2);
                
                ctx.beginPath();
                ctx.moveTo(arrowX, arrowY);
                ctx.lineTo(arrowX - Math.cos(tangentAngle) * 6 - Math.sin(tangentAngle) * 4, 
                          arrowY - Math.sin(tangentAngle) * 6 + Math.cos(tangentAngle) * 4);
                ctx.lineTo(arrowX - Math.cos(tangentAngle) * 6 + Math.sin(tangentAngle) * 4,
                          arrowY - Math.sin(tangentAngle) * 6 - Math.cos(tangentAngle) * 4);
                ctx.closePath();
                ctx.fill();
                
                // Label
                if (view.scale > 20) {
                    ctx.font = 'bold 8px Inter, sans-serif';
                    ctx.textAlign = 'center';
                    ctx.fillText(`${Math.abs(value).toFixed(1)} kNm`, px, py - 20 - radius - 8);
                }
                
                ctx.restore();
            }
            
            // Pressure area (with gradient fill)
            model.pressure.forEach(pr => {
                const p1 = worldToScreen(pr.x1, pr.y1);
                const p2 = worldToScreen(pr.x2, pr.y2);
                
                ctx.save();
                
                // Gradient fill
                const gradient = ctx.createLinearGradient(p1.x, p2.y, p1.x, p1.y);
                gradient.addColorStop(0, 'rgba(239, 68, 68, 0.25)');
                gradient.addColorStop(1, 'rgba(239, 68, 68, 0.05)');
                ctx.fillStyle = gradient;
                ctx.fillRect(p1.x, p2.y, p2.x - p1.x, p1.y - p2.y);
                
                // Border
                ctx.strokeStyle = '#ef4444';
                ctx.lineWidth = 2;
                ctx.setLineDash([6, 3]);
                ctx.strokeRect(p1.x, p2.y, p2.x - p1.x, p1.y - p2.y);
                ctx.setLineDash([]);
                
                // Label with background
                const labelX = (p1.x + p2.x) / 2;
                const labelY = (p1.y + p2.y) / 2;
                const labelText = `${pr.value} kN/m²`;
                
                ctx.font = 'bold 11px Inter, sans-serif';
                const textWidth = ctx.measureText(labelText).width;
                
                ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
                ctx.beginPath();
                ctx.roundRect(labelX - textWidth/2 - 6, labelY - 9, textWidth + 12, 18, 4);
                ctx.fill();
                
                ctx.fillStyle = '#ef4444';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(labelText, labelX, labelY);
                
                ctx.restore();
            });
            
            // Line loads on elements (premium version with gradient fill)
            Object.values(model.elements).forEach(elem => {
                if (!elem.lineLoads || elem.lineLoads.length === 0) return;
                
                const n1 = model.nodes[elem.n1];
                const n2 = model.nodes[elem.n2];
                if (!n1 || !n2) return;
                
                const p1 = worldToScreen(n1.x, n1.y);
                const p2 = worldToScreen(n2.x, n2.y);
                
                // Element direction
                const dx = p2.x - p1.x;
                const dy = p2.y - p1.y;
                const len = Math.sqrt(dx * dx + dy * dy);
                const ux = dx / len;
                const uy = dy / len;
                
                elem.lineLoads.forEach(load => {
                    const perpX = -uy;
                    const perpY = ux;
                    
                    // Yon cozucuyle ayni kaynaktan
                    const qValue = load.value ?? load.q ?? -10;
                    const dir2d = lineLoadDirection(load);
                    const isDownward = dir2d.isDownward;
                    
                    // Handle direction/angle
                    let loadAngleRad = Math.PI / 2; // Default vertical
                    if (load.angle !== undefined) {
                        loadAngleRad = load.angle * Math.PI / 180;
                    }
                    const arrowLen = 30;
                    
                    // Direction multiplier: negative = arrows point down, positive = arrows point up
                    const dirMult = isDownward ? 1 : -1;
                    const arrowDirX = dirMult * (perpX * Math.sin(loadAngleRad) + ux * Math.cos(loadAngleRad));
                    const arrowDirY = dirMult * (perpY * Math.sin(loadAngleRad) + uy * Math.cos(loadAngleRad));
                    
                    // Color based on direction
                    const mainColor = isDownward ? '#f97316' : '#22c55e';  // Orange down, green up
                    const darkColor = isDownward ? '#ea580c' : '#16a34a';
                    
                    // Handle start/end - support both formats
                    const startT = (load.startPct !== undefined) ? load.startPct / 100 : (load.start || 0);
                    const endT = (load.endPct !== undefined) ? load.endPct / 100 : (load.end || 1);
                    
                    // Calculate load area vertices
                    const loadStartX = p1.x + dx * startT;
                    const loadStartY = p1.y + dy * startT;
                    const loadEndX = p1.x + dx * endT;
                    const loadEndY = p1.y + dy * endT;
                    
                    const topStartX = loadStartX - arrowDirX * arrowLen;
                    const topStartY = loadStartY - arrowDirY * arrowLen;
                    const topEndX = loadEndX - arrowDirX * arrowLen;
                    const topEndY = loadEndY - arrowDirY * arrowLen;
                    
                    ctx.save();
                    
                    // Gradient fill for load area (color based on direction)
                    const gradient = ctx.createLinearGradient(
                        (loadStartX + loadEndX) / 2, 
                        (loadStartY + loadEndY) / 2,
                        (topStartX + topEndX) / 2,
                        (topStartY + topEndY) / 2
                    );
                    const gradientStart = isDownward ? 'rgba(249, 115, 22, 0.4)' : 'rgba(34, 197, 94, 0.4)';
                    const gradientEnd = isDownward ? 'rgba(249, 115, 22, 0.1)' : 'rgba(34, 197, 94, 0.1)';
                    gradient.addColorStop(0, gradientStart);
                    gradient.addColorStop(1, gradientEnd);
                    
                    ctx.fillStyle = gradient;
                    ctx.beginPath();
                    ctx.moveTo(loadStartX, loadStartY);
                    ctx.lineTo(topStartX, topStartY);
                    ctx.lineTo(topEndX, topEndY);
                    ctx.lineTo(loadEndX, loadEndY);
                    ctx.closePath();
                    ctx.fill();
                    
                    // Top line
                    ctx.strokeStyle = mainColor;
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.moveTo(topStartX, topStartY);
                    ctx.lineTo(topEndX, topEndY);
                    ctx.stroke();
                    
                    // Draw arrows
                    const numArrows = Math.max(3, Math.floor(len * (endT - startT) / 35));
                    ctx.fillStyle = darkColor;
                    
                    for (let i = 0; i < numArrows; i++) {
                        const t = startT + (endT - startT) * i / (numArrows - 1);
                        const px = p1.x + dx * t;
                        const py = p1.y + dy * t;
                        const topX = px - arrowDirX * arrowLen;
                        const topY = py - arrowDirY * arrowLen;
                        
                        // Arrow line
                        ctx.strokeStyle = mainColor;
                        ctx.lineWidth = 1.5;
                        ctx.beginPath();
                        ctx.moveTo(topX, topY);
                        ctx.lineTo(px, py);
                        ctx.stroke();
                        
                        // Arrow head
                        const headLen = 7;
                        ctx.beginPath();
                        ctx.moveTo(px, py);
                        ctx.lineTo(px - arrowDirX * headLen - arrowDirY * 3, py - arrowDirY * headLen + arrowDirX * 3);
                        ctx.lineTo(px - arrowDirX * headLen + arrowDirY * 3, py - arrowDirY * headLen - arrowDirX * 3);
                        ctx.closePath();
                        ctx.fill();
                    }
                    
                    // Label
                    if (view.scale > 20) {
                        const midT = (startT + endT) / 2;
                        const labelX = p1.x + dx * midT - arrowDirX * (arrowLen + 15);
                        const labelY = p1.y + dy * midT - arrowDirY * (arrowLen + 15);
                        
                        const labelText = `${qValue} kN/m`;
                        ctx.font = 'bold 9px Inter, sans-serif';
                        const textWidth = ctx.measureText(labelText).width;
                        
                        ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
                        ctx.beginPath();
                        ctx.roundRect(labelX - textWidth/2 - 4, labelY - 7, textWidth + 8, 14, 3);
                        ctx.fill();
                        
                        ctx.fillStyle = mainColor;
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.fillText(labelText, labelX, labelY);
                    }
                    
                    ctx.restore();
                });
            });
        }
        
        function getColorForRatio(ratio) {
            // Blue -> Green -> Yellow -> Orange -> Red
            ratio = Math.min(1, Math.max(0, ratio));
            
            if (ratio < 0.25) {
                return `rgb(59, 130, 246)`; // Blue
            } else if (ratio < 0.5) {
                return `rgb(34, 197, 94)`;  // Green
            } else if (ratio < 0.75) {
                return `rgb(234, 179, 8)`;  // Yellow
            } else if (ratio < 0.9) {
                return `rgb(249, 115, 22)`; // Orange
            } else {
                return `rgb(239, 68, 68)`;  // Red
            }
        }
        
        // ============== GRID GENERATOR ==============
        function toggleLoadInputType() {
            // Legacy - no longer used but kept for compatibility
        }
        
        function updateTotalLengths() {
            const transCount = parseInt(document.getElementById('transCount').value) || 2;
            const transSpacing = parseFloat(document.getElementById('transSpacing').value) || 1;
            const longCount = parseInt(document.getElementById('longCount').value) || 2;
            const longSpacing = parseFloat(document.getElementById('longSpacing').value) || 1;
            
            const totalX = ((transCount - 1) * transSpacing).toFixed(1);
            const totalY = ((longCount - 1) * longSpacing).toFixed(1);
            
            const xEl = document.getElementById('totalXLength');
            const yEl = document.getElementById('totalYLength');
            if (xEl) xEl.textContent = totalX;
            if (yEl) yEl.textContent = totalY;
        }
        
        function generateGrid() {
            // Get parameters
            const transLength = parseFloat(document.getElementById('transLength').value) || 4;
            const transCount = parseInt(document.getElementById('transCount').value) || 5;
            const transSpacing = parseFloat(document.getElementById('transSpacing').value) || 2;
            const transBeam = document.getElementById('transBeam').value || kesitSec();
            
            const longLength = parseFloat(document.getElementById('longLength').value) || 8;
            const longCount = parseInt(document.getElementById('longCount').value) || 3;
            const longSpacing = parseFloat(document.getElementById('longSpacing').value) || 2;
            const longBeam = document.getElementById('longBeam').value || kesitSec();
            
            const distLoad = parseFloat(document.getElementById('gridDistLoad').value) || 0;
            const loadDirection = document.getElementById('loadDirection').value || 'transverse';
            const supportType = document.getElementById('gridSupport').value || 'all_edges_ss';
            
            // Validation
            if (transCount < 2 || longCount < 2) {
                showToast('Need at least 2 beams in each direction', true);
                return;
            }
            
            // Calculate grid dimensions
            const totalX = (transCount - 1) * transSpacing;  // X direction (longitudinal extent)
            const totalY = (longCount - 1) * longSpacing;    // Y direction (transverse extent)
            
            // Reset model
            model = { nodes: {}, elements: {}, constraints: {}, loads: [], pressure: [] };
            
            // Create node grid
            // X positions: 0, transSpacing, 2*transSpacing, ..., (transCount-1)*transSpacing
            // Y positions: 0, longSpacing, 2*longSpacing, ..., (longCount-1)*longSpacing
            let nodeId = 1;
            const nodeGrid = [];  // nodeGrid[y_index][x_index] = nodeId
            
            for (let j = 0; j < longCount; j++) {
                const row = [];
                const y = j * longSpacing;
                for (let i = 0; i < transCount; i++) {
                    const x = i * transSpacing;
                    model.nodes[nodeId] = { id: nodeId, x, y, z: 0 };
                    row.push(nodeId);
                    nodeId++;
                }
                nodeGrid.push(row);
            }
            
            let elemId = 1;
            const applyToTrans = loadDirection === 'transverse' || loadDirection === 'both';
            const applyToLong = loadDirection === 'longitudinal' || loadDirection === 'both';
            
            // Create Longitudinal beams (X direction) - horizontal lines
            for (let j = 0; j < longCount; j++) {
                for (let i = 0; i < transCount - 1; i++) {
                    const lineLoads = (applyToLong && distLoad > 0) ? [{
                        id: 1,
                        value: distLoad,
                        angle: 90,
                        startPct: 0,
                        endPct: 100
                    }] : [];
                    
                    model.elements[elemId] = {
                        id: elemId,
                        n1: nodeGrid[j][i],
                        n2: nodeGrid[j][i + 1],
                        section: longBeam,
                        lineLoads: lineLoads
                    };
                    elemId++;
                }
            }
            
            // Create Transverse beams (Y direction) - vertical lines
            for (let j = 0; j < longCount - 1; j++) {
                for (let i = 0; i < transCount; i++) {
                    const lineLoads = (applyToTrans && distLoad > 0) ? [{
                        id: 1,
                        value: distLoad,
                        angle: 90,
                        startPct: 0,
                        endPct: 100
                    }] : [];
                    
                    model.elements[elemId] = {
                        id: elemId,
                        n1: nodeGrid[j][i],
                        n2: nodeGrid[j + 1][i],
                        section: transBeam,
                        lineLoads: lineLoads
                    };
                    elemId++;
                }
            }
            
            // Apply constraints based on support type
            const ssBC = { Ux: true, Uy: true, Uz: true, Rx: false, Ry: false, Rz: false };
            const fixedBC = { Ux: true, Uy: true, Uz: true, Rx: true, Ry: true, Rz: true };
            
            if (supportType === 'all_edges_ss' || supportType === 'all_edges_fixed') {
                const bc = supportType === 'all_edges_fixed' ? fixedBC : ssBC;
                // Top and bottom edges (Y = 0 and Y = totalY)
                for (let i = 0; i < transCount; i++) {
                    model.constraints[nodeGrid[0][i]] = { ...bc };
                    model.constraints[nodeGrid[longCount - 1][i]] = { ...bc };
                }
                // Left and right edges (X = 0 and X = totalX), excluding corners (already done)
                for (let j = 1; j < longCount - 1; j++) {
                    model.constraints[nodeGrid[j][0]] = { ...bc };
                    model.constraints[nodeGrid[j][transCount - 1]] = { ...bc };
                }
            } else if (supportType === 'corners_ss' || supportType === 'corners_fixed') {
                const bc = supportType === 'corners_fixed' ? fixedBC : ssBC;
                model.constraints[nodeGrid[0][0]] = { ...bc };
                model.constraints[nodeGrid[0][transCount - 1]] = { ...bc };
                model.constraints[nodeGrid[longCount - 1][0]] = { ...bc };
                model.constraints[nodeGrid[longCount - 1][transCount - 1]] = { ...bc };
            }
            
            // Clear selection and results
            results = null;
            selectedElement = null;
            selectedNode = null;
            selectedElements.clear();
            selectedNodes.clear();
            setStyle('elementDetails', 'display', 'none');
            
            // Update UI
            updateModelSummary();
            updateSectionTable();
            fitView();
            
            // Count beams
            const numLongBeams = longCount * (transCount - 1);
            const numTransBeams = transCount * (longCount - 1);
            
            // Create message
            let loadMsg = '';
            if (distLoad > 0) {
                const dirText = loadDirection === 'both' ? 'all' : loadDirection;
                loadMsg = ` | q=${distLoad} kN/m on ${dirText}`;
            }
            
            saveState(); // Save for undo
            showToast(`Grillage: ${totalX.toFixed(1)}×${totalY.toFixed(1)}m | ${numTransBeams} trans. + ${numLongBeams} long. beams${loadMsg}`);
        }
        
