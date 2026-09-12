        // ============== MEASURING TOOL ==============

        // ============== MEASUREMENT TOOL ==============
        function toggleMeasureMode() {
            measureMode = !measureMode;
            
            const btn = document.getElementById('btnMeasure');
            if (btn) {
                btn.classList.toggle('active', measureMode);
                btn.style.background = measureMode ? 'var(--warning)' : '';
                btn.style.color = measureMode ? '#000' : '';
            }
            
            if (measureMode) {
                clearMeasurement();
                canvas.style.cursor = 'crosshair';
                showToast('<span class="icon"><svg viewBox="0 0 24 24"><path d="M16 3H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z"/><line x1="6" y1="7" x2="10" y2="7"/><line x1="6" y1="12" x2="8" y2="12"/><line x1="6" y1="17" x2="10" y2="17"/></svg></span> Measure mode: Click first point (or node)', 'info');
            } else {
                canvas.style.cursor = 'default';
                clearMeasurement();
                draw();
            }
        }
        
        function handleMeasureClick(mouseX, mouseY) {
            // Try to snap to a node first
            const clickedNode = getNodeAtPosition(mouseX, mouseY);
            
            let worldPos;
            if (clickedNode) {
                worldPos = { x: clickedNode.x, y: clickedNode.y, z: clickedNode.z || 0 };
            } else {
                worldPos = screenToWorld(mouseX, mouseY);
                worldPos.z = 0;
            }
            
            if (!measurePoint1) {
                // First point
                measurePoint1 = {
                    x: worldPos.x,
                    y: worldPos.y,
                    z: worldPos.z,
                    screenX: mouseX,
                    screenY: mouseY,
                    nodeId: clickedNode ? clickedNode.id : null
                };
                showToast('<span class="icon"><svg viewBox="0 0 24 24"><path d="M16 3H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z"/><line x1="6" y1="7" x2="10" y2="7"/><line x1="6" y1="12" x2="8" y2="12"/><line x1="6" y1="17" x2="10" y2="17"/></svg></span> First point set. Click second point.', 'info');
                draw();
                drawMeasurement();
            } else {
                // Second point - complete measurement
                measurePoint2 = {
                    x: worldPos.x,
                    y: worldPos.y,
                    z: worldPos.z,
                    screenX: mouseX,
                    screenY: mouseY,
                    nodeId: clickedNode ? clickedNode.id : null
                };
                
                // Calculate distance
                const dx = measurePoint2.x - measurePoint1.x;
                const dy = measurePoint2.y - measurePoint1.y;
                const dz = measurePoint2.z - measurePoint1.z;
                const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
                
                // Show result
                showMeasurementResult(distance, dx, dy, dz);
                
                draw();
                drawMeasurement();
            }
        }
        
        function updateMeasureHover(mouseX, mouseY) {
            if (!measurePoint1) {
                // Just update cursor appearance when hovering over nodes
                const clickedNode = getNodeAtPosition(mouseX, mouseY);
                canvas.style.cursor = clickedNode ? 'crosshair' : 'crosshair';
            } else if (!measurePoint2) {
                // Update hover point for preview
                const clickedNode = getNodeAtPosition(mouseX, mouseY);
                
                if (clickedNode) {
                    measureHoverPoint = {
                        x: clickedNode.x,
                        y: clickedNode.y,
                        z: clickedNode.z || 0,
                        screenX: mouseX,
                        screenY: mouseY,
                        nodeId: clickedNode.id
                    };
                } else {
                    const worldPos = screenToWorld(mouseX, mouseY);
                    measureHoverPoint = {
                        x: worldPos.x,
                        y: worldPos.y,
                        z: 0,
                        screenX: mouseX,
                        screenY: mouseY,
                        nodeId: null
                    };
                }
                
                draw();
                drawMeasurement();
            }
        }
        
        function drawMeasurement() {
            if (!measurePoint1) return;
            
            const isDarkMode = !document.body.classList.contains('light-mode');
            const p1Screen = worldToScreen(measurePoint1.x, measurePoint1.y);
            
            // Draw first point marker
            ctx.beginPath();
            ctx.arc(p1Screen.x, p1Screen.y, 8, 0, Math.PI * 2);
            ctx.fillStyle = measurePoint1.nodeId ? 'var(--success)' : 'var(--warning)';
            ctx.fill();
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.stroke();
            
            // Label first point
            ctx.font = 'bold 11px Inter, sans-serif';
            ctx.fillStyle = isDarkMode ? '#fff' : '#000';
            ctx.textAlign = 'center';
            ctx.fillText(measurePoint1.nodeId ? `N${measurePoint1.nodeId}` : 'P1', p1Screen.x, p1Screen.y - 14);
            
            // If we have a second point or hover point, draw line
            const endPoint = measurePoint2 || measureHoverPoint;
            
            if (endPoint) {
                const p2Screen = worldToScreen(endPoint.x, endPoint.y);
                
                // Draw dashed line
                ctx.beginPath();
                ctx.setLineDash([6, 4]);
                ctx.moveTo(p1Screen.x, p1Screen.y);
                ctx.lineTo(p2Screen.x, p2Screen.y);
                ctx.strokeStyle = 'var(--warning)';
                ctx.lineWidth = 2;
                ctx.stroke();
                ctx.setLineDash([]);
                
                // Draw second point marker
                ctx.beginPath();
                ctx.arc(p2Screen.x, p2Screen.y, 8, 0, Math.PI * 2);
                ctx.fillStyle = endPoint.nodeId ? 'var(--success)' : (measurePoint2 ? 'var(--warning)' : 'rgba(245, 158, 11, 0.5)');
                ctx.fill();
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 2;
                ctx.stroke();
                
                // Label second point
                if (measurePoint2) {
                    ctx.fillStyle = isDarkMode ? '#fff' : '#000';
                    ctx.fillText(measurePoint2.nodeId ? `N${measurePoint2.nodeId}` : 'P2', p2Screen.x, p2Screen.y - 14);
                }
                
                // Calculate and display distance
                const dx = endPoint.x - measurePoint1.x;
                const dy = endPoint.y - measurePoint1.y;
                const dz = (endPoint.z || 0) - (measurePoint1.z || 0);
                const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
                
                // Draw distance label at midpoint
                const midX = (p1Screen.x + p2Screen.x) / 2;
                const midY = (p1Screen.y + p2Screen.y) / 2;
                
                // Background for text
                const distText = `${(distance * 1000).toFixed(0)} mm`;
                const textWidth = ctx.measureText(distText).width;
                
                ctx.fillStyle = isDarkMode ? 'rgba(15, 23, 42, 0.9)' : 'rgba(255, 255, 255, 0.9)';
                ctx.fillRect(midX - textWidth / 2 - 8, midY - 20, textWidth + 16, 24);
                ctx.strokeStyle = 'var(--warning)';
                ctx.lineWidth = 1;
                ctx.strokeRect(midX - textWidth / 2 - 8, midY - 20, textWidth + 16, 24);
                
                ctx.fillStyle = 'var(--warning)';
                ctx.font = 'bold 12px Inter, sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText(distText, midX, midY - 4);
                
                // Draw dimension lines (perpendicular ticks at ends)
                const angle = Math.atan2(p2Screen.y - p1Screen.y, p2Screen.x - p1Screen.x);
                const tickLen = 10;
                const perpAngle = angle + Math.PI / 2;
                
                ctx.strokeStyle = 'var(--warning)';
                ctx.lineWidth = 1.5;
                
                // Start tick
                ctx.beginPath();
                ctx.moveTo(p1Screen.x + Math.cos(perpAngle) * tickLen, p1Screen.y + Math.sin(perpAngle) * tickLen);
                ctx.lineTo(p1Screen.x - Math.cos(perpAngle) * tickLen, p1Screen.y - Math.sin(perpAngle) * tickLen);
                ctx.stroke();
                
                // End tick
                ctx.beginPath();
                ctx.moveTo(p2Screen.x + Math.cos(perpAngle) * tickLen, p2Screen.y + Math.sin(perpAngle) * tickLen);
                ctx.lineTo(p2Screen.x - Math.cos(perpAngle) * tickLen, p2Screen.y - Math.sin(perpAngle) * tickLen);
                ctx.stroke();
            }
        }
        
        function showMeasurementResult(distance, dx, dy, dz) {
            const distMm = (distance * 1000).toFixed(1);
            const distM = distance.toFixed(4);
            const dxMm = (dx * 1000).toFixed(1);
            const dyMm = (dy * 1000).toFixed(1);
            const dzMm = (dz * 1000).toFixed(1);
            
            // Create result overlay
            const existingOverlay = document.getElementById('measureResultOverlay');
            if (existingOverlay) existingOverlay.remove();
            
            const overlay = document.createElement('div');
            overlay.id = 'measureResultOverlay';
            overlay.style.cssText = `
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: rgba(15, 23, 42, 0.95);
                border: 2px solid var(--warning);
                border-radius:var(--r-ovl);
                padding: 20px;
                z-index: 1000;
                min-width: 280px;
                box-shadow: 0 8px 32px rgba(0,0,0,0.4);
            `;
            
            overlay.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
                    <h3 style="color:var(--warning); margin:0; font-size:var(--fs-md);"><span class="icon"><svg viewBox="0 0 24 24"><path d="M16 3H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z"/><line x1="6" y1="7" x2="10" y2="7"/><line x1="6" y1="12" x2="8" y2="12"/><line x1="6" y1="17" x2="10" y2="17"/></svg></span> Measurement Result</h3>
                    <button onclick="closeMeasurementResult()" style="background:none; border:none; color:var(--text-2); font-size:var(--fs-lg); cursor:pointer;">&times;</button>
                </div>
                
                <div style="background:#1e3a5f; border-radius:var(--r-ovl); padding:16px; text-align:center; margin-bottom:16px;">
                    <div style="color:var(--text-2); font-size:var(--fs-sm); margin-bottom:4px;">Total Distance</div>
                    <div style="color:var(--warning); font-size:var(--fs-lg); font-weight:600;">${distMm} mm</div>
                    <div style="color:var(--text-3); font-size:var(--fs-sm);">${distM} m</div>
                </div>
                
                <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:8px; margin-bottom:16px;">
                    <div style="background:var(--bg-elev); padding:8px; border-radius:var(--r-ctl); text-align:center;">
                        <div style="color:var(--danger); font-size:var(--fs-xs);">ΔX</div>
                        <div style="color:var(--danger); font-weight:600;">${dxMm} mm</div>
                    </div>
                    <div style="background:var(--bg-elev); padding:8px; border-radius:var(--r-ctl); text-align:center;">
                        <div style="color:var(--success); font-size:var(--fs-xs);">ΔY</div>
                        <div style="color:var(--success); font-weight:600;">${dyMm} mm</div>
                    </div>
                    <div style="background:var(--bg-elev); padding:8px; border-radius:var(--r-ctl); text-align:center;">
                        <div style="color:var(--accent-info); font-size:var(--fs-xs);">ΔZ</div>
                        <div style="color:#93c5fd; font-weight:600;">${dzMm} mm</div>
                    </div>
                </div>
                
                <div style="display:flex; gap:8px;">
                    <button onclick="newMeasurement()" class="btn-secondary" style="flex:1;"><span class="icon"><svg viewBox="0 0 24 24"><path d="M16 3H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z"/><line x1="6" y1="7" x2="10" y2="7"/><line x1="6" y1="12" x2="8" y2="12"/><line x1="6" y1="17" x2="10" y2="17"/></svg></span> New Measure</button>
                    <button onclick="closeMeasurementResult(); toggleMeasureMode();" class="btn-primary" style="flex:1;"><span class="icon"><svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg></span> Done</button>
                </div>
            `;
            
            document.body.appendChild(overlay);
        }
        
        function closeMeasurementResult() {
            const overlay = document.getElementById('measureResultOverlay');
            if (overlay) overlay.remove();
        }
        
        function newMeasurement() {
            closeMeasurementResult();
            clearMeasurement();
            showToast('<span class="icon"><svg viewBox="0 0 24 24"><path d="M16 3H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z"/><line x1="6" y1="7" x2="10" y2="7"/><line x1="6" y1="12" x2="8" y2="12"/><line x1="6" y1="17" x2="10" y2="17"/></svg></span> Click first point', 'info');
            draw();
        }
        
        function clearMeasurement() {
            measurePoint1 = null;
            measurePoint2 = null;
            measureHoverPoint = null;
        }
        
        // Add keyboard shortcut for measure (M key)
        document.addEventListener('keydown', function(e) {
            // Shift+M for Measure mode (M alone is now Move command)
            if ((e.key === 'm' || e.key === 'M') && e.shiftKey) {
                if (!e.ctrlKey && !e.altKey && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
                    toggleMeasureMode();
                    e.preventDefault();
                }
            }
            
            // ESC to cancel measurement
            if (e.key === 'Escape' && measureMode) {
                toggleMeasureMode();
            }
        });
