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
            
            // GORUS KUTUSU ICERIKTEN TURER.
            //
            // Kutu eskiden sabit 600x400 idi ve cizim y=50'den basliyordu.
            // Olculdu - HP60x4 + 500x12 plaka: cizim 500x72, kutunun 278
            // birimi BOS kaliyordu. Genis-yassi her kesitte boyle olur, cunku
            // kutunun orani icerige hic bakmiyordu.
            //
            // Simdi genislik sabit, YUKSEKLIK icerikten geliyor: dar kesitte
            // kutu uzar, yassi kesitte kisalir, ikisinde de bosluk kalmaz.
            const cx = 300;
            const KENAR = 55;                 // olcu cizgileri icin ust/alt pay
            const plateEnabled = plateW > 0 && plateT > 0;

            let totalHeight = profileData.h;
            let totalWidth = profileData.maxWidth || 50;

            if (plateEnabled) {
                totalHeight += plateT;
                totalWidth = Math.max(totalWidth, plateW);
            }

            // Genislige gore olcekle. Cok kucuk kesitler asiri buyumesin diye
            // bir tavan var ama eski 2.5 fazla dusuktu: HP60x4 gibi kucuk bir
            // profil, yanindaki 500'luk plakanin altinda gorunmez oluyordu.
            const scale = Math.min(500 / totalWidth, 8);
            const viewHeight = Math.round(totalHeight * scale + 2 * KENAR);
            targetSvg.setAttribute('viewBox', '0 0 600 ' + viewHeight);

            let svgContent = '';
            let topY = KENAR;
            kucukOlculer = [];
            
            // Plate
            if (plateEnabled) {
                const plateWS = plateW * scale;
                const plateTS = plateT * scale;
                // Renkler kucuk onizlemeyle AYNI: mavi cizgi, hafif dolgu. Buyutulmus hal
                // beyaz cizip olculeri som sari yapinca butun resim sariya donuyordu.
                svgContent += `<rect x="${cx - plateWS/2}" y="${topY}" width="${plateWS}" height="${plateTS}" fill="rgba(56,189,248,0.12)" stroke="var(--primary)" stroke-width="2.5"/>`;
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

            // Cizilemeyen kucuk olculer resmin altinda tek satirda. Bilgi
            // kaybolmuyor, ust uste binme de olmuyor.
            if (kucukOlculer.length) {
                const benzersiz = [...new Set(kucukOlculer)];
                const altY = KENAR + totalHeight * scale + 34;
                targetSvg.innerHTML +=
                    '<text x="' + cx + '" y="' + altY + '" text-anchor="middle" ' +
                    'fill="var(--warning)" font-size="13" font-weight="600">' +
                    benzersiz.join('  ·  ') + '</text>';
            }

            // Kutuyu cizimin GERCEK sinirindan kur.
            //
            // Yukaridaki KENAR payi bir tahmin: olcu yazisinin yuksekligi,
            // yaziyla cizgi arasindaki bosluk, dondurme notu - hicbiri paya
            // girmiyor. Olculdu: cizim alt kenardan 1 birim tasiyordu.
            // getBBox cizildikten sonra gercek siniri veriyor; tahmin etmek
            // yerine olcmek her kesit turunde bosluksuz ve tasmasiz oturuyor.
            try {
                const bb = targetSvg.getBBox();
                if (bb && bb.width > 0 && bb.height > 0) {
                    const pay = 12;
                    targetSvg.setAttribute('viewBox',
                        Math.round(bb.x - pay) + ' ' + Math.round(bb.y - pay) + ' ' +
                        Math.round(bb.width + 2 * pay) + ' ' + Math.round(bb.height + 2 * pay));
                }
            } catch (e) {
                // getBBox yalnizca cizilmis bir SVG'de calisir (pencere kapaliysa
                // atar). O halde yukarida kurulan kutu zaten yeterli.
            }
        }
        
        // Cizilemeyecek kadar kisa olculer: cizim yerine alta yazi.
        // drawSectionDiagramLarge her cizimden once bosaltir.
        let kucukOlculer = [];

        function drawDimLineLarge(x1, y1, x2, y2, value, vertical = false) {
            const midX = (x1 + x2) / 2;
            const midY = (y1 + y2) / 2;

            // 26 birimin altinda ok uclari ve yazi sigmiyor: yazi komsusuyla
            // ic ice geciyor (HP60x4 + 500 plakada "4" ile "3" boyle
            // birbirine giriyordu). Kisa olcu CIZILMEZ, degeri toplanir.
            const boy = vertical ? Math.abs(y2 - y1) : Math.abs(x2 - x1);
            if (boy < 26) {
                kucukOlculer.push(value);
                return '';
            }

            let svg = '';
            
            svg += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="var(--warning)" stroke-width="1.5" stroke-dasharray="5,3"/>`;
            
            if (vertical) {
                svg += `<line x1="${x1-6}" y1="${y1}" x2="${x1+6}" y2="${y1}" stroke="var(--warning)" stroke-width="1.5"/>`;
                svg += `<line x1="${x2-6}" y1="${y2}" x2="${x2+6}" y2="${y2}" stroke="var(--warning)" stroke-width="1.5"/>`;
                svg += `<text x="${midX - 20}" y="${midY + 5}" fill="var(--warning)" font-size="13" font-weight="600" transform="rotate(-90 ${midX - 20} ${midY + 5})">${value}</text>`;
            } else {
                svg += `<line x1="${x1}" y1="${y1-6}" x2="${x1}" y2="${y1+6}" stroke="var(--warning)" stroke-width="1.5"/>`;
                svg += `<line x1="${x2}" y1="${y2-6}" x2="${x2}" y2="${y2+6}" stroke="var(--warning)" stroke-width="1.5"/>`;
                svg += `<text x="${midX}" y="${midY - 8}" fill="var(--warning)" font-size="13" font-weight="600" text-anchor="middle">${value}</text>`;
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
            
            let svg = `<path d="${pathD}" fill="none" stroke="var(--primary)" stroke-width="2.5"/>`;
            svg += drawDimLineLarge(bulbTipX + 40, topY, bulbTipX + 40, profileBottom, h, true);
            svg += drawDimLineLarge(leftEdge, profileBottom + 30, rightEdge, profileBottom + 30, t, false);
            svg += drawDimLineLarge(cx, profileBottom + 50, bulbTipX, profileBottom + 50, Math.round(c), false);
            
            return svg;
        }
        
        function drawFBProfileLarge(data, cx, topY, scale, hasPlate) {
            const { h, t } = data;
            const hS = h * scale;
            const tS = t * scale;
            
            let svg = `<rect x="${cx - tS/2}" y="${topY}" width="${tS}" height="${hS}" fill="none" stroke="var(--primary)" stroke-width="2.5"/>`;
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
            
            let svg = `<path d="${pathD}" fill="none" stroke="var(--primary)" stroke-width="2.5"/>`;
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
            
            let svg = `<path d="${pathD}" fill="none" stroke="var(--primary)" stroke-width="2.5"/>`;
            svg += drawDimLineLarge(cx - tS/2 - 40, topY, cx - tS/2 - 40, topY + aS, a, true);
            svg += drawDimLineLarge(cx - tS/2, topY + aS + 30, cx - tS/2 + bS, topY + aS + 30, b, false);
            
            return svg;
        }
        
        // ============== PROFILE PREVIEW SVG ==============
        // Onizleme HER ZAMAN formdaki olculeri cizer.
        //
        // Bir sure bos durdu: panel "Beam Profiles 0" derken yaninda cizili bir
        // profil olmasi "zaten bir profil var" gibi okunuyordu. Ama bos kutu da
        // olu duruyor ve formdaki b=200 t=10 degerlerinin neye benzedigini
        // gormek tam da bu kutunun isi.
        //
        // Iki kaygi da karsilaniyor: cizim var, ve profil henuz EKLENMEMISSE
        // kutunun kendisi bunu yaziyor. Boylece cizim bir varlik iddiasi
        // olmuyor.
        let profilSecildi = false;

        function profilSecimiBasladi() {
            if (profilSecildi) return;
            profilSecildi = true;
            updateProfilePreview();
        }

        // Kutuya "henuz eklenmedi" seridini basar/kaldirir.
        function onizlemeRozetiniTazele() {
            const alan = $('profilePreviewArea');
            if (!alan) return;
            let rozet = alan.querySelector('.preview-badge');
            const eklenmisSayi = (typeof SECTIONS !== 'undefined') ? Object.keys(SECTIONS).length : 0;
            if (!profilSecildi && eklenmisSayi === 0) {
                if (!rozet) {
                    rozet = document.createElement('span');
                    rozet.className = 'preview-badge';
                    alan.appendChild(rozet);
                }
                rozet.textContent = 'Preview - not added yet';
            } else if (rozet) {
                rozet.remove();
            }
        }

        function updateProfilePreview() {
            const svg = $('profilePreviewSVG');
            if (!svg) return;

            onizlemeRozetiniTazele();
            
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
            
            svg += `<path d="${pathD}" fill="rgba(56,189,248,0.12)" stroke="var(--primary)" stroke-width="2"/>`;
            
            return svg;
        }
        
        function drawFBProfile(data, cx, topY, scale, hasPlate) {
            const { h, t } = data;
            const hS = h * scale;
            const tS = t * scale;
            
            let svg = '';
            
            // Simple rectangle
            svg += `<rect x="${cx - tS/2}" y="${topY}" width="${tS}" height="${hS}" 
                fill="rgba(56,189,248,0.12)" stroke="var(--primary)" stroke-width="2"/>`;
            
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
            
            svg += `<path d="${pathD}" fill="rgba(56,189,248,0.12)" stroke="var(--primary)" stroke-width="2"/>`;
            
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
            
            svg += `<path d="${pathD}" fill="rgba(56,189,248,0.12)" stroke="var(--primary)" stroke-width="2"/>`;
            
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

            // Kompozit hesap artik profileProperties ciktisini DOGRUDAN aliyor
            // (plakaliKesitSI); arada alan adi ceviren bir kopya yok.

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
                
                // Kompozit kesit matematigi js/core/profiles.js icinde
                // (plakaliKesitSI): ayni hesap dogrulama testlerinde de
                // kullaniliyor, iki kopya tutmuyoruz.
                const fullName = `${name}_${plateW}x${plateT}`;
                const kompozit = plakaliKesitSI(props, plateW, plateT);
                if (!kompozit) {
                    showToast('Composite section could not be computed', true);
                    return;
                }

                SECTIONS[fullName] = Object.assign(kompozit, {
                    profileName: name,
                    plateWidth: plateW,
                    plateThick: plateT,
                    isComposite: true,
                    type: currentProfileType
                });

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
            // Modelde birden fazla sinif varsa bunu soyle: asagidaki gerilme
            // sinirlari MODEL GENELIDIR, secili sinifa gore dolar. Karisik bir
            // modelde "AH36 secili" yazip Grade A kirisleri ayni sinirla
            // olcmek, fazla gerilmis bir elemani guvenli gostermenin yoludur.
            const siniflar = (typeof kullanilanSiniflar === 'function') ? kullanilanSiniflar(grade) : [grade];
            const karisik = siniflar.length > 1;
            setText('steelGradeEcho', grade + '  (σy = ' + fy.toFixed(0) + ' MPa)' +
                (karisik ? '  -  modelde ' + siniflar.length + ' sinif var: ' + siniflar.join(', ') +
                           '  (asagidaki sinirlar model geneli)' : ''));

            // The stress limits follow the grade. Leaving them on a stale 355 while the
            // user picks Grade A is how an overstressed member gets reported as safe.
            const sigmaEl = $('sigmaLimit'), tauEl = $('tauLimit');
            if (sigmaEl) sigmaEl.value = fy.toFixed(0);
            if (tauEl) tauEl.value = (fy / Math.sqrt(3)).toFixed(0);   // von Mises kayma siniri
        }
        
        // Yeni kiris hangi kesidi alsin?
        //
        // Once acilir listedeki secim, sonra kutuphanedeki ilk profil. Ikisi de
        // yoksa null doner ve cagiran taraf kirisi KURMAZ.
        //
        // Burada bir zamanlar `|| 'HP200x10'` vardi: profil yokken kiris,
        // kutuphanede olmayan bir kesit adi tasiyordu. Sag panel adi
        // gosteriyor, ozellikler "-" cikiyor, sol panel "Sections 0" diyordu.
        // Uc yer uc ayri sey soyluyordu. Olmayan bir kesidi uydurmaktansa
        // durup soylemek dogru.
        function kesitSec() {
            const secici = document.getElementById('addBeamSection');
            const secim = secici && secici.value;
            if (secim && SECTIONS[secim]) return secim;
            const ilk = Object.keys(SECTIONS)[0];
            return ilk || null;
        }

        // Kiris kuran yollarin ortak uyarisi - tek cumle, tek yerde.
        function kesitYokUyar() {
            if (typeof showToast === 'function')
                showToast('Create a beam profile first (General tab)', true);
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
