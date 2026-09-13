        // ============== GENERAL DATA TAB FUNCTIONS ==============
        
        function selectProfileType(type) {
            currentProfileType = type;
            
            // Update tab buttons (underline tabs use .active class)
            ['HP', 'FB', 'T', 'L'].forEach(t => {
                const btn = $(`profTab${t}`);
                if (btn) {
                    btn.classList.toggle('active', t === type);
                }
            });
            
            // Show/hide forms
            ['HP', 'FB', 'T', 'L'].forEach(t => {
                const form = $(`profileForm${t}`);
                if (form) {
                    form.style.display = t === type ? 'block' : 'none';
                }
            });
            
            // Update preview
            updateProfilePreview();
        }
        
        // ============== SECTION MODAL ==============
        
        let currentModalSection = '';
        
        function openSectionModal() {
            // Open modal with Entity Info section diagram
            const modal = document.getElementById('sectionModal');
            const modalSvg = document.getElementById('sectionModalSvg');
            const modalTitle = document.getElementById('sectionModalTitle');
            
            if (!modal || currentInfoBeam == null) return;
            
            const elem = model.elements[currentInfoBeam];
            if (!elem) return;
            
            currentModalSection = elem.section;
            modalTitle.textContent = elem.section;
            
            // Draw larger version
            drawSectionDiagramLarge(elem.section, elem.orientation || 0, modalSvg);
            
            modal.classList.add('active');
        }
        
        function openSectionModalFromPreview() {
            // Open modal with General Data preview
            const modal = document.getElementById('sectionModal');
            const modalSvg = document.getElementById('sectionModalSvg');
            const modalTitle = document.getElementById('sectionModalTitle');
            
            if (!modal) return;
            
            // Build section name from current profile settings
            let sectionName = '';
            const plateEnabled = $('plateEnabled')?.checked;
            const plateW = parseFloat($('plateWidth')?.value) || 300;
            const plateT = parseFloat($('plateThickness')?.value) || 12;
            
            switch (currentProfileType) {
                case 'HP':
                    sectionName = `HP${$('hpB')?.value || 200}x${$('hpT')?.value || 10}`;
                    break;
                case 'FB':
                    sectionName = `FB${$('fbH')?.value || 150}x${$('fbT')?.value || 12}`;
                    break;
                case 'T':
                    sectionName = `T${$('tH')?.value || 150}x${$('tTw')?.value || 10}/${$('tBf')?.value || 100}x${$('tTf')?.value || 12}`;
                    break;
                case 'L':
                    sectionName = `L${$('lA')?.value || 100}x${$('lB')?.value || 100}x${$('lT')?.value || 10}`;
                    break;
            }
            
            if (plateEnabled) {
                sectionName += `_${plateW}x${plateT}`;
            }
            
            currentModalSection = sectionName;
            modalTitle.textContent = sectionName;
            
            // Draw larger version
            drawSectionDiagramLarge(sectionName, 0, modalSvg);
            
            modal.classList.add('active');
        }
        
        function closeSectionModal(event) {
            if (event && event.target !== event.currentTarget) return;
            const modal = document.getElementById('sectionModal');
            if (modal) modal.classList.remove('active');
        }
        
        function drawSectionDiagramLarge(sectionName, orientation, targetSvg) {
            // Parse composite section
            let profilePart = sectionName;
            let plateW = 0, plateT = 0;
            
            if (sectionName.includes('_')) {
                const parts = sectionName.split('_');
                profilePart = parts[0];
                const plateMatch = parts[1].match(/(\d+)[Xx](\d+)/);
                if (plateMatch) {
                    plateW = parseInt(plateMatch[1]);
                    plateT = parseInt(plateMatch[2]);
                }
            }
            
            // Parse profile
            const hpMatch = profilePart.match(/HP(\d+)[Xx](\d+)/);
            const fbMatch = profilePart.match(/FB(\d+)[Xx](\d+)/);
            const tMatch = profilePart.match(/T(\d+)[Xx](\d+)[\/\+](\d+)[Xx](\d+)/);
            const lMatch = profilePart.match(/L(\d+)[Xx](\d+)[Xx](\d+)/);
            
            let profileData = null;
            let profileType = '';
            
            if (hpMatch) {
                const b = parseInt(hpMatch[1]);
                const t = parseInt(hpMatch[2]);
                const catalogHP = HP_CATALOG.find(hp => hp.b === b && hp.t === t);
                profileData = {
                    h: b, t: t,
                    c: catalogHP?.c || t * 2.5,
                    r: catalogHP?.r || t * 0.8,
                    maxWidth: (catalogHP?.c || t * 2.5) + t
                };
                profileType = 'HP';
            } else if (fbMatch) {
                profileData = { h: parseInt(fbMatch[1]), t: parseInt(fbMatch[2]), maxWidth: parseInt(fbMatch[2]) };
                profileType = 'FB';
            } else if (tMatch) {
                profileData = { h: parseInt(tMatch[1]), tw: parseInt(tMatch[2]), bf: parseInt(tMatch[3]), tf: parseInt(tMatch[4]), maxWidth: parseInt(tMatch[3]) };
                profileType = 'T';
            } else if (lMatch) {
                profileData = { a: parseInt(lMatch[1]), b: parseInt(lMatch[2]), t: parseInt(lMatch[3]), h: parseInt(lMatch[1]), maxWidth: parseInt(lMatch[2]) };
                profileType = 'L';
            }
            
            if (!profileData) {
                targetSvg.innerHTML = `<text x="300" y="200" text-anchor="middle" fill="var(--text-3)" font-size="16">${sectionName}</text>`;
                return;
            }
            
            // Larger scale for modal (600x400 viewbox)
            const cx = 300;
            const viewHeight = 400;
            const plateEnabled = plateW > 0 && plateT > 0;
            
            let totalHeight = profileData.h;
            let totalWidth = profileData.maxWidth || 50;
            
            if (plateEnabled) {
                totalHeight += plateT;
                totalWidth = Math.max(totalWidth, plateW);
            }
            
            const scaleH = (viewHeight - 100) / totalHeight;
            const scaleW = 500 / totalWidth;
            const scale = Math.min(scaleH, scaleW, 2.5);
            
            let svgContent = '';
            let topY = 50;
            
            // Plate
            if (plateEnabled) {
                const plateWS = plateW * scale;
                const plateTS = plateT * scale;
                svgContent += `<rect x="${cx - plateWS/2}" y="${topY}" width="${plateWS}" height="${plateTS}" fill="none" stroke="#e2e8f0" stroke-width="3"/>`;
                svgContent += drawDimLineLarge(cx - plateWS/2, topY - 25, cx + plateWS/2, topY - 25, plateW, false);
                topY += plateTS;
            }
            
            // Draw profile
            switch (profileType) {
                case 'HP':
                    svgContent += drawHPProfileLarge(profileData, cx, topY, scale, plateEnabled);
                    break;
                case 'FB':
                    svgContent += drawFBProfileLarge(profileData, cx, topY, scale, plateEnabled);
                    break;
                case 'T':
                    svgContent += drawTProfileLarge(profileData, cx, topY, scale, plateEnabled);
                    break;
                case 'L':
                    svgContent += drawLProfileLarge(profileData, cx, topY, scale, plateEnabled);
                    break;
            }
            
            // Centroid
            if (plateEnabled) {
                const totalH = (plateT + profileData.h) * scale;
                const centY = 50 + totalH * 0.35;
                svgContent += `<circle cx="${cx}" cy="${centY}" r="8" fill="var(--danger)" stroke="#fff" stroke-width="2"/>`;
            }
            
            // Apply rotation
            if (orientation !== 0) {
                const centerY = topY + (profileData.h * scale) / 2;
                targetSvg.innerHTML = `<g transform="rotate(${orientation}, ${cx}, ${centerY})">${svgContent}</g>`;
                targetSvg.innerHTML += `<text x="${cx}" y="${viewHeight - 15}" text-anchor="middle" fill="var(--primary)" font-size="14">↻ ${orientation}°</text>`;
            } else {
                targetSvg.innerHTML = svgContent;
            }
        }
        
        function drawDimLineLarge(x1, y1, x2, y2, value, vertical = false) {
            const midX = (x1 + x2) / 2;
            const midY = (y1 + y2) / 2;
            let svg = '';
            
            svg += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#ffd700" stroke-width="2" stroke-dasharray="6,3"/>`;
            
            if (vertical) {
                svg += `<line x1="${x1-6}" y1="${y1}" x2="${x1+6}" y2="${y1}" stroke="#ffd700" stroke-width="2"/>`;
                svg += `<line x1="${x2-6}" y1="${y2}" x2="${x2+6}" y2="${y2}" stroke="#ffd700" stroke-width="2"/>`;
                svg += `<text x="${midX - 20}" y="${midY + 5}" fill="#ffd700" font-size="14" font-weight="bold" transform="rotate(-90 ${midX - 20} ${midY + 5})">${value}</text>`;
            } else {
                svg += `<line x1="${x1}" y1="${y1-6}" x2="${x1}" y2="${y1+6}" stroke="#ffd700" stroke-width="2"/>`;
                svg += `<line x1="${x2}" y1="${y2-6}" x2="${x2}" y2="${y2+6}" stroke="#ffd700" stroke-width="2"/>`;
                svg += `<text x="${midX}" y="${midY - 8}" fill="#ffd700" font-size="14" font-weight="bold" text-anchor="middle">${value}</text>`;
            }
            
            return svg;
        }
        
        function drawHPProfileLarge(data, cx, topY, scale, hasPlate) {
            const { h, t, c, r } = data;
            const bS = h * scale;
            const tS = t * scale;
            const cS = c * scale;
            const rS = r * scale;
            
            const leftEdge = cx - tS/2;
            const rightEdge = cx + tS/2;
            const profileBottom = topY + bS;
            
            const slopeAngle = 30 * Math.PI / 180;
            const sinA = Math.sin(slopeAngle);
            const cosA = Math.cos(slopeAngle);
            
            const bulbTipX = cx + cS;
            const upperRadiusCenterY = profileBottom - cS + rS * sinA;
            const upperTangentX = rightEdge + rS * sinA;
            const upperTangentY = profileBottom - cS + rS * (1 - cosA);
            const lowerRadiusCenterX = bulbTipX - rS;
            const lowerRadiusCenterY = profileBottom - rS;
            const lowerTangentX = lowerRadiusCenterX + rS * sinA;
            const lowerTangentY = lowerRadiusCenterY - rS * cosA;
            const r2 = rS * 0.4;
            
            const pathD = `M ${leftEdge} ${topY} L ${leftEdge} ${profileBottom - r2} Q ${leftEdge} ${profileBottom} ${leftEdge + r2} ${profileBottom} L ${lowerRadiusCenterX} ${profileBottom} A ${rS} ${rS} 0 0 0 ${lowerTangentX} ${lowerTangentY} L ${upperTangentX} ${upperTangentY} A ${rS} ${rS} 0 0 1 ${rightEdge} ${upperRadiusCenterY - rS} L ${rightEdge} ${topY} Z`;
            
            let svg = `<path d="${pathD}" fill="none" stroke="#e2e8f0" stroke-width="3"/>`;
            svg += drawDimLineLarge(bulbTipX + 40, topY, bulbTipX + 40, profileBottom, h, true);
            svg += drawDimLineLarge(leftEdge, profileBottom + 30, rightEdge, profileBottom + 30, t, false);
            svg += drawDimLineLarge(cx, profileBottom + 50, bulbTipX, profileBottom + 50, Math.round(c), false);
            
            return svg;
        }
        
        function drawFBProfileLarge(data, cx, topY, scale, hasPlate) {
            const { h, t } = data;
            const hS = h * scale;
            const tS = t * scale;
            
            let svg = `<rect x="${cx - tS/2}" y="${topY}" width="${tS}" height="${hS}" fill="none" stroke="#e2e8f0" stroke-width="3"/>`;
            svg += drawDimLineLarge(cx + tS/2 + 35, topY, cx + tS/2 + 35, topY + hS, h, true);
            svg += drawDimLineLarge(cx - tS/2, topY + hS + 25, cx + tS/2, topY + hS + 25, t, false);
            
            return svg;
        }
        
        function drawTProfileLarge(data, cx, topY, scale, hasPlate) {
            // h = web height (flange HARİÇ)
            // totalHeight = h + tf
            const { h, tw, bf, tf } = data;
            const totalHeight = h + tf;
            const hS = h * scale;        // Web height scaled
            const twS = tw * scale;
            const bfS = bf * scale;
            const tfS = tf * scale;
            const totalHS = totalHeight * scale;
            
            const pathD = `M ${cx - twS/2} ${topY} L ${cx - twS/2} ${topY + hS} L ${cx - bfS/2} ${topY + hS} L ${cx - bfS/2} ${topY + totalHS} L ${cx + bfS/2} ${topY + totalHS} L ${cx + bfS/2} ${topY + hS} L ${cx + twS/2} ${topY + hS} L ${cx + twS/2} ${topY} Z`;
            
            let svg = `<path d="${pathD}" fill="none" stroke="#e2e8f0" stroke-width="3"/>`;
            svg += drawDimLineLarge(cx + bfS/2 + 40, topY, cx + bfS/2 + 40, topY + totalHS, totalHeight, true);
            svg += drawDimLineLarge(cx - bfS/2, topY + totalHS + 30, cx + bfS/2, topY + totalHS + 30, bf, false);
            
            return svg;
        }
        
        function drawLProfileLarge(data, cx, topY, scale, hasPlate) {
            const { a, b, t } = data;
            const aS = a * scale;
            const bS = b * scale;
            const tS = t * scale;
            
            const pathD = `M ${cx - tS/2} ${topY} L ${cx - tS/2} ${topY + aS} L ${cx - tS/2 + bS} ${topY + aS} L ${cx - tS/2 + bS} ${topY + aS - tS} L ${cx + tS/2} ${topY + aS - tS} L ${cx + tS/2} ${topY} Z`;
            
            let svg = `<path d="${pathD}" fill="none" stroke="#e2e8f0" stroke-width="3"/>`;
            svg += drawDimLineLarge(cx - tS/2 - 40, topY, cx - tS/2 - 40, topY + aS, a, true);
            svg += drawDimLineLarge(cx - tS/2, topY + aS + 30, cx - tS/2 + bS, topY + aS + 30, b, false);
            
            return svg;
        }
        
        // ============== PROFILE PREVIEW SVG ==============
        // Acilista onizleme alani, form alanlarindaki varsayilan b=200 t=10
        // degerlerinden bir HP kesiti ciziyordu. Panel "Beam Profiles 0" ve
        // "No profiles created" derken yaninda cizili bir profil durmasi
        // "zaten bir profil var" gibi okunuyordu. Kullanici katalogdan bir sey
        // secene ya da bir olcu yazana kadar onizleme bos durur.
        let profilSecildi = false;

        function profilSecimiBasladi() {
            if (profilSecildi) return;
            profilSecildi = true;
            updateProfilePreview();
        }

        function updateProfilePreview() {
            const svg = $('profilePreviewSVG');
            if (!svg) return;

            if (!profilSecildi) {
                svg.innerHTML =
                    '<text x="140" y="82" text-anchor="middle" fill="currentColor" ' +
                    'opacity="0.45" font-size="12">No profile selected</text>' +
                    '<text x="140" y="102" text-anchor="middle" fill="currentColor" ' +
                    'opacity="0.3" font-size="11">Pick one from the catalog, or enter dimensions</text>';
                return;
            }
            
            const plateEnabled = $('plateEnabled')?.checked;
            const plateW = parseFloat($('plateWidth')?.value) || 300;
            const plateT = parseFloat($('plateThickness')?.value) || 12;
            
            let svgContent = '';
            const cx = 140;  // center x
            const viewWidth = 280;
            const viewHeight = 180;
            
            // Get profile dimensions based on type
            let profileData = getProfileDimensions();
            if (!profileData) return;
            
            // Calculate scale to fit in view
            let totalHeight = profileData.h;
            let totalWidth = profileData.maxWidth || profileData.t || 50;
            
            // T profile: h = web height, totalHeight = h + tf
            if (currentProfileType === 'T') {
                totalHeight = profileData.h + profileData.tf;
            }
            
            if (plateEnabled) {
                totalHeight += plateT;
                totalWidth = Math.max(totalWidth, plateW);
            }
            
            const scaleH = (viewHeight - 40) / totalHeight;
            const scaleW = (viewWidth - 40) / totalWidth;
            const scale = Math.min(scaleH, scaleW, 1.4);  // max scale 1.4
            
            // Vertically center the profile
            let topY = Math.max(15, (viewHeight - totalHeight * scale) / 2);
            const initialTopY = topY;
            
            // Draw plate if enabled
            if (plateEnabled) {
                const plateWS = plateW * scale;
                const plateTS = plateT * scale;
                svgContent += `<rect x="${cx - plateWS/2}" y="${topY}" width="${plateWS}" height="${plateTS}" 
                    fill="rgba(56,189,248,0.12)" stroke="var(--primary)" stroke-width="2"/>`;
                
                topY += plateTS;
            }
            
            // Draw profile based on type
            switch (currentProfileType) {
                case 'HP':
                    svgContent += drawHPProfile(profileData, cx, topY, scale, plateEnabled);
                    break;
                case 'FB':
                    svgContent += drawFBProfile(profileData, cx, topY, scale, plateEnabled);
                    break;
                case 'T':
                    svgContent += drawTProfile(profileData, cx, topY, scale, plateEnabled);
                    break;
                case 'L':
                    svgContent += drawLProfile(profileData, cx, topY, scale, plateEnabled);
                    break;
            }
            
            // Centroid marker
            if (plateEnabled) {
                let profileH = profileData.h;
                if (currentProfileType === 'T') {
                    profileH = profileData.h + profileData.tf;
                }
                const totalH = (plateT + profileH) * scale;
                // Approximate centroid position
                const centY = initialTopY + totalH * 0.35;
                svgContent += `<circle cx="${cx}" cy="${centY}" r="4" fill="var(--danger)" stroke="#0f172a" stroke-width="1.5"/>`;
            }
            
            svg.innerHTML = svgContent;
        }
        
        function getProfileDimensions() {
            switch (currentProfileType) {
                case 'HP': {
                    const b = parseFloat($('hpB')?.value) || 200;
                    const t = parseFloat($('hpT')?.value) || 10;
                    const catalogHP = HP_CATALOG.find(hp => hp.b === b && hp.t === t);
                    return {
                        type: 'HP',
                        h: b,  // height
                        t: t,  // web thickness
                        c: catalogHP?.c || t * 2.5,  // bulb width
                        r: catalogHP?.r || t * 0.8,   // radius
                        maxWidth: (catalogHP?.c || t * 2.5) + t
                    };
                }
                case 'FB': {
                    const h = parseFloat($('fbH')?.value) || 150;
                    const t = parseFloat($('fbT')?.value) || 12;
                    return { type: 'FB', h, t, maxWidth: t };
                }
                case 'T': {
                    const h = parseFloat($('tH')?.value) || 150;
                    const tw = parseFloat($('tTw')?.value) || 10;
                    const bf = parseFloat($('tBf')?.value) || 100;
                    const tf = parseFloat($('tTf')?.value) || 12;
                    return { type: 'T', h, tw, bf, tf, maxWidth: bf };
                }
                case 'L': {
                    const a = parseFloat($('lA')?.value) || 100;
                    const b = parseFloat($('lB')?.value) || 100;
                    const t = parseFloat($('lT')?.value) || 10;
                    return { type: 'L', a, b, t, h: a, maxWidth: b };
                }
            }
            return null;
        }
        
        function drawDimLine(x1, y1, x2, y2, value, vertical = false) {
            const midX = (x1 + x2) / 2;
            const midY = (y1 + y2) / 2;
            let svg = '';
            
            // Premium dimension line style
            const color = 'var(--warning)';  // Amber/gold color
            
            // Dimension line with arrows
            svg += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="1" stroke-dasharray="3,2"/>`;
            
            if (vertical) {
                // Arrow-style tick marks
                svg += `<path d="M${x1-3},${y1+5} L${x1},${y1} L${x1+3},${y1+5}" stroke="${color}" fill="none" stroke-width="1"/>`;
                svg += `<path d="M${x2-3},${y2-5} L${x2},${y2} L${x2+3},${y2-5}" stroke="${color}" fill="none" stroke-width="1"/>`;
                // Text with background
                svg += `<text x="${midX + 8}" y="${midY + 3}" fill="${color}" font-size="11" font-weight="500">${value}</text>`;
            } else {
                // Arrow-style tick marks
                svg += `<path d="M${x1+5},${y1-3} L${x1},${y1} L${x1+5},${y1+3}" stroke="${color}" fill="none" stroke-width="1"/>`;
                svg += `<path d="M${x2-5},${y2-3} L${x2},${y2} L${x2-5},${y2+3}" stroke="${color}" fill="none" stroke-width="1"/>`;
                // Text
                svg += `<text x="${midX}" y="${midY - 6}" fill="${color}" font-size="11" font-weight="500" text-anchor="middle">${value}</text>`;
            }
            
            return svg;
        }
        
        function drawHPProfile(data, cx, topY, scale, hasPlate) {
            const { h, t, c, r } = data;
            // h = total height (b in EN 10067)
            const bS = h * scale;
            const tS = t * scale;
            const cS = c * scale;
            const rS = r * scale;
            
            let svg = '';
            
            // EN 10067 exact geometry
            const leftEdge = cx - tS/2;
            const rightEdge = cx + tS/2;
            const profileBottom = topY + bS;
            
            // 30 degree from VERTICAL (EN 10067 standard)
            const slopeAngle = 30 * Math.PI / 180;
            const sinA = Math.sin(slopeAngle);
            const cosA = Math.cos(slopeAngle);
            
            // Bulb tip is at distance 'c' from web center
            const bulbTipX = cx + cS;
            
            // Upper radius center (outside the profile)
            const upperRadiusCenterX = rightEdge + rS * cosA;
            const upperRadiusCenterY = profileBottom - cS + rS * sinA;
            
            // Point where upper radius meets the 30° line (tangent point)
            const upperTangentX = rightEdge + rS * sinA;
            const upperTangentY = profileBottom - cS + rS * (1 - cosA);
            
            // Lower radius center
            const lowerRadiusCenterX = bulbTipX - rS;
            const lowerRadiusCenterY = profileBottom - rS;
            
            // Point where lower radius meets the 30° line (tangent point)
            const lowerTangentX = lowerRadiusCenterX + rS * sinA;
            const lowerTangentY = lowerRadiusCenterY - rS * cosA;
            
            // Small radius for bottom left corner
            const r2 = rS * 0.4;
            
            // Build the path - EN 10067 accurate bulb flat shape
            const pathD = `
                M ${leftEdge} ${topY}
                L ${leftEdge} ${profileBottom - r2}
                Q ${leftEdge} ${profileBottom} ${leftEdge + r2} ${profileBottom}
                L ${lowerRadiusCenterX} ${profileBottom}
                A ${rS} ${rS} 0 0 0 ${lowerTangentX} ${lowerTangentY}
                L ${upperTangentX} ${upperTangentY}
                A ${rS} ${rS} 0 0 1 ${rightEdge} ${upperRadiusCenterY - rS}
                L ${rightEdge} ${topY}
                Z
            `;
            
            svg += `<path d="${pathD}" fill="rgba(241,245,249,0.06)" stroke="#e2e8f0" stroke-width="2"/>`;
            
            return svg;
        }
        
        function drawFBProfile(data, cx, topY, scale, hasPlate) {
            const { h, t } = data;
            const hS = h * scale;
            const tS = t * scale;
            
            let svg = '';
            
            // Simple rectangle
            svg += `<rect x="${cx - tS/2}" y="${topY}" width="${tS}" height="${hS}" 
                fill="rgba(241,245,249,0.06)" stroke="#e2e8f0" stroke-width="2"/>`;
            
            return svg;
        }
        
        function drawTProfile(data, cx, topY, scale, hasPlate) {
            // h = web height (flange HARİÇ)
            // totalHeight = h + tf
            const { h, tw, bf, tf } = data;
            const totalHeight = h + tf;  // Total height
            const hS = h * scale;        // Web height scaled
            const twS = tw * scale;
            const bfS = bf * scale;
            const tfS = tf * scale;
            const totalHS = totalHeight * scale;
            
            let svg = '';
            
            // T profile for grillage (inverted T):
            // Plate at TOP, Web hangs down, Flange at BOTTOM
            //        │
            //        │        <- Web (h)
            //    ═══════════  <- Flange (tf)
            
            const pathD = `
                M ${cx - twS/2} ${topY}
                L ${cx - twS/2} ${topY + hS}
                L ${cx - bfS/2} ${topY + hS}
                L ${cx - bfS/2} ${topY + totalHS}
                L ${cx + bfS/2} ${topY + totalHS}
                L ${cx + bfS/2} ${topY + hS}
                L ${cx + twS/2} ${topY + hS}
                L ${cx + twS/2} ${topY}
                Z
            `;
            
            svg += `<path d="${pathD}" fill="rgba(241,245,249,0.06)" stroke="#e2e8f0" stroke-width="2"/>`;
            
            return svg;
        }
        
        function drawLProfile(data, cx, topY, scale, hasPlate) {
            const { a, b, t } = data;
            const aS = a * scale;
            const bS = b * scale;
            const tS = t * scale;
            
            let svg = '';
            
            // L profile: Vertical leg (a) goes UP, Horizontal leg (b) goes RIGHT at bottom
            // The corner is at bottom-left, plate attaches at horizontal leg bottom
            
            // Build L-shape path
            const pathD = `
                M ${cx - tS/2} ${topY}
                L ${cx - tS/2} ${topY + aS}
                L ${cx - tS/2 + bS} ${topY + aS}
                L ${cx - tS/2 + bS} ${topY + aS - tS}
                L ${cx + tS/2} ${topY + aS - tS}
                L ${cx + tS/2} ${topY}
                Z
            `;
            
            svg += `<path d="${pathD}" fill="rgba(241,245,249,0.06)" stroke="#e2e8f0" stroke-width="2"/>`;
            
            return svg;
        }
        
        function selectHPFromCatalog() {
            const select = $('hpCatalogSelect');
            if (!select) return;
            
            const profile = HP_CATALOG.find(hp => hp.name === select.value);
            if (profile) {
                $('hpB').value = profile.b;
                $('hpT').value = profile.t;
            }
        }
        
        function createProfile() {
            // ═══════════════════════════════════════════════════════════════════
            // PROFILE SECTION CALCULATOR
            // Kesit ozellikleri js/core/profiles.js icindeki ortak kutuphaneden gelir -
            // DXF katman adindan uretilen profillerle ayni sayilar. Burada yalnizca
            // formu okunur, plaka birlestirmesi yapilir ve SECTIONS'a yazilir.
            // Calisma birimi CM; FEM icin M'ye cevrilir.
            // HP icin centroidY TEPEDEN (katalog dx), digerleri icin TABANDAN olculur.
            // ═══════════════════════════════════════════════════════════════════

            let name, props;

            switch (currentProfileType) {
                case 'HP': {
                    const b = parseFloat($('hpB')?.value) || 200;  // mm
                    const t = parseFloat($('hpT')?.value) || 10;   // mm
                    name = `HP${b}x${t}`;
                    props = profileProperties('HP', { b: b, t: t });
                    break;
                }
                case 'FB': {
                    const h = parseFloat($('fbH')?.value) || 150;
                    const t = parseFloat($('fbT')?.value) || 12;
                    name = `FB${h}x${t}`;
                    props = profileProperties('FB', { h: h, t: t });
                    break;
                }
                case 'T': {
                    const h = parseFloat($('tH')?.value) || 100;    // web yuksekligi
                    const tw = parseFloat($('tTw')?.value) || 10;
                    const bf = parseFloat($('tBf')?.value) || 100;
                    const tf = parseFloat($('tTf')?.value) || 10;
                    name = `T${h}x${tw}/${bf}x${tf}`;
                    props = profileProperties('T', { h: h, tw: tw, bf: bf, tf: tf });
                    break;
                }
                case 'L': {
                    const a = parseFloat($('lA')?.value) || 100;
                    const b = parseFloat($('lB')?.value) || 100;
                    const t = parseFloat($('lT')?.value) || 10;
                    name = `L${a}x${b}x${t}`;
                    props = profileProperties('L', { a: a, b: b, t: t });
                    break;
                }
            }

            if (!props) {
                showToast('Unknown profile type', true);
                return;
            }

            // Kompozit hesabinin bekledigi eski alan adlari
            const profileData = {
                type: props.type,
                area: props.A,               // cm²
                webArea: props.Aweb,         // cm²
                centroidY: props.centroidY,  // cm
                Ixx: props.Iy,               // cm⁴
                Iyy: props.Iz,               // cm⁴
                height: props.height,        // cm
                webThick: props.tw           // cm
            };

            
            // Check if profile already exists
            if (SECTIONS[name]) {
                showToast(`Profile ${name} already exists!`, true);
                return;
            }
            
            // Check for attached plate
            const plateEnabled = $('plateEnabled')?.checked;
            const plateData = getEffectiveBreadth();  // This handles calcByRule logic
            const plateW = plateData.width;
            const plateT = plateData.thickness;
            
            if (plateEnabled && plateW > 0 && plateT > 0) {
                // ═══════════════════════════════════════════════════════════════
                // COMPOSITE SECTION (Plate + Profile)
                // Convention: Plate is at TOP, profile hangs below
                // Coordinate: Y=0 at plate TOP, positive downward
                // ═══════════════════════════════════════════════════════════════
                
                const plateWCm = plateW / 10;
                const plateTCm = plateT / 10;
                const plateArea = plateWCm * plateTCm;
                const totalArea = profileData.area + plateArea;
                
                // Plate centroid from plate TOP
                const plateCentroidY = plateTCm / 2;
                
                // Profile centroid from plate TOP
                // HP: centroidY is already from TOP (dx), so just add plate thickness
                // Others: centroidY is from BOTTOM, need to convert to from-TOP
                let profileCentroidY;
                if (profileData.type === 'HP') {
                    profileCentroidY = plateTCm + profileData.centroidY;
                } else {
                    profileCentroidY = plateTCm + (profileData.height - profileData.centroidY);
                }
                
                // Combined centroid from plate TOP
                const combinedCentroidY = (plateArea * plateCentroidY + profileData.area * profileCentroidY) / totalArea;
                
                // Total height
                const totalHeight = plateTCm + profileData.height;
                
                // Combined Ixx using parallel axis theorem
                const d1 = plateCentroidY - combinedCentroidY;
                const d2 = profileCentroidY - combinedCentroidY;
                const plateIxx = plateWCm * Math.pow(plateTCm, 3) / 12;
                const combinedIxx = profileData.Ixx + profileData.area * d2 * d2 + plateIxx + plateArea * d1 * d1;
                
                // Combined Iyy (weak axis)
                const plateIyy = plateTCm * Math.pow(plateWCm, 3) / 12;
                const combinedIyy = profileData.Iyy + plateIyy;
                
                // Section moduli (Y=0 at plate top)
                const yTop = combinedCentroidY;                    // distance to plate top
                const yBot = totalHeight - combinedCentroidY;      // distance to profile bottom
                const WxxTop = combinedIxx / yTop;
                const WxxBot = combinedIxx / yBot;
                const Wyy = combinedIyy / (plateWCm / 2);
                
                const fullName = `${name}_${plateW}x${plateT}`;
                
                // Store in SECTIONS
                // Convert: cm² → m², cm⁴ → m⁴, cm³ → m³, cm → m
                // Govde kalinligi profil kutuphanesinden gelir; webArea/height turetmesi
                // T profilinde yanlisti (flans da yuksekligin icinde). Kompozit burulma
                // sabiti = profilin kendi J'si + plakanin katkisi.
                const webThickCm = props.tw || 0;
                const J_cm4 = props.J + openJ([[plateWCm, plateTCm]]);

                SECTIONS[fullName] = {
                    // SI units for FEM
                    A: totalArea * 1e-4,                    // m²
                    J: J_cm4 * 1e-8,                        // m⁴ (burulma)
                    tw: webThickCm / 100,                   // m
                    Aweb: (profileData.webArea || profileData.area * 0.6) * 1e-4, // m² (gövde kesme alanı, plaka hariç)
                    Iy: combinedIxx * 1e-8,                 // m⁴
                    Iz: combinedIyy * 1e-8,                 // m⁴
                    Wy: Math.min(WxxTop, WxxBot) * 1e-6,    // m³ (critical)
                    WyTop: WxxTop * 1e-6,
                    WyBot: WxxBot * 1e-6,
                    Wz: Wyy * 1e-6,
                    h: totalHeight / 100,                   // m
                    centroidY: combinedCentroidY / 100,     // m from plate top
                    
                    // Display units (cm)
                    A_cm2: totalArea,
                    Iy_cm4: combinedIxx,
                    Iz_cm4: combinedIyy,
                    Wy_cm3: Math.min(WxxTop, WxxBot),
                    WyTop_cm3: WxxTop,
                    WyBot_cm3: WxxBot,
                    Wz_cm3: Wyy,
                    J_cm4: J_cm4,
                    
                    // Metadata
                    profileName: name,
                    plateWidth: plateW,
                    plateThick: plateT,
                    isComposite: true,
                    type: currentProfileType
                };
                
                updateProfilesTable();
                updateSectionDropdowns();
                showToast(`Profile ${fullName} created successfully!`);
                return;
            }
            
            // ═══════════════════════════════════════════════════════════════
            // PROFILE ONLY (No plate)
            // ═══════════════════════════════════════════════════════════════
            
            // Kesit modulleri ve burulma dogrudan ortak kutuphaneden gelir - eskiden
            // burada Wz, yuksekligin dortte birine bolunerek "yaklasik" hesaplaniyordu
            // ve T/L profillerinde iki kat hata veriyordu.
            SECTIONS[name] = Object.assign(profilePropertiesSI(props), {
                profileName: name,
                plateWidth: 0,
                plateThick: 0,
                isComposite: false,
                type: currentProfileType
            });
            
            updateProfilesTable();
            updateSectionDropdowns();
            showToast(`Profile ${name} created successfully!`);
            // Kosebentte asal eksenler geometrik eksenlerle cakismaz; sessiz gecmeyelim.
            if (props.note) showToast(name + ': ' + props.note, 'warning');
        }
        
        function updateProfilesTable() {
            const tbody = $('createdProfilesTable');
            if (!tbody) return;
            
            const profiles = Object.keys(SECTIONS);
            if (profiles.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" style="color:var(--text-3); text-align:center;">No profiles created</td></tr>';
                setText('profilesCount', '0');
                return;
            }
            
            setText('profilesCount', profiles.length.toString());
            
            tbody.innerHTML = profiles.map(name => {
                const sec = SECTIONS[name];
                // Use cm values if available, otherwise convert from SI
                const A_cm2 = sec.A_cm2 ?? (sec.A * 1e4);
                const Iy_cm4 = sec.Iy_cm4 ?? (sec.Iy * 1e8);
                const Wy_cm3 = sec.Wy_cm3 ?? (sec.Wy * 1e6);
                return `<tr>
                    <td style="color:var(--accent-info);">${name}</td>
                    <td>${A_cm2.toFixed(2)}</td>
                    <td>${Iy_cm4.toFixed(1)}</td>
                    <td>${Wy_cm3.toFixed(1)}</td>
                    <td><button onclick="deleteProfile('${name}')" style="background:var(--danger); border:none; color:white; padding:2px 8px; border-radius:var(--r-ctl); cursor:pointer; font-size:var(--fs-xs);"><span class="icon"><svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></span></button></td>
                </tr>`;
            }).join('');
        }
        
        function deleteProfile(name) {
            // Check if profile is in use
            const inUse = Object.values(model.elements).some(e => e.section === name);
            if (inUse) {
                showToast(`Cannot delete ${name} - it's being used by beams!`, true);
                return;
            }
            
            delete SECTIONS[name];
            updateProfilesTable();
            updateSectionDropdowns();
            showToast(`Profile ${name} deleted`);
        }
        
        function updateMaterialDisplay() {
            const grade = $('steelGrade')?.value || 'A';
            const mat = MATERIALS[grade];
            if (!mat) return;

            const fy = mat.yield / 1e6;                 // MPa
            setText('dispE', '210 000');
            setText('dispSigmaY', fy.toFixed(0));
            setText('steelGradeEcho', grade + '  (σy = ' + fy.toFixed(0) + ' MPa)');

            // The stress limits follow the grade. Leaving them on a stale 355 while the
            // user picks Grade A is how an overstressed member gets reported as safe.
            const sigmaEl = $('sigmaLimit'), tauEl = $('tauLimit');
            if (sigmaEl) sigmaEl.value = fy.toFixed(0);
            if (tauEl) tauEl.value = (fy / Math.sqrt(3)).toFixed(0);   // von Mises kayma siniri
        }
        
        function updateSectionDropdowns() {
            const profiles = Object.keys(SECTIONS);
            const optionsHtml = profiles.length > 0 
                ? profiles.map(p => `<option value="${p}">${p}</option>`).join('')
                : '<option value="">No profiles - create in General tab</option>';
            
            // Update all section dropdowns
            const dropdowns = [
                'addBeamSection',
                'infoEditSection',
                'infoMultiSection',
                'editProfile',
                'transBeam',
                'longBeam'
            ];
            
            dropdowns.forEach(id => {
                const select = $(id);
                if (select) {
                    const currentValue = select.value;
                    select.innerHTML = optionsHtml;
                    // Try to restore previous selection
                    if (profiles.includes(currentValue)) {
                        select.value = currentValue;
                    }
                }
            });
            
            // Update Sections table in Model tab
            updateSectionTable();
        }
        
        function updateSectionTable() {
            const tbody = $('sectionTable');
            if (!tbody) return;
            
            const profiles = Object.keys(SECTIONS);
            
            if (profiles.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" style="color:var(--text-3); text-align:center; font-size:var(--fs-xs);">No sections - create in General tab or import DXF</td></tr>';
                setText('sectionsCount', '0');
                return;
            }
            
            setText('sectionsCount', profiles.length.toString());
            
            tbody.innerHTML = profiles.map(name => {
                const sec = SECTIONS[name];
                const A = (sec.A * 1e4).toFixed(1);      // m² to cm²
                const Iy = (sec.Iy * 1e8).toFixed(0);   // m⁴ to cm⁴
                const Wy = sec.Wy ? (sec.Wy * 1e6).toFixed(1) : '-';   // m³ to cm³
                const Iz = sec.Iz ? (sec.Iz * 1e8).toFixed(1) : '-';
                const Wz = sec.Wz ? (sec.Wz * 1e6).toFixed(1) : '-';
                return `<tr>
                    <td style="color:var(--accent-info); font-weight:500;">${name}</td>
                    <td>${A}</td>
                    <td style="color:var(--success);">${Iy}</td>
                    <td style="color:var(--success);">${Wy}</td>
                    <td style="color:var(--warning);">${Iz}</td>
                    <td style="color:var(--warning);">${Wz}</td>
                </tr>`;
            }).join('');
        }
        
        function populateHPCatalog() {
            const select = $('hpCatalogSelect');
            if (!select) return;
            
            HP_CATALOG.forEach(hp => {
                const option = document.createElement('option');
                option.value = hp.name;
                option.textContent = `${hp.name} (A=${hp.A} cm²)`;
                select.appendChild(option);
            });
        }

        // Profil panelindeki ilk gercek etkilesim onizlemeyi acar. Tek
        // dinleyici: her girdiye ayri kanca takmak kolayca eksik kalirdi.
        (function profilPaneliniIzle() {
            function kur() {
                const alan = document.getElementById('profilePreviewArea');
                const kap = alan && alan.parentElement;
                // Test kosumundaki DOM taklidinde parentElement tam bir DOM
                // nesnesi degil; korumasiz birakinca dosya hic yuklenmiyor
                // ve icindeki kod testsiz kaliyordu.
                if (!kap || typeof kap.addEventListener !== 'function') return;
                ['change', 'input'].forEach(tur =>
                    kap.addEventListener(tur, e => {
                        if (e.target && /^(INPUT|SELECT)$/.test(e.target.tagName)) profilSecimiBasladi();
                    }, true));
                updateProfilePreview();   // bos durumu bir kez ciz
            }
            if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', kur);
            else kur();
        })();
