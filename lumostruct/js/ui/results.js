        // ============== DISPLAY RESULTS ==============
        function displayResults() {
            const noResults = document.getElementById('noResults');
            const resultsPanel = document.getElementById('resultsPanel');
            const noResultsMsg = document.getElementById('noResultsMsg');
            
            if (noResults) noResults.style.display = 'none';
            if (noResultsMsg) noResultsMsg.style.display = 'none';
            if (resultsPanel) resultsPanel.style.display = 'block';
            
            // Enable and highlight deformed button
            const btnDeformed = document.getElementById('btnDeformed');
            if (btnDeformed) {
                btnDeformed.style.opacity = '1';
                btnDeformed.title = 'Show deformed shape';
            }
            
            const sigmaLimit = parseFloat(document.getElementById('sigmaLimit').value);
            
            // Max values (old right panel - hidden but for compatibility)
            const setIfExists = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
            
            setIfExists('maxDeflection', (results.maxDeflection * 1000).toFixed(2));
            setIfExists('maxStress', results.maxSigma.toFixed(1));
            setIfExists('maxShear', results.maxTau.toFixed(1));
            setIfExists('maxVonMises', results.maxVonMises.toFixed(1));
            
            const utilization = (results.maxVonMises / sigmaLimit * 100);
            setIfExists('utilization', utilization.toFixed(1));
            
            // Card colors (old)
            const utilizationCard = document.getElementById('utilizationCard');
            if (utilizationCard) {
                utilizationCard.className = 'result-card';
                if (utilization > 100) utilizationCard.classList.add('danger');
                else if (utilization > 80) utilizationCard.classList.add('warning');
                else utilizationCard.classList.add('success');
            }
            
            // Update scale (old)
            setIfExists('scaleMid', (sigmaLimit / 2).toFixed(0));
            setIfExists('scaleMax', sigmaLimit + ' MPa');
            
            // Displacement table (old)
            const dispTable = document.getElementById('dispTable');
            if (dispTable) {
                dispTable.innerHTML = '';
                Object.entries(results.displacements).forEach(([nodeId, disp]) => {
                    dispTable.innerHTML += `<tr>
                        <td>${nodeId}</td>
                        <td>${(disp.Uz * 1000).toFixed(2)}</td>
                        <td>${(disp.Rx * 180 / Math.PI).toFixed(3)}</td>
                        <td>${(disp.Ry * 180 / Math.PI).toFixed(3)}</td>
                    </tr>`;
                });
            }
            
            // Stress table (old)
            const stressTable = document.getElementById('stressTable');
            if (stressTable) {
                stressTable.innerHTML = '';
                Object.entries(results.elementResults).forEach(([elemId, res]) => {
                    const color = res.vonMises > sigmaLimit ? 'color:var(--danger);font-weight:600;' : '';
                    stressTable.innerHTML += `<tr style="${color}">
                        <td>${elemId}</td>
                        <td>${res.sigma.toFixed(1)}</td>
                        <td>${res.tau.toFixed(1)}</td>
                        <td>${res.vonMises.toFixed(1)}</td>
                    </tr>`;
                });
            }
            
            // ===== NEW LEFT PANEL RESULTS TAB =====
            const resultsContent = document.getElementById('resultsContent');
            if (noResultsMsg) noResultsMsg.style.display = 'none';
            if (resultsContent) resultsContent.style.display = 'block';
            
            // Update left panel values
            setIfExists('maxDeflectionLeft', (results.maxDeflection * 1000).toFixed(2));
            setIfExists('maxStressLeft', results.maxVonMises.toFixed(1));
            setIfExists('utilizationLeft', utilization.toFixed(1));
            setIfExists('scaleMidLeft', (sigmaLimit / 2).toFixed(0));
            setIfExists('scaleMaxLeft', sigmaLimit + ' MPa');
            
            // Utilization card color (left)
            // Renk artik kartin kendisinde degil, SAYIDA. Kart zemini boyamak yerine
            // rakami boyamak: ekranda tek bir renkli sayi olur ve gozden kacmaz.
            const utilDeger = document.getElementById('utilizationLeft');
            if (utilDeger) {
                utilDeger.style.color = utilization > 100 ? 'var(--danger)'
                                      : utilization > 80 ? 'var(--warning)'
                                      : 'var(--text)';
            }
            
            // Max Moment and Shear
            setIfExists('maxMomentLeft', Math.abs(results.maxMoment || 0).toFixed(2));
            setIfExists('maxShearLeft', Math.abs(results.maxShear || 0).toFixed(2));
            
            // Reactions table
            const reactionsTable = document.getElementById('reactionsTable');
            if (reactionsTable && results.reactions) {
                reactionsTable.innerHTML = '';
                Object.entries(results.reactions).forEach(([nodeId, r]) => {
                    // Gorunurluk kontrolu TUM bilesenlere bakar. Eskiden sadece
                    // Fz/Mx/My'ye bakiyordu: yalnizca yatay ya da Mz tepkisi olan
                    // bir mesnet tablodan tamamen dusuyordu.
                    const bilesenler = [r.Fx, r.Fy, r.Fz, r.Mx, r.My, r.Mz];
                    if (bilesenler.some(v => v)) {
                        reactionsTable.innerHTML += `<tr>
                            <td>${nodeId}</td>
                            <td>${r.Fz.toFixed(2)}</td>
                            <td>${r.Mx.toFixed(3)}</td>
                            <td>${r.My.toFixed(3)}</td>
                            <td>${(r.Mz || 0).toFixed(3)}</td>
                        </tr>`;
                    }
                });
            }
            
            // Equilibrium - the load that went in against the load the supports gave back.
            const eqStatus = document.getElementById('equilibriumStatus');
            const eqDetail = document.getElementById('equilibriumDetail');
            const eqCard = document.getElementById('equilibriumCard');
            if (eqStatus && eqCard && results.equilibrium) {
                const eq = results.equilibrium;
                if (eq.ok) {
                    eqStatus.innerHTML = '<span style="color:var(--success);"><span class="icon"><svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg></span> Balanced</span>';
                    eqCard.className = 'result-card success';
                } else {
                    eqStatus.innerHTML = '<span style="color:var(--danger);"><span class="icon"><svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></span> OFF BY ' + Math.abs(eq.error * 100).toFixed(2) + '%</span>';
                    eqCard.className = 'result-card danger';
                }
                eqDetail.textContent = 'Applied ' + eq.appliedFz.toFixed(2) +
                    ' kN, reactions ' + eq.reactionFz.toFixed(2) + ' kN';
            }

            // KESIT levha narinligi kontrolu (hw/tw, bf/tf). Eleman/kolon burkulmasi
            // DEGIL: eksenel kuvvet, burkulma boyu ve kritik yuk hesaba girmiyor.
            const bucklingStatus = document.getElementById('bucklingStatus');
            const bucklingDetail = document.getElementById('bucklingDetail');
            const bucklingCard = document.getElementById('bucklingCard');
            
            if (bucklingStatus && bucklingCard) {
                let bucklingOK = true;
                let bucklingMsg = '';
                let checked = 0, unchecked = 0;
                const grade = document.getElementById('steelGrade')?.value || 'AH36';
                // MATERIALS stores yield in Pa already, under 'yield' - reading '.fy' here
                // always came back undefined and quietly pinned every grade to 355.
                const ReH = MATERIALS[grade]?.yield || 355e6; // Pa
                const sqrtRatio = Math.sqrt(ReH / 235e6);

                // Check each element
                Object.values(model.elements).forEach(elem => {
                    const sec = SECTIONS[elem.section];
                    if (!sec) { unchecked++; return; }

                    // Get profile dimensions
                    const sectionName = elem.section.split('_')[0];
                    const tMatch = sectionName.match(/T(\d+)[Xx](\d+)[\/\+](\d+)[Xx](\d+)/);

                    if (!tMatch) {
                        // Not a T-profile name. Fall back to the stored geometry so HP, FB and
                        // L profiles get at least the web check instead of silently passing.
                        if (sec.h > 0 && sec.tw > 0) {
                            checked++;
                            const webLimit = 100 / sqrtRatio;
                            const webRatio = sec.h / sec.tw;
                            if (webRatio > webLimit) {
                                bucklingOK = false;
                                bucklingMsg += `Elem ${elem.id}: hw/tw=${webRatio.toFixed(0)} > ${webLimit.toFixed(0)}\n`;
                            }
                        } else {
                            unchecked++;
                        }
                        return;
                    }

                    if (tMatch) {
                        checked++;
                        const hw = parseInt(tMatch[1]);
                        const tw = parseInt(tMatch[2]);
                        const bf = parseInt(tMatch[3]);
                        const tf = parseInt(tMatch[4]);
                        
                        // Web slenderness: hw/tw ≤ 100/√(ReH/235)
                        const webLimit = 100 / sqrtRatio;
                        const webRatio = hw / tw;
                        
                        if (webRatio > webLimit) {
                            bucklingOK = false;
                            bucklingMsg += `Elem ${elem.id}: hw/tw=${webRatio.toFixed(0)} > ${webLimit.toFixed(0)}\n`;
                        }
                        
                        // Flange slenderness: bf_out/tf ≤ 12/√(ReH/235)
                        const flangeLimit = 12 / sqrtRatio;
                        const bfOut = (bf - tw) / 2;
                        const flangeRatio = bfOut / tf;
                        
                        if (flangeRatio > flangeLimit) {
                            bucklingOK = false;
                            bucklingMsg += `Elem ${elem.id}: bf_out/tf=${flangeRatio.toFixed(1)} > ${flangeLimit.toFixed(1)}\n`;
                        }
                    }
                });
                
                if (checked === 0) {
                    // Nothing was actually verified. Saying PASS here is worse than saying
                    // nothing - it is a green light nobody earned.
                    bucklingStatus.innerHTML = '<span style="color:var(--warning);"><span class="icon"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg></span> Not checked</span>';
                    bucklingDetail.textContent = unchecked
                        ? unchecked + ' element(s) have no usable web geometry'
                        : 'No elements to check';
                    bucklingCard.className = 'result-card warning';
                } else if (bucklingOK) {
                    bucklingStatus.innerHTML = '<span style="color:var(--success);"><span class="icon"><svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg></span> Pass</span>';
                    bucklingDetail.textContent = unchecked
                        ? checked + ' checked OK, ' + unchecked + ' skipped (no web geometry)'
                        : 'hw/tw and bf/tf OK on ' + checked + ' element(s). Member buckling is NOT checked.';
                    bucklingCard.className = unchecked ? 'result-card warning' : 'result-card success';
                } else {
                    bucklingStatus.innerHTML = '<span style="color:var(--danger);"><span class="icon"><svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></span> FAIL</span>';
                    bucklingDetail.textContent = bucklingMsg.trim();
                    bucklingCard.className = 'result-card danger';
                }
            }
            
            // Displacement table (left) - Top 10
            const dispTableLeft = document.getElementById('dispTableLeft');
            if (dispTableLeft) {
                const sorted = Object.entries(results.displacements)
                    .sort((a, b) => Math.abs(b[1].Uz) - Math.abs(a[1].Uz))
                    .slice(0, 10);
                dispTableLeft.innerHTML = sorted.map(([nodeId, disp]) => 
                    `<tr><td>${nodeId}</td><td>${(disp.Uz * 1000).toFixed(2)}</td></tr>`
                ).join('');
            }
            
            // Switch to Results tab
            switchMainTab('results');
            
            // Update entity info if something is selected (to show results)
            updateEntityInfoPanel();
        }
        
        // ============== RESULTS WARNING & BOTTOM PANEL ==============
        function updateResultsWarning() {
            const warning = document.getElementById('resultsWarning');
            if (warning) {
                warning.style.display = (results && modelChangedAfterSolve) ? 'block' : 'none';
            }
        }
        
        let resultsBottomPanelMinimized = false;
        
        
        // Kiris tablosunun satirlari. Alt paneldeki tablolar artik
        // js/ui/tables.js'te uretiliyor; bu fonksiyon raporun (js/ui/report.js)
        // kullandigi ozet satirlari icin duruyor. Tablo ve CSV ayni yerden beslenir - eskiden ayni
        // ifadeler iki yerde tekrarliyordu ve ikisi birlikte yanlisti: "M_max" sutunu
        // sol uc momentini (M1) gosteriyordu, gercek Mmax'i degil.
        function beamTableRows() {
            if (!results || !results.elementResults) return [];
            const sigmaLimit = parseFloat(document.getElementById('sigmaLimit')?.value) || 355;
            const rows = [];

            Object.entries(model.elements).forEach(([elemId, elem]) => {
                const res = results.elementResults[elemId];
                if (!res) return;

                const n1 = model.nodes[elem.n1];
                const n2 = model.nodes[elem.n2];
                if (!n1 || !n2) return;

                // gercek 3B uzunluk - egik elemanlarda 2B izdusum yaniltiyordu
                const length = Math.sqrt(Math.pow(n2.x - n1.x, 2) + Math.pow(n2.y - n1.y, 2) +
                                         Math.pow((n2.z || 0) - (n1.z || 0), 2));

                // asimetrik kesitte iki lif farklidir; cozucu ikisini de veriyor
                const top = (res.sigmaTop !== undefined) ? res.sigmaTop : (res.sigma || 0);
                const bot = (res.sigmaBot !== undefined) ? res.sigmaBot : -(res.sigma || 0);

                rows.push({
                    id: parseInt(elemId),
                    section: elem.section || '-',
                    length: length,
                    sigmaMax: Math.max(top, bot),
                    sigmaMin: Math.min(top, bot),
                    tauMax: res.tau || 0,
                    vmMax: res.vonMises || 0,
                    mMax: Math.abs(res.Mmax !== undefined ? res.Mmax : (res.M1 || 0)),
                    vMax: Math.abs(res.V || 0),
                    util: (res.vonMises / sigmaLimit * 100)
                });
            });
            return rows;
        }

        
        
        function selectBeamFromTable(elemId) {
            selectedNodes.clear();
            selectedElements.clear();
            selectedElements.add(elemId);
            updateEntityInfoPanel();
            if (currentViewMode === '3d') {
                update3DScene();
            } else {
                draw();
            }
            updateResultsBottomPanel();
        }
        
        function selectNodeFromTable(nodeId) {
            selectedNodes.clear();
            selectedElements.clear();
            selectedNodes.add(nodeId);
            updateEntityInfoPanel();
            if (currentViewMode === '3d') {
                update3DScene();
            } else {
                draw();
            }
            updateResultsBottomPanel();
        }
        
        
        
        // Sonuc panelinin kapladigi yeri kanvasa bildirir. Tek yerden yonetilir ki
        // panel acilinca/kapaninca/suruklenince kanvas ve 3B render birlikte gunlensin.
        function syncResultsPanelSpace() {
            const panel = document.getElementById('resultsBottomPanel');
            const visible = panel && panel.style.display !== 'none';
            const h = visible ? panel.offsetHeight : 0;
            document.documentElement.style.setProperty('--results-h', h + 'px');

            // Kanvas ve Three.js kendi olculerini pencere resize olayindan alir
            if (typeof window !== 'undefined' && window.dispatchEvent) {
                window.dispatchEvent(new Event('resize'));
            }
        }

        function toggleResultsBottomPanel() {
            const panel = document.getElementById('resultsBottomPanel');
            // Dugme KIMLIGINDEN alinir. `event.target` ile aliniyordu ve dugmenin tek
            // icerigi bir SVG oldugu icin, ok cizgisinin tam uzerine tiklandiginda
            // hedef <polyline> oluyordu: ikon dugmeye degil polyline'in icine
            // yaziliyor, yani gorunurde kayboluyordu.
            const btn = document.getElementById('resultsPanelToggle');
            if (!panel || !btn) return;
            
            if (resultsBottomPanelMinimized) {
                panel.style.height = '250px';
                btn.innerHTML = '<span class="icon"><svg viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg></span>';
                resultsBottomPanelMinimized = false;
                syncResultsPanelSpace();
            } else {
                panel.style.height = '40px';
                btn.innerHTML = '<span class="icon"><svg viewBox="0 0 24 24"><polyline points="18 15 12 9 6 15"/></svg></span>';
                resultsBottomPanelMinimized = true;
                syncResultsPanelSpace();
            }
        }
        
        
        // ============== RESULTS PANEL RESIZE ==============
        (function initResultsResize() {
            let isResizing = false;
            let startY = 0;
            let startHeight = 0;
            
            document.addEventListener('mousedown', function(e) {
                if (e.target.closest('#resultsResizeHandle')) {
                    isResizing = true;
                    startY = e.clientY;
                    startHeight = document.getElementById('resultsBottomPanel').offsetHeight;
                    document.body.style.cursor = 'ns-resize';
                    document.body.style.userSelect = 'none';
                    e.preventDefault();
                }
            });
            
            document.addEventListener('mousemove', function(e) {
                if (!isResizing) return;
                
                const delta = startY - e.clientY;
                const newHeight = Math.max(100, Math.min(600, startHeight + delta));
                document.getElementById('resultsBottomPanel').style.height = newHeight + 'px';
                syncResultsPanelSpace();
            });
            
            document.addEventListener('mouseup', function() {
                if (isResizing) {
                    isResizing = false;
                    document.body.style.cursor = '';
                    document.body.style.userSelect = '';
                }
            });
        })();
        
        // ============== LEFT PANEL RESIZE ==============
        (function initLeftPanelResize() {
            let isResizing = false;
            let startX = 0;
            let startWidth = 0;
            
            document.addEventListener('mousedown', function(e) {
                if (e.target.closest('#leftPanelResizeHandle')) {
                    isResizing = true;
                    startX = e.clientX;
                    startWidth = document.getElementById('leftPanel').offsetWidth;
                    document.body.style.cursor = 'ew-resize';
                    document.body.style.userSelect = 'none';
                    e.preventDefault();
                }
            });
            
            document.addEventListener('mousemove', function(e) {
                if (!isResizing) return;
                
                const delta = e.clientX - startX;
                const newWidth = Math.max(200, Math.min(450, startWidth + delta));
                document.getElementById('leftPanel').style.width = newWidth + 'px';
                
                // Update results bottom panel left position
                const bottomPanel = document.getElementById('resultsBottomPanel');
                if (bottomPanel) {
                    bottomPanel.style.left = (newWidth + 6) + 'px';
                }
                
                // Kanvas, 3B render ve alt panel tek yerden guncellenir (layout.js).
                if (typeof syncPanelLayout === 'function') syncPanelLayout();
            });
            
            document.addEventListener('mouseup', function() {
                if (isResizing) {
                    isResizing = false;
                    document.body.style.cursor = '';
                    document.body.style.userSelect = '';
                    
                    // Final renderer update
                    if (typeof threeRenderer !== 'undefined' && threeRenderer) {
                        const container = document.getElementById('threeContainer');
                        if (container) {
                            kamerayiYenidenOlcekle(container.clientWidth, container.clientHeight);
                        }
                    }
                }
            });
        })();
        
        // Right Panel Resize
        (function initRightPanelResize() {
            let isResizing = false;
            let startX = 0;
            let startWidth = 0;
            
            document.addEventListener('mousedown', function(e) {
                if (e.target.closest('#rightPanelResizeHandle')) {
                    isResizing = true;
                    startX = e.clientX;
                    startWidth = document.getElementById('rightPanel').offsetWidth;
                    document.body.style.cursor = 'ew-resize';
                    document.body.style.userSelect = 'none';
                    e.preventDefault();
                }
            });
            
            document.addEventListener('mousemove', function(e) {
                if (!isResizing) return;
                
                const delta = startX - e.clientX;  // Reversed for right panel
                const newWidth = Math.max(200, Math.min(450, startWidth + delta));
                document.getElementById('rightPanel').style.width = newWidth + 'px';
                
                // Kanvas, 3B render ve alt panel tek yerden guncellenir (layout.js).
                if (typeof syncPanelLayout === 'function') syncPanelLayout();
            });
            
            document.addEventListener('mouseup', function() {
                if (isResizing) {
                    isResizing = false;
                    document.body.style.cursor = '';
                    document.body.style.userSelect = '';
                    
                    // Final renderer update
                    if (typeof threeRenderer !== 'undefined' && threeRenderer) {
                        const container = document.getElementById('threeContainer');
                        if (container) {
                            kamerayiYenidenOlcekle(container.clientWidth, container.clientHeight);
                        }
                    }
                }
            });
        })();
        
