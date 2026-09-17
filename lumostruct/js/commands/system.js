        // ============== AUTOCAD-STYLE COMMAND SYSTEM ==============
        
        // Command States
        const CMD = {
            NONE: 'none',
            COPY: 'copy',
            MOVE: 'move',
            ROTATE: 'rotate',
            MIRROR: 'mirror',
            SPLIT: 'split',
            EXTEND: 'extend',
            TRIM: 'trim',
            LINE: 'line',
            OFFSET: 'offset',
            JOIN: 'join',
            NODE_MOVE: 'node_move'
        };

        // ============== KOMUT SOZLUGU VE TAMAMLAMA ==============
        //
        // Komut adlari eskiden yalnizca startCommand icindeki switch'te
        // yaziliydi. Bu yuzden "L" ve "LINE" calisiyor ama "LI" / "LIN"
        // calismiyordu; hangi komutlarin oldugunu gormenin de bir yolu yoktu.
        // Sozluk hem eslestirmeyi hem de oneri listesini besler.
        //
        // YENI KOMUT EKLERKEN: startCommand'a case eklemek yetmez, buraya da
        // bir satir eklenmeli - yoksa komut tamamlamada gorunmez.
        const KOMUTLAR = [
            { ad: 'LINE',   kisa: ['L'],       aciklama: 'Draw connected beams' },
            { ad: 'COPY',   kisa: ['CO', 'C'], aciklama: 'Copy selected beams' },
            { ad: 'MOVE',   kisa: ['M'],       aciklama: 'Move selected beams' },
            { ad: 'STRETCH', kisa: ['ST'],     aciklama: 'Move selected nodes; connected beams stretch' },
            { ad: 'ROTATE', kisa: ['RO', 'R'], aciklama: 'Rotate about a centre' },
            { ad: 'MIRROR', kisa: ['MI'],      aciklama: 'Mirror about a line' },
            { ad: 'OFFSET', kisa: ['O'],       aciklama: 'Parallel copy at a distance' },
            { ad: 'SPLIT',  kisa: ['SP'],      aciklama: 'Split a beam at a point' },
            { ad: 'EXTEND', kisa: ['EX'],      aciklama: 'Extend a beam to a boundary' },
            { ad: 'TRIM',   kisa: ['TR'],      aciklama: 'Trim a beam at a boundary' },
            { ad: 'JOIN',   kisa: ['J'],       aciklama: 'Merge collinear beams' },
            { ad: 'PURGE',  kisa: ['PU'],      aciklama: 'Remove orphan nodes and duplicates' },
            { ad: 'PLANE',  kisa: ['PL'],      aciklama: 'New work plane at an offset' }
        ];

        // Yazilani bir komuta cevirir. Sirasiyla: tam ad, tam kisaltma, tek
        // basina kalan onek. "LI" yalnizca LINE ile basliyorsa LINE'dir.
        function komutCoz(girdi) {
            const t = String(girdi || '').trim().toUpperCase();
            if (!t) return null;

            const tam = KOMUTLAR.find(k => k.ad === t || k.kisa.includes(t));
            if (tam) return tam.ad;

            const onek = KOMUTLAR.filter(k => k.ad.startsWith(t));
            return onek.length === 1 ? onek[0].ad : null;
        }

        // Oneri listesi: yalnizca BASTAN eslesenler. Icinde gecenleri de
        // katmak "O" yazinca COPY/MOVE/ROTATE/MIRROR/JOIN'i sıralıyordu -
        // aranan komut listenin icinde kayboluyordu.
        function komutOner(girdi) {
            const t = String(girdi || '').trim().toUpperCase();
            if (!t) return [];
            return KOMUTLAR.filter(k =>
                k.ad.startsWith(t) || k.kisa.some(a => a.startsWith(t)));
        }

        // ---- Oneri kutusu ----
        let oneriListesi = [];
        let oneriSecili = -1;

        function oneriKutusu() {
            return document.getElementById('cmdAutocomplete');
        }

        function oneriGizle() {
            const kutu = oneriKutusu();
            if (kutu) kutu.style.display = 'none';
            oneriListesi = [];
            oneriSecili = -1;
        }

        function oneriTazele() {
            const kutu = oneriKutusu();
            const input = cmdElements.input;
            if (!kutu || !input) return;

            // Komut calisirken kutu koordinat girdisi icindir, oneri cikmaz.
            if (cmdState.active !== CMD.NONE) { oneriGizle(); return; }

            oneriListesi = komutOner(input.value);
            if (!oneriListesi.length) { oneriGizle(); return; }

            oneriSecili = 0;
            kutu.innerHTML = oneriListesi.map((k, i) =>
                '<div class="cmd-suggestion' + (i === 0 ? ' selected' : '') + '" data-i="' + i + '">' +
                '<span class="cmd-suggestion-name">' + k.ad + '</span>' +
                '<span class="cmd-suggestion-alias">' + k.kisa.join(', ') + '</span>' +
                '<span class="cmd-suggestion-desc">' + k.aciklama + '</span>' +
                '</div>').join('');

            // Kutu, girdi alaninin ustunde ve onunla ayni hizada acilir.
            kutu.style.left = input.offsetLeft + 'px';
            kutu.style.display = 'block';
        }

        function oneriGez(yon) {
            if (!oneriListesi.length) return;
            oneriSecili = (oneriSecili + yon + oneriListesi.length) % oneriListesi.length;
            const kutu = oneriKutusu();
            if (!kutu) return;
            [...kutu.children].forEach((e, i) => e.classList.toggle('selected', i === oneriSecili));
            const secili = kutu.children[oneriSecili];
            if (secili) secili.scrollIntoView({ block: 'nearest' });
        }

        // Secili oneriyi girdi alanina yazar. calistir=true ise komutu baslatir.
        function oneriUygula(calistir) {
            if (oneriSecili < 0 || !oneriListesi[oneriSecili]) return false;
            const ad = oneriListesi[oneriSecili].ad;
            oneriGizle();
            if (calistir) {
                if (cmdElements.input) cmdElements.input.value = '';
                startCommand(ad);
            } else if (cmdElements.input) {
                cmdElements.input.value = ad;
            }
            return true;
        }
        
        // Command Phases
        const PHASE = {
            SELECT: 'select',           // Select objects
            BASE_POINT: 'base_point',   // Select base point
            DESTINATION: 'destination', // Select destination / enter distance
            SECOND_POINT: 'second_point', // For mirror, rotate reference
            CONFIRM: 'confirm'          // Confirm action
        };
        
        // Command State
        let cmdState = {
            active: CMD.NONE,
            phase: PHASE.SELECT,
            basePoint: null,           // {x, y} in model coordinates
            basePointScreen: null,     // {x, y} in screen coordinates
            secondPoint: null,
            selectedBeamIds: [],
            selectedNodeIds: [],
            previewData: null,
            inputValue: '',
            orthoMode: false,
            snapMode: true,
            snapGrid: true,
            snapIntersection: true,
            snapPerpendicular: true,
            snapNearest: true,         // Snap to nearest point on beam
            snapPoints: [],            // Calculated snap points
            boundaryEdges: [],         // For extend/trim
            hoverBeam: null,           // For split mode
            hoverPoint: null,          // Point on hovered beam
            keepOriginal: true,        // For mirror
            linePoints: [],            // For LINE command
            lastCursorDir: null,       // Last cursor direction {x, y, z}
            eksenKilidi: null,         // 'X' | 'Y' | 'Z' | null - cizimde eksen kilidi
            orthoDir: { x: 1, y: 0 },  // Ortho direction
            offsetDist: 0.5,           // Default offset distance (500mm)
            offsetSide: 1,             // Offset side (1 or -1)
            selectedNode: null,        // For NODE_MOVE
            hoverNode: null,           // Hovered node
            dragNode: null,            // Node being dragged
            lastCommand: null          // Last used command for repeat
        };
        
        // UI Elements
        const cmdElements = {
            bar: null,
            status: null,
            message: null,
            input: null,
            hints: null,
            coords: null,
            ortho: null,
            snap: null,
            dynamicInput: null,
            dynInputValue: null,
            basePointMarker: null,
            directionLine: null,
            mirrorLine: null,
            splitPoint: null,
            tooltip: null
        };
        
        // Initialize command system after DOM ready
        function initCommandSystem() {
            cmdElements.bar = document.getElementById('commandBar');
            cmdElements.status = document.getElementById('cmdStatus');
            cmdElements.message = document.getElementById('cmdMessage');
            cmdElements.input = document.getElementById('cmdInput');
            cmdElements.hints = document.getElementById('cmdHints');
            cmdElements.coords = document.getElementById('cmdCoords');
            cmdElements.ortho = document.getElementById('cmdOrtho');
            cmdElements.snap = document.getElementById('cmdSnap');
            cmdElements.dynamicInput = document.getElementById('dynamicInput');
            cmdElements.dynInputValue = document.getElementById('dynInputValue');
            cmdElements.basePointMarker = document.getElementById('basePointMarker');
            cmdElements.directionLine = document.getElementById('directionLine');
            cmdElements.mirrorLine = document.getElementById('mirrorLinePreview');
            cmdElements.splitPoint = document.getElementById('splitPointIndicator');
            cmdElements.tooltip = document.getElementById('cmdTooltip');
            
            // Command input handler
            if (cmdElements.input) {
                cmdElements.input.addEventListener('keydown', handleCommandInput);

                // Yazdikca oneri listesi tazelenir.
                cmdElements.input.addEventListener('input', oneriTazele);
                cmdElements.input.addEventListener('focus', oneriTazele);
                // blur'da hemen gizlemek, listeye yapilan tiklamayi yutuyor.
                cmdElements.input.addEventListener('blur', () => setTimeout(oneriGizle, 150));

                const oneriKutu = oneriKutusu();
                if (oneriKutu) {
                    oneriKutu.addEventListener('mousedown', e => {
                        const satir = e.target.closest('.cmd-suggestion');
                        if (!satir) return;
                        e.preventDefault();               // girdi odagi kaybolmasin
                        oneriSecili = Number(satir.dataset.i);
                        oneriUygula(true);
                    });
                    oneriKutu.addEventListener('mousemove', e => {
                        const satir = e.target.closest('.cmd-suggestion');
                        if (!satir) return;
                        oneriSecili = Number(satir.dataset.i);
                        [...oneriKutu.children].forEach((el, i) =>
                            el.classList.toggle('selected', i === oneriSecili));
                    });
                }
                cmdElements.input.addEventListener('focus', () => {
                    cmdElements.input.select();
                });
            }
            
            // Dynamic input handler
            if (cmdElements.dynInputValue) {
                cmdElements.dynInputValue.addEventListener('keydown', handleDynamicInput);
            }
            
            updateCommandUI();
        }
        
        // Toggle Ortho Mode
        function toggleOrthoMode() {
            cmdState.orthoMode = !cmdState.orthoMode;
            if (cmdElements.ortho) {
                cmdElements.ortho.className = 'command-bar-ortho ' + (cmdState.orthoMode ? 'active' : 'inactive');
            }
            showToast(`Ortho Mode: ${cmdState.orthoMode ? 'ON' : 'OFF'}`);
        }
        
        // Toggle Snap Mode
        function toggleSnapMode() {
            cmdState.snapMode = !cmdState.snapMode;
            if (cmdElements.snap) {
                cmdElements.snap.className = 'command-bar-ortho ' + (cmdState.snapMode ? 'active' : 'inactive');
            }
            showToast(`Snap Mode: ${cmdState.snapMode ? 'ON' : 'OFF'}`);
        }
        
        // Update Command UI
        function updateCommandUI() {
            if (!cmdElements.status) return;
            
            const statusMap = {
                [CMD.NONE]: 'READY',
                [CMD.LINE]: 'LINE',
                [CMD.COPY]: 'COPY',
                [CMD.MOVE]: 'MOVE',
                [CMD.ROTATE]: 'ROTATE',
                [CMD.MIRROR]: 'MIRROR',
                [CMD.SPLIT]: 'SPLIT',
                [CMD.EXTEND]: 'EXTEND',
                [CMD.TRIM]: 'TRIM',
                [CMD.OFFSET]: 'OFFSET',
                [CMD.JOIN]: 'JOIN',
                [CMD.NODE_MOVE]: 'MOVE'
            };
            
            let statusText = statusMap[cmdState.active] || 'READY';
            // Show last command hint when ready
            if (cmdState.active === CMD.NONE && cmdState.lastCommand) {
                statusText = `READY [${cmdState.lastCommand}]`;
            }
            cmdElements.status.textContent = statusText;
            cmdElements.status.style.color = cmdState.active === CMD.NONE ? 'var(--success)' : 'var(--warning)';
            
            // Update message based on phase
            updateCommandMessage();
            
            // Update hints
            updateCommandHints();
        }
        
        // Update Command Message
        function updateCommandMessage() {
            if (!cmdElements.message) return;
            
            let msg = 'Select objects or enter command';
            
            if (cmdState.active === CMD.NONE) {
                const selCount = selectedElements.size + selectedNodes.size;
                if (selCount > 0) {
                    msg = `${selCount} object(s) selected. Enter command or press DEL to delete`;
                }
            } else if (cmdState.active === CMD.LINE) {
                if (cmdState.linePoints.length === 0) {
                    msg = 'Specify first point: (click or type X,Y or X,Y,Z in mm)';
                } else {
                    const lastPt = cmdState.linePoints[cmdState.linePoints.length - 1];
                    msg = `From (${(lastPt.x*1000).toFixed(0)},${(lastPt.y*1000).toFixed(0)},${((lastPt.z||0)*1000).toFixed(0)})` + (cmdState.eksenKilidi ? ` [${cmdState.eksenKilidi} lock]` : '') + `: Next point or [Enter to finish]`;
                }
            } else if (cmdState.active === CMD.COPY) {
                switch (cmdState.phase) {
                    case PHASE.SELECT:
                        msg = 'Select objects to copy, then press ENTER';
                        break;
                    case PHASE.BASE_POINT:
                        msg = 'Specify base point or [Displacement]:';
                        break;
                    case PHASE.DESTINATION:
                        msg = 'Specify displacement or [Array]: (direction + distance)';
                        break;
                }
            } else if (cmdState.active === CMD.MOVE) {
                switch (cmdState.phase) {
                    case PHASE.SELECT:
                        msg = 'Select objects to move, then press ENTER';
                        break;
                    case PHASE.BASE_POINT:
                        msg = 'Specify base point:';
                        break;
                    case PHASE.DESTINATION:
                        msg = 'Specify destination: (direction + distance)';
                        break;
                }
            } else if (cmdState.active === CMD.ROTATE) {
                switch (cmdState.phase) {
                    case PHASE.SELECT:
                        msg = 'Select objects to rotate, then press ENTER';
                        break;
                    case PHASE.BASE_POINT:
                        msg = 'Specify rotation center:';
                        break;
                    case PHASE.DESTINATION:
                        msg = 'Specify rotation angle or [Copy/Reference]:';
                        break;
                }
            } else if (cmdState.active === CMD.MIRROR) {
                switch (cmdState.phase) {
                    case PHASE.SELECT:
                        msg = 'Select objects to mirror, then press ENTER';
                        break;
                    case PHASE.BASE_POINT:
                        msg = 'Specify first point of mirror line:';
                        break;
                    case PHASE.SECOND_POINT:
                        msg = 'Specify second point of mirror line:';
                        break;
                    case PHASE.CONFIRM:
                        msg = 'Delete source objects? [Yes/No] <N>:';
                        break;
                }
            } else if (cmdState.active === CMD.SPLIT) {
                switch (cmdState.phase) {
                    case PHASE.SELECT:
                        msg = 'Select beam to split (click on beam):';
                        break;
                    case PHASE.DESTINATION:
                        msg = 'Click split point or [Ratio/Distance/Parts]:';
                        break;
                }
            } else if (cmdState.active === CMD.EXTEND) {
                switch (cmdState.phase) {
                    case PHASE.SELECT:
                        msg = 'Select boundary edges or <Enter to select all>:';
                        break;
                    case PHASE.DESTINATION:
                        msg = 'Select beam end to extend or [Distance]:';
                        break;
                }
            } else if (cmdState.active === CMD.TRIM) {
                switch (cmdState.phase) {
                    case PHASE.SELECT:
                        msg = 'Select cutting edges or <Enter to select all>:';
                        break;
                    case PHASE.DESTINATION:
                        msg = 'Select portion to trim:';
                        break;
                }
            }
            
            cmdElements.message.textContent = msg;
        }
        
        // Update Command Hints
        function updateCommandHints() {
            if (!cmdElements.hints) return;
            
            if (cmdState.active === CMD.NONE) {
                let baseHints = '<span>[L]</span>ine <span>[CO]</span>py <span>[M]</span>ove <span>[RO]</span>tate <span>[O]</span>ffset <span>[SP]</span>lit <span>[J]</span>oin';
                if (cmdState.lastCommand) {
                    baseHints += ` | <span>[SPACE]</span> repeat ${cmdState.lastCommand}`;
                }
                cmdElements.hints.innerHTML = baseHints;
            } else if (cmdState.active === CMD.LINE) {
                if (cmdState.linePoints.length === 0) {
                    cmdElements.hints.innerHTML = 'Click or type <span>X,Y,Z</span> (mm) | <span>@X,Y</span> relative | <span>[ESC]</span> Cancel';
                } else {
                    cmdElements.hints.innerHTML = 'Next: Click | <span>X,Y,Z</span> | <span>@X,Y</span> | <span>distance</span> | <span>X/Y/Z</span> axis lock | <span>[ENTER]</span> Finish | <span>[ESC]</span>';
                }
            } else if (cmdState.active === CMD.SPLIT) {
                cmdElements.hints.innerHTML = 'Click beam | X1500 Y2000 50% | <span>[ESC]</span> Cancel';
            } else if (cmdState.active === CMD.OFFSET) {
                cmdElements.hints.innerHTML = 'Click side or type mm | <span>[ESC]</span> Cancel';
            } else {
                cmdElements.hints.innerHTML = '<span>[ESC]</span> Cancel <span>[ENTER]</span> Confirm';
            }
        }
        
        // Handle Command Input (command bar)
        function handleCommandInput(e) {
            const input = cmdElements.input;
            if (!input) return;
            
            const value = input.value.trim();

            // ---- Oneri listesi klavyesi ----
            const oneriAcik = oneriListesi.length > 0 &&
                (oneriKutusu() || {}).style?.display === 'block';

            if (oneriAcik && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
                e.preventDefault();
                e.stopPropagation();
                oneriGez(e.key === 'ArrowDown' ? 1 : -1);
                return;
            }

            // Tab: secili oneriyi yazar ama calistirmaz (AutoCAD gibi).
            if (oneriAcik && e.key === 'Tab') {
                e.preventDefault();
                e.stopPropagation();
                oneriUygula(false);
                return;
            }

            // Esc once listeyi kapatir, komutu iptal etmez.
            if (oneriAcik && e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                oneriGizle();
                return;
            }

            if (oneriAcik && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault();
                e.stopPropagation();
                oneriUygula(true);
                return;
            }

            // Enter or Space: Process input
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                e.stopPropagation();
                
                // Clear input FIRST
                input.value = '';
                
                // If empty input and command active, handle based on phase
                if (value === '' && cmdState.active !== CMD.NONE) {
                    handleEmptyEnter();
                } else if (value === '' && cmdState.active === CMD.NONE && cmdState.lastCommand) {
                    // Repeat last command
                    startCommand(cmdState.lastCommand);
                } else if (value) {
                    // For LINE command, don't uppercase coordinates
                    if (cmdState.active === CMD.LINE) {
                        processCommandInput(value);
                    } else {
                        processCommandInput(value.toUpperCase());
                    }
                }
                
                // Keep focus on input for LINE command
                if (cmdState.active === CMD.LINE) {
                    input.focus();
                }
            } else if (e.key === 'Escape') {
                e.preventDefault();
                cancelCommand();
                input.value = '';
                input.blur();
            }
        }
        
        // Handle empty Enter press (for phase transitions)
        function handleEmptyEnter() {
            // LINE command - finish line on empty enter
            if (cmdState.active === CMD.LINE) {
                if (cmdState.linePoints.length > 0) {
                    showToast(`Line finished (${cmdState.linePoints.length} points)`);
                }
                cancelCommand();
                return;
            }
            
            if (cmdState.phase === PHASE.SELECT) {
                // Confirm selection and move to next phase
                const selectedBeamIds = getSelectedBeamIds();
                if (selectedBeamIds.length > 0) {
                    cmdState.selectedBeamIds = selectedBeamIds;
                    
                    if (cmdState.active === CMD.EXTEND || cmdState.active === CMD.TRIM) {
                        // For extend/trim, empty enter = use all beams as boundaries
                        cmdState.boundaryEdges = [];
                        cmdState.phase = PHASE.DESTINATION;
                    } else if (cmdState.active === CMD.SPLIT) {
                        // For split, stay in select phase (click on beam)
                        cmdState.phase = PHASE.DESTINATION;
                    } else {
                        // For copy/move/rotate/mirror, go to base point
                        cmdState.phase = PHASE.BASE_POINT;
                    }
                    updateCommandUI();
                    showToast(`${selectedBeamIds.length} beam(s) selected. Click base point.`);
                } else {
                    showToast('Select objects first', 'warning');
                }
            }
        }
        
        // Process Command Input
        function processCommandInput(value) {
            // If no active command, start one
            if (cmdState.active === CMD.NONE) {
                startCommand(value);
                return;
            }
            
            // LINE: koordinat / uzunluk / @dx,dy / eksen kilidi. Klavye
            // yakalayicisindaki (handlers.js) yolla AYNI cozumleyici.
            if (cmdState.active === CMD.LINE) {
                cizgiGirdisiIsle(value);
                return;
            }

            // Process input based on active command and phase
            if (cmdState.active === CMD.COPY || cmdState.active === CMD.MOVE) {
                if (cmdState.phase === PHASE.DESTINATION) {
                    processDisplacementInput(value);
                } else if (cmdState.phase === PHASE.SELECT && value) {
                    // Allow numeric input even in select phase (for quick distance)
                    // But first need base point
                    showToast('Select objects and press Enter first', 'warning');
                }
            } else if (cmdState.active === CMD.ROTATE) {
                if (cmdState.phase === PHASE.DESTINATION) {
                    processRotationInput(value);
                }
            } else if (cmdState.active === CMD.MIRROR) {
                if (cmdState.phase === PHASE.CONFIRM) {
                    processMirrorConfirm(value);
                }
            } else if (cmdState.active === CMD.SPLIT) {
                if (cmdState.phase === PHASE.DESTINATION || cmdState.phase === PHASE.SELECT) {
                    processSplitInput(value);
                }
            } else if (cmdState.active === CMD.OFFSET) {
                if (cmdState.phase === PHASE.DESTINATION) {
                    // Parse distance input
                    const dist = parseFloat(value);
                    if (!isNaN(dist) && dist > 0) {
                        cmdState.offsetDist = dist / 1000; // mm to m
                        executeOffset();
                    } else {
                        showToast('Enter distance in mm (e.g. 500)', 'warning');
                    }
                }
            }
        }
        
        // ============== LINE: TEK GIRIS NOKTASI ==============
        //
        // Kiris kuran BES kopya vardi: 3B tiklama, komut cubugundan koordinat,
        // klavye yakalayicisindan koordinat, uzunluk, @dx,dy. Ikisi z'yi
        // dusuruyordu (dugumu z'siz kuruyor, yani z=3'te cizilen kiris
        // zemine iniyordu), uzunluk girisi yonun z'sini saymiyordu. Simdi
        // her yol bir NOKTA uretir ve ciziyeNoktaEkle'ye verir.
        //
        // p: {x,y,z} metre. Ilk nokta ise yalnizca baslangic olur; sonrakiler
        // bir onceki noktadan buraya kiris kurar.
        function ciziyeNoktaEkle(p, esitUzunluk) {
            const nokta = { x: p.x, y: p.y, z: (typeof p.z === 'number' && isFinite(p.z)) ? p.z : 0 };
            cmdState.linePoints.push(nokta);

            if (cmdState.linePoints.length >= 2) {
                const pts = cmdState.linePoints;
                const p1 = pts[pts.length - 2];
                const p2 = pts[pts.length - 1];

                const dx = p2.x - p1.x, dy = p2.y - p1.y, dz = p2.z - p1.z;
                const len = Math.sqrt(dx*dx + dy*dy + dz*dz);
                if (len < 0.001) {
                    // Ayni noktaya ikinci tiklama: sifir boylu kiris kurma.
                    pts.pop();
                    showToast('Same point - pick a different point', 'warning');
                    return false;
                }
                // Bir sonraki "uzunluk" girisi bu yonde gider (z dahil).
                cmdState.lastCursorDir = { x: dx/len, y: dy/len, z: dz/len };

                const kesit = kesitSec();
                if (!kesit) { pts.pop(); kesitYokUyar(); return false; }

                saveState();
                let n1Id = findNodeAt(p1.x, p1.y, 0.01, p1.z);
                if (n1Id == null) { n1Id = nextNodeId++; model.nodes[n1Id] = { x: p1.x, y: p1.y, z: p1.z }; }
                let n2Id = findNodeAt(p2.x, p2.y, 0.01, p2.z);
                if (n2Id == null) { n2Id = nextNodeId++; model.nodes[n2Id] = { x: p2.x, y: p2.y, z: p2.z }; }

                const beamId = nextElementId++;
                model.elements[beamId] = { n1: n1Id, n2: n2Id, section: kesit };
                autoSplitAtIntersections([beamId]);

                if (currentViewMode === '3d') {
                    update3DScene();
                    if (threeRenderer && threeScene && threeCamera) threeRenderer.render(threeScene, threeCamera);
                } else {
                    draw();
                }
                if (typeof updatePropertiesPanel === 'function') updatePropertiesPanel();

                const distMM = (len * 1000).toFixed(0);
                const esit = esitUzunluk ? ` (= beam ${esitUzunluk.kaynak})` : '';
                showToast(`Line: ${distMM} mm ${yonOku(cmdState.lastCursorDir)}${esit} → Next point?`);
            } else {
                cmdState.lastCursorDir = { x: 1, y: 0, z: 0 };
                if (currentViewMode === '3d') update3DScene(); else draw();
                showToast(`Start: (${(nokta.x*1000).toFixed(0)}, ${(nokta.y*1000).toFixed(0)}, ${(nokta.z*1000).toFixed(0)}) → Next point or distance`);
            }

            cmdState.basePoint = { x: nokta.x, y: nokta.y, z: nokta.z };
            // Klavyeden girilen noktada imlec baska yerde; eski konumdaki
            // ipucu ve isaretci yaniltir, fare kipirdayinca yeniden gelir.
            hideTooltip(); if (typeof hideSnapMarker === 'function') hideSnapMarker();
            updateCommandUI();
            if (cmdElements.input) setTimeout(() => cmdElements.input.focus(), 10);
            return true;
        }

        // Yon oku: en buyuk bileseni yazar; z de sayilir.
        function yonOku(d) {
            if (!d) return '';
            const ax = Math.abs(d.x || 0), ay = Math.abs(d.y || 0), az = Math.abs(d.z || 0);
            if (az > ax && az > ay) return d.z > 0 ? '↑ +Z' : '↓ -Z';
            if (ax >= ay) return d.x > 0 ? '→ +X' : '← -X';
            return d.y > 0 ? '↑ +Y' : '↓ -Y';
        }

        // Yazilan girdiyi cozer:
        //   "X" / "Y" / "Z"      eksen kilidi (ac/kapat)
        //   "a,b"                etkin duzlemin iki ekseni (mm)
        //   "a,b,c"              tam x,y,z (mm)
        //   "@dx,dy" / "@dx,dy,dz"  son noktaya gore (mm)
        //   "3000"               son yonde (fare / kilit / son kiris) uzunluk
        function cizgiGirdisiIsle(value) {
            const v = String(value).trim();
            if (!v) return;

            if (/^[xyz]$/i.test(v)) {
                if (cmdState.linePoints.length === 0) { showToast('First specify a start point', 'warning'); return; }
                eksenKilidiDegistir(v.toUpperCase());
                return;
            }

            const SAYI = '(-?\\d+(?:\\.\\d+)?)';
            const AYRAC = '\\s*[,;\\s]\\s*';
            const mutlak = v.match(new RegExp('^' + SAYI + AYRAC + SAYI + '(?:' + AYRAC + SAYI + ')?$'));
            if (mutlak) {
                const a1 = parseFloat(mutlak[1]) / 1000, a2 = parseFloat(mutlak[2]) / 1000;
                let p;
                if (mutlak[3] !== undefined) p = { x: a1, y: a2, z: parseFloat(mutlak[3]) / 1000 };
                else p = (typeof duzlemNokta === 'function') ? duzlemNokta(a1, a2) : { x: a1, y: a2, z: 0 };
                ciziyeNoktaEkle(p);
                return;
            }

            const bagil = v.match(new RegExp('^@' + SAYI + AYRAC + SAYI + '(?:' + AYRAC + SAYI + ')?$'));
            if (bagil) {
                if (cmdState.linePoints.length === 0) { showToast('First specify a start point', 'warning'); return; }
                const son = cmdState.linePoints[cmdState.linePoints.length - 1];
                const dx = parseFloat(bagil[1]) / 1000, dy = parseFloat(bagil[2]) / 1000;
                const dz = bagil[3] !== undefined ? parseFloat(bagil[3]) / 1000 : 0;
                ciziyeNoktaEkle({ x: son.x + dx, y: son.y + dy, z: (son.z || 0) + dz });
                return;
            }

            const uzunluk = parseFloat(v);
            if (!isNaN(uzunluk) && uzunluk > 0) {
                if (cmdState.linePoints.length === 0) { showToast('First specify a start point', 'warning'); return; }
                processLineDistanceInput(uzunluk);
                return;
            }

            showToast('Type X,Y[,Z] · @dX,dY[,dZ] · distance · X/Y/Z axis lock', 'warning');
        }

        // Uzunluk girisi: son noktadan, son yonde. Yon sirasiyla: eksen
        // kilidi (imlecin o eksendeki isareti), fare yonu (3B), yoksa +X.
        function processLineDistanceInput(distMM) {
            if (cmdState.linePoints.length === 0) return;
            const son = cmdState.linePoints[cmdState.linePoints.length - 1];
            const L = distMM / 1000;

            let d = cmdState.lastCursorDir ? { x: cmdState.lastCursorDir.x || 0, y: cmdState.lastCursorDir.y || 0, z: cmdState.lastCursorDir.z || 0 } : { x: 1, y: 0, z: 0 };
            if (cmdState.eksenKilidi) {
                const k = cmdState.eksenKilidi.toLowerCase();
                const isaret = (d[k] < 0) ? -1 : 1;
                d = { x: 0, y: 0, z: 0 }; d[k] = isaret;
            }
            const n = Math.sqrt(d.x*d.x + d.y*d.y + d.z*d.z);
            if (n < 1e-9) d = { x: 1, y: 0, z: 0 }; else { d.x /= n; d.y /= n; d.z /= n; }

            ciziyeNoktaEkle({ x: son.x + d.x * L, y: son.y + d.y * L, z: (son.z || 0) + d.z * L });
        }

        // Start Command - Always start from SELECT phase
        function startCommand(cmd) {
            // "LI" / "LIN" gibi kismi yazimlar da komuta cevrilir; asagidaki
            // switch yalnizca tam adi bilir.
            const cozulen = komutCoz(cmd);
            if (cozulen) cmd = cozulen;

            // Clear any previous command state
            cancelCommand();
            
            const selectedBeamIds = getSelectedBeamIds();
            const hasSelection = selectedBeamIds.length > 0;
            
            switch (cmd) {
                // Komut degil, kucuk bir kutu aciyor: cizim durumu kurmadigi
                // icin hemen donuyor.
                case 'PL':
                case 'PLANE':
                    if (typeof yeniDuzlemAc === 'function') yeniDuzlemAc();
                    return;

                case 'C':
                case 'COPY':
                case 'CO':
                    cmdState.active = CMD.COPY;
                    cmdState.selectedBeamIds = hasSelection ? selectedBeamIds : [];
                    cmdState.phase = hasSelection ? PHASE.BASE_POINT : PHASE.SELECT;
                    showToast(hasSelection ? `COPY ${selectedBeamIds.length}: Click base point` : 'Select beams, then Space');
                    break;
                    
                case 'M':
                case 'MOVE':
                    cmdState.active = CMD.MOVE;
                    cmdState.selectedBeamIds = hasSelection ? selectedBeamIds : [];
                    cmdState.stretchNodes = null;
                    cmdState.phase = hasSelection ? PHASE.BASE_POINT : PHASE.SELECT;
                    showToast(hasSelection ? `MOVE ${selectedBeamIds.length}: Click base point` : 'Select beams, then Space');
                    break;

                // STRETCH: secili DUGUMLER tasinir, bagli kirisler uzar/kisalir
                // (MOVE kirisin iki ucunu da tasir). Kutu secimiyle bir kenar
                // dugumlerini alip acikligi degistirmenin yolu.
                case 'ST':
                case 'STRETCH': {
                    const dugumler = [...selectedNodes].filter(id => model.nodes[id]);
                    cmdState.active = CMD.MOVE;
                    cmdState.selectedBeamIds = [];
                    cmdState.stretchNodes = dugumler.length ? dugumler : [];
                    cmdState.phase = dugumler.length ? PHASE.BASE_POINT : PHASE.SELECT;
                    showToast(dugumler.length ? `STRETCH ${dugumler.length} node(s): Click base point` : 'Select nodes (box select), then Space');
                    break;
                }
                    
                case 'R':
                case 'RO':
                case 'ROTATE':
                    cmdState.active = CMD.ROTATE;
                    cmdState.selectedBeamIds = hasSelection ? selectedBeamIds : [];
                    cmdState.phase = hasSelection ? PHASE.BASE_POINT : PHASE.SELECT;
                    cmdState.keepOriginal = false;
                    showToast(hasSelection ? `ROTATE ${selectedBeamIds.length}: Click center` : 'Select beams, then Space');
                    break;
                    
                case 'MI':
                case 'MIRROR':
                    cmdState.active = CMD.MIRROR;
                    cmdState.selectedBeamIds = hasSelection ? selectedBeamIds : [];
                    cmdState.phase = hasSelection ? PHASE.BASE_POINT : PHASE.SELECT;
                    cmdState.keepOriginal = true;
                    showToast(hasSelection ? `MIRROR ${selectedBeamIds.length}: Click first point` : 'Select beams, then Space');
                    break;
                    
                case 'SP':
                case 'SPLIT':
                    cmdState.active = CMD.SPLIT;
                    cmdState.phase = PHASE.DESTINATION; // Direct click mode
                    showToast('SPLIT: Click beam or type X1500/Y2000/50%');
                    break;
                    
                case 'EX':
                case 'EXTEND':
                    cmdState.active = CMD.EXTEND;
                    cmdState.phase = PHASE.DESTINATION; // Direct click mode
                    showToast('EXTEND: Click beam end to extend');
                    break;
                    
                case 'TR':
                case 'TRIM':
                    cmdState.active = CMD.TRIM;
                    cmdState.phase = PHASE.DESTINATION; // Direct click mode
                    showToast('TRIM: Click segment to remove');
                    break;
                
                case 'L':
                case 'LINE':
                    cmdState.active = CMD.LINE;
                    cmdState.phase = PHASE.BASE_POINT;
                    cmdState.linePoints = [];
                    cmdState.lastCursorDir = { x: 1, y: 0 }; // Default +X direction
                    showToast('LINE: Click point or type X,Y (mm)');
                    break;
                
                case 'O':
                case 'OFFSET':
                    cmdState.active = CMD.OFFSET;
                    cmdState.selectedBeamIds = hasSelection ? selectedBeamIds : [];
                    if (hasSelection) {
                        cmdState.phase = PHASE.DESTINATION;
                        showToast('OFFSET: Click side or type distance (mm)');
                    } else {
                        cmdState.phase = PHASE.SELECT;
                        showToast('OFFSET: Select beam to offset');
                    }
                    break;
                
                case 'J':
                case 'JOIN':
                    cmdState.active = CMD.JOIN;
                    cmdState.phase = PHASE.SELECT;
                    cmdState.selectedBeamIds = [];
                    showToast('JOIN: Select first beam');
                    break;
                
                case 'PU':
                case 'PURGE':
                    purgeModel(10); // 10mm tolerance
                    cmdState.lastCommand = cmd; // Save for repeat
                    return; // Don't activate any command
                    
                default:
                    // Try to parse as coordinate or distance
                    return;
            }
            
            // Komut basladi: girdi artik koordinat icin, oneri listesi kapanir.
            oneriGizle();

            // Save last command for repeat (Space/Enter when no command active)
            cmdState.lastCommand = cmd;
            
            updateCommandUI();
            highlightActiveCommand();
            
            // Focus on command input for coordinate entry
            if (cmdState.active === CMD.LINE && cmdElements.input) {
                setTimeout(() => cmdElements.input.focus(), 50);
            }
        }
        
        // Cancel Command
        function cancelCommand() {
            cmdState.active = CMD.NONE;
            cmdState.phase = PHASE.SELECT;
            cmdState.basePoint = null;
            cmdState.basePointScreen = null;
            cmdState.secondPoint = null;
            cmdState.previewData = null;
            cmdState.hoverBeam = null;
            cmdState.hoverPoint = null;
            cmdState.boundaryEdges = [];
            cmdState.linePoints = [];
            cmdState.eksenKilidi = null;
            cmdState.selectedNode = null;
            cmdState.hoverNode = null;
            cmdState.dragNode = null;
            
            // Hide UI elements
            hideBasePointMarker();
            hideDirectionLine();
            hideMirrorLine();
            hideSplitPoint();
            hideTooltip();
            hideDynamicInput();
            if (typeof hideSnapMarker === 'function') hideSnapMarker();
            cmdState.currentSnapPoint = null;
            
            // Clear preview
            clearCommandPreview();
            
            // Remove highlight from toolbar buttons
            document.querySelectorAll('.toolbar-btn.cmd-active').forEach(btn => {
                btn.classList.remove('cmd-active');
            });
            
            updateCommandUI();
            
            // Refresh view
            if (currentViewMode === '3d') {
                update3DScene();
            } else {
                draw();
            }
        }
        
        // Highlight Active Command Button
        function highlightActiveCommand() {
            document.querySelectorAll('.toolbar-btn.cmd-active').forEach(btn => {
                btn.classList.remove('cmd-active');
            });
            
            // Map command to button ID
            const btnMap = {
                [CMD.COPY]: 'btnCopy',
                [CMD.MOVE]: 'btnMove',
                [CMD.ROTATE]: 'btnRotate',
                [CMD.MIRROR]: 'btnMirror',
                [CMD.SPLIT]: 'btnSplit',
                [CMD.EXTEND]: 'btnExtend',
                [CMD.TRIM]: 'btnTrim',
                [CMD.LINE]: 'btnLine',
                [CMD.OFFSET]: 'btnOffset',
                [CMD.JOIN]: 'btnJoin'
            };
            
            const btnId = btnMap[cmdState.active];
            if (btnId) {
                const btn = document.getElementById(btnId);
                if (btn) btn.classList.add('cmd-active');
            }
        }
        
