        // ============== MODAL FUNCTIONS ==============
        
        function getSelectedBeamIds() {
            // Get selected beam IDs from both single and multi selection
            const ids = [];
            
            // From selectedElements Set
            selectedElements.forEach(id => {
                if (model.elements[id]) {
                    ids.push(id);
                }
            });
            
            // Also check selectedElement (single selection)
            if (selectedElement && model.elements[selectedElement.id] && !ids.includes(selectedElement.id)) {
                ids.push(selectedElement.id);
            }
            
            return ids;
        }
        
        // ================================================================
        //  DUZENLEME PENCERELERI  (Copy / Mirror / Split)
        // ----------------------------------------------------------------
        //  Bu uc pencerenin MANTIGI vardi ama HTML'i yoktu: kisayol, sag tik
        //  menusu ve sag paneldeki dugmeler cagiriyor, hicbir sey acilmiyordu.
        //  Arayuz denetimi (tests/ui-audit.js) uc "eksik pencere" bulgusu
        //  olarak bunu yakaladi.
        //
        //  Pencereler geri kurulurken mantigin UC BOYUTLU olmadigi ortaya
        //  cikti: turetilen her dugum yalnizca x-y aliyor, z dusuyordu. Uc
        //  boyutlu bir cercevede bu, kopyalanan her seyin z=0 duzlemine
        //  yigilmasi demek. Pencereleri bu haliyle geri koymak calismayan bir
        //  seyi calisiyor gibi gostermek olurdu; o yuzden z de eklendi.
        // ================================================================

        // Dugumun kotu: z yoksa sifir (iki boyutlu cizimden gelen dugumler).
        function kirisKotu(n) { return (n && typeof n.z === 'number' && isFinite(n.z)) ? n.z : 0; }

        // Secili kirislerin BUTUN dugumleri - uc islem de ayni seyi istiyor.
        function secilenKirisDugumleri(ids) {
            const k = new Set();
            ids.forEach(id => {
                const e = model.elements[id];
                if (e) { k.add(e.n1); k.add(e.n2); }
            });
            return k;
        }

        // Bir dugum kumesini verilen donusumden gecirip yeni dugumler uretir.
        // Ayni yerde dugum varsa YENISINI ACMAZ, mevcudu kullanir: kopyalanan
        // parca komsusuna gercekten baglansin diye.
        function dugumleriTuret(dugumler, donustur, yeniIdler) {
            const harita = {};
            dugumler.forEach(eski => {
                const d = model.nodes[eski];
                if (!d) return;
                const y = donustur(d);
                const varOlan = findNodeAtLocation(y.x, y.y, y.z);
                if (varOlan !== null) { harita[eski] = varOlan; return; }
                const yeni = nextNodeId++;
                model.nodes[yeni] = { id: yeni, x: y.x, y: y.y, z: y.z };
                harita[eski] = yeni;
                if (yeniIdler) yeniIdler.push(yeni);
            });
            return harita;
        }

        // Kirisleri haritaya gore yeniden kurar (kesisimlerde otomatik boler).
        function kirisleriTuret(ids, harita, yeniKirisler) {
            ids.forEach(eski => {
                const e = model.elements[eski];
                if (!e) return;
                const a = harita[e.n1], b = harita[e.n2];
                if (a === undefined || b === undefined) return;
                yeniKirisler.push(...createBeamWithIntersections(a, b, e.section, e.orientation || 0));
            });
        }

        // Pencereyi ac/kapat. DIKKAT: .modal-overlay varsayilan olarak
        // opacity:0 + visibility:hidden. Yalnizca display'i degistirmek
        // pencereyi GORUNUR YAPMAZ - gorunurlugu 'active' sinifi veriyor.
        // Eski kod display ile ugrasiyordu; markup geri gelse bile bos ekran
        // acilacakti.
        function pencereAc(id) {
            const m = document.getElementById(id);
            if (!m) return null;
            m.classList.add('active');
            return m;
        }
        function pencereKapat(id) {
            const m = document.getElementById(id);
            if (m) m.classList.remove('active');
        }

        // ----- COPY MODAL -----
        function showCopyModal() {
            const selectedBeamIds = getSelectedBeamIds();
            
            if (selectedBeamIds.length === 0) {
                showToast('Select beams to copy first', 'warning');
                return;
            }
            
            const modal = pencereAc('copyModal');
            if (!modal) {
                showToast('Copy modal not found', 'error');
                return;
            }

            const bilgi = document.getElementById('copySelectionInfo');
            if (bilgi) bilgi.textContent = selectedBeamIds.length + ' beam' +
                (selectedBeamIds.length === 1 ? '' : 's') + ' selected';

            setTimeout(() => {
                const input = document.getElementById('copyOffsetX');
                if (input) input.focus();
            }, 100);
            
            // Array mode toggle
            const arrayCheckbox = document.getElementById('copyArrayMode');
            if (arrayCheckbox) {
                arrayCheckbox.onchange = function() {
                    const options = document.getElementById('copyArrayOptions');
                    if (options) options.style.display = this.checked ? 'block' : 'none';
                };
            }
        }
        
        function closeCopyModal() { pencereKapat('copyModal'); }
        
        function executeCopy() {
            const offsetX = parseFloat(document.getElementById('copyOffsetX')?.value) || 0;
            const offsetY = parseFloat(document.getElementById('copyOffsetY')?.value) || 0;
            const offsetZ = parseFloat(document.getElementById('copyOffsetZ')?.value) || 0;
            const copyCount = parseInt(document.getElementById('copyCount')?.value) || 1;
            const arrayMode = document.getElementById('copyArrayMode')?.checked;

            if (arrayMode) {
                executeArrayCopy();
                return;
            }

            const selectedBeamIds = getSelectedBeamIds();
            if (selectedBeamIds.length === 0) {
                closeCopyModal();
                showToast('No beams selected', 'warning');
                return;
            }
            // Sifir oteleme sessizce "hicbir sey olmadi" demek olurdu; kullanici
            // kopyanin nereye gittigini arar. Soyle.
            if (!offsetX && !offsetY && !offsetZ) {
                showToast('Offset is zero - the copy would sit on the original', 'warning');
                return;
            }

            const allNewBeamIds = [];
            const allNewNodeIds = [];
            const kaynak = secilenKirisDugumleri(selectedBeamIds);

            // Her kopya BIR ONCEKINDEN degil ORIJINALDEN oteleniyor: n. kopya
            // n*oteleme kadar uzakta. Zincirleme otelemede yuvarlama hatasi
            // birikir ve son kopyalar izgaraya tam oturmaz.
            for (let copyNum = 1; copyNum <= copyCount; copyNum++) {
                const dx = offsetX * copyNum, dy = offsetY * copyNum, dz = offsetZ * copyNum;
                const nodeMap = dugumleriTuret(kaynak,
                    d => ({ x: d.x + dx, y: d.y + dy, z: kirisKotu(d) + dz }),
                    allNewNodeIds);
                kirisleriTuret(selectedBeamIds, nodeMap, allNewBeamIds);
            }

            // Select new elements
            clearSelection();
            allNewBeamIds.forEach(id => selectedElements.add(id));
            allNewNodeIds.forEach(id => selectedElements.add(id));
            
            results = null;
            if (currentViewMode === '3d') update3DScene();
            else draw();
            
            updateEntityInfoPanel();
            saveState();
            closeCopyModal();
            showToast(`Created ${allNewBeamIds.length} beams (${copyCount} copies)`);
        }
        
        // z VERILMEZSE yalnizca planda arar - eski davranis, iki boyutlu
        // cizim yollari buna guveniyor. Uc boyutlu islemler z'yi VERMELI:
        // ayni plan noktasinda ama baska kotadaki dugum BASKA bir dugumdur ve
        // ikisini birlestirmek modele olmayan bir bag ekler.
        function findNodeAtLocation(x, y, z, tolerance = 0.01) {
            const zVar = (typeof z === 'number' && isFinite(z));
            for (const [nodeId, node] of Object.entries(model.nodes)) {
                if (Math.abs(node.x - x) >= tolerance) continue;
                if (Math.abs(node.y - y) >= tolerance) continue;
                if (zVar && Math.abs(kirisKotu(node) - z) >= tolerance) continue;
                return parseInt(nodeId);
            }
            return null;
        }
        
        // Dizi kopyasi UC yonlu: sutun (X), satir (Y), kat (Z).
        // Kat boyutu gemi isinde bedava gelmiyor - guverte guverte tekrar eden
        // bir cerceve tam olarak budur; iki boyutlu birakmak, isin yarisini
        // elle yaptirmak olurdu.
        function executeArrayCopy() {
            const cols = parseInt(document.getElementById('copyArrayCols')?.value) || 2;
            const rows = parseInt(document.getElementById('copyArrayRows')?.value) || 2;
            const lays = parseInt(document.getElementById('copyArrayLayers')?.value) || 1;
            const spacingX = parseFloat(document.getElementById('copySpacingX')?.value) || 1;
            const spacingY = parseFloat(document.getElementById('copySpacingY')?.value) || 1;
            const spacingZ = parseFloat(document.getElementById('copySpacingZ')?.value) || 0;

            const selectedBeamIds = getSelectedBeamIds();
            if (selectedBeamIds.length === 0) {
                closeCopyModal();
                return;
            }

            const allNewBeamIds = [];
            const allNewNodeIds = [];
            const kaynak = secilenKirisDugumleri(selectedBeamIds);

            for (let lay = 0; lay < Math.max(1, lays); lay++) {
                for (let row = 0; row < Math.max(1, rows); row++) {
                    for (let col = 0; col < Math.max(1, cols); col++) {
                        if (row === 0 && col === 0 && lay === 0) continue; // orijinalin yeri
                        const dx = spacingX * col, dy = spacingY * row, dz = spacingZ * lay;
                        const nodeMap = dugumleriTuret(kaynak,
                            d => ({ x: d.x + dx, y: d.y + dy, z: kirisKotu(d) + dz }),
                            allNewNodeIds);
                        kirisleriTuret(selectedBeamIds, nodeMap, allNewBeamIds);
                    }
                }
            }

            clearSelection();
            allNewBeamIds.forEach(id => selectedElements.add(id));
            allNewNodeIds.forEach(id => selectedElements.add(id));

            results = null;
            if (currentViewMode === '3d') update3DScene();
            else draw();

            updateEntityInfoPanel();
            saveState();
            closeCopyModal();
            showToast(`Created ${cols}×${rows}${lays > 1 ? '×' + lays : ''} array (${allNewBeamIds.length} new beams)`);
        }
        
        // ----- MIRROR MODAL -----
        function showMirrorModal() {
            const selectedBeamIds = getSelectedBeamIds();
            
            if (selectedBeamIds.length === 0) {
                showToast('Select beams to mirror first', 'warning');
                return;
            }
            
            const modal = pencereAc('mirrorModal');
            if (!modal) {
                showToast('Mirror modal not found', 'error');
                return;
            }

            const bilgi = document.getElementById('mirrorSelectionInfo');
            if (bilgi) bilgi.textContent = selectedBeamIds.length + ' beam' +
                (selectedBeamIds.length === 1 ? '' : 's') + ' selected';
            
            // Reset selections
            document.querySelectorAll('#mirrorModal .modal-radio-item').forEach(item => {
                item.classList.remove('selected');
            });
            
            const xAxisRadio = document.querySelector('#mirrorModal input[value="x"]');
            const centerRadio = document.querySelector('#mirrorModal input[value="center"]');
            
            if (xAxisRadio) {
                xAxisRadio.checked = true;
                xAxisRadio.closest('.modal-radio-item')?.classList.add('selected');
            }
            if (centerRadio) {
                centerRadio.checked = true;
                centerRadio.closest('.modal-radio-item')?.classList.add('selected');
            }
        }
        
        function closeMirrorModal() { pencereKapat('mirrorModal'); }
        
        function selectMirrorAxis(axis) {
            document.querySelectorAll('#mirrorModal input[name="mirrorAxis"]').forEach(input => {
                const item = input.closest('.modal-radio-item');
                if (item) item.classList.remove('selected');
                if (input.value === axis) {
                    input.checked = true;
                    if (item) item.classList.add('selected');
                }
            });
        }
        
        function selectMirrorPosition(pos) {
            document.querySelectorAll('#mirrorModal input[name="mirrorPos"]').forEach(input => {
                const item = input.closest('.modal-radio-item');
                if (item) item.classList.remove('selected');
                if (input.value === pos) {
                    input.checked = true;
                    if (item) item.classList.add('selected');
                }
            });
        }
        
        function executeMirror() {
            const axisInput = document.querySelector('#mirrorModal input[name="mirrorAxis"]:checked');
            const posInput = document.querySelector('#mirrorModal input[name="mirrorPos"]:checked');
            
            // AYNA DUZLEMI. 'x' -> X eksenine gore, yani Y isaret degistirir.
            // 'y' -> Y eksenine gore, X degisir. 'z' -> yatay XY duzlemine
            // gore, Z degisir; uc boyutlu modelde en cok istenen bu (bir
            // guverteyi asagi/yukari yansitmak).
            //
            // Degisen KOORDINAT hangisi ise, ayna konumu da o eksen uzerinde
            // olculur. Eskiden bu iki yerde ayri ayri yaziliydi ve z yoktu.
            const axis = axisInput?.value || 'x';
            const posType = posInput?.value || 'center';
            const keepOriginal = document.getElementById('mirrorKeepOriginal')?.checked ?? true;
            const customPos = parseFloat(document.getElementById('mirrorCustomPos')?.value) || 0;

            const selectedBeamIds = getSelectedBeamIds();
            if (selectedBeamIds.length === 0) {
                closeMirrorModal();
                showToast('No beams selected', 'warning');
                return;
            }

            // Hangi koordinat cevrilecek?
            const eksen = (axis === 'x') ? 'y' : (axis === 'z') ? 'z' : 'x';
            const oku = d => (eksen === 'z') ? kirisKotu(d) : d[eksen];

            const nodesToMirror = secilenKirisDugumleri(selectedBeamIds);

            // Ayna konumu
            let mirrorPos = 0;
            if (posType === 'center') {
                let toplam = 0, adet = 0;
                nodesToMirror.forEach(id => {
                    const d = model.nodes[id];
                    if (d) { toplam += oku(d); adet++; }
                });
                mirrorPos = adet > 0 ? toplam / adet : 0;
            } else if (posType === 'origin') {
                mirrorPos = 0;
            } else {
                mirrorPos = customPos;
            }

            // AYNA SECIMI KENDI UZERINE DUSURUYOR MU?
            //
            // Iki hal var ve ikisi de ayni sonucu veriyor: ayna duzlemi tam
            // kirislerin uzerinden geciyorsa dugumler yerinde kalir; secimin
            // KENDI ortasindan geciyorsa dugumler yer degistirir ama KUME ayni
            // kalir (1 -> 5, 5 -> 1). Her iki halde de var olan kirislerin
            // USTUNE ikinci bir takim kurulur: ekranda hicbir sey degismis
            // gorunmez, ama model iki kat rijittir. Sessizce yanlis sonuc
            // veren turden bir hata - kopyadaki sifir oteleme korumasinin
            // ayni sebebi.
            //
            // Olcut tek tek dugumler DEGIL, sonucun kendisi: aynalanan her
            // kiris zaten varsa yapilacak bir sey yok. Kontrol dugum YARATMADAN
            // yapiliyor, yoksa vazgecince ortada oksuz dugumler kalirdi.
            {
                const cift = new Set();
                Object.values(model.elements).forEach(e => {
                    cift.add(e.n1 + '>' + e.n2);
                    cift.add(e.n2 + '>' + e.n1);
                });
                const deneme = {};
                nodesToMirror.forEach(id => {
                    const d = model.nodes[id];
                    if (!d) return;
                    const y = { x: d.x, y: d.y, z: kirisKotu(d) };
                    y[eksen] = 2 * mirrorPos - oku(d);
                    deneme[id] = findNodeAtLocation(y.x, y.y, y.z);
                });
                const hepsiVar = selectedBeamIds.every(id => {
                    const e = model.elements[id];
                    if (!e) return true;
                    const a = deneme[e.n1], b = deneme[e.n2];
                    return a !== null && b !== null && a !== undefined && b !== undefined &&
                           cift.has(a + '>' + b);
                });
                if (hepsiVar) {
                    showToast('Mirror lands on the selection itself - nothing would be added', 'warning');
                    return;
                }
            }

            const newBeamIds = [];
            const newNodeIds = [];
            const nodeMap = dugumleriTuret(nodesToMirror, d => {
                const y = { x: d.x, y: d.y, z: kirisKotu(d) };
                y[eksen] = 2 * mirrorPos - oku(d);
                return y;
            }, newNodeIds);

            kirisleriTuret(selectedBeamIds, nodeMap, newBeamIds);
            
            // If not keeping original, delete them
            if (!keepOriginal) {
                selectedBeamIds.forEach(id => delete model.elements[id]);
                nodesToMirror.forEach(id => {
                    const usedByOther = Object.values(model.elements).some(elem => 
                        elem.n1 === id || elem.n2 === id
                    );
                    if (!usedByOther) delete model.nodes[id];
                });
            }
            
            // Select new elements
            clearSelection();
            newBeamIds.forEach(id => selectedElements.add(id));
            newNodeIds.forEach(id => selectedElements.add(id));
            
            results = null;
            if (currentViewMode === '3d') update3DScene();
            else draw();
            
            updateEntityInfoPanel();
            saveState();
            closeMirrorModal();
            showToast(`Mirrored ${newBeamIds.length} beams - ${eksen.toUpperCase()} flipped about ${mirrorPos.toFixed(3)}`);
        }
        
        // ----- SPLIT MODAL -----
        function showSplitModal() {
            const selectedBeamIds = getSelectedBeamIds();
            
            if (selectedBeamIds.length === 0) {
                showToast('Select a beam to split first', 'warning');
                return;
            }
            
            if (selectedBeamIds.length > 1) {
                showToast('Select only one beam to split', 'warning');
                return;
            }
            
            const elemId = selectedBeamIds[0];
            const elem = model.elements[elemId];
            if (!elem) {
                showToast('Beam not found', 'error');
                return;
            }
            
            const n1 = model.nodes[elem.n1];
            const n2 = model.nodes[elem.n2];
            
            if (!n1 || !n2) {
                showToast('Beam nodes not found', 'error');
                return;
            }
            
            // Kiris boyu UC BOYUTLU. Egik bir kirisi planda olcmek onu
            // kisaltir; "0.6 m'den bol" dendiginde yanlis yere dugum acardi.
            const length = Math.hypot(n2.x - n1.x, n2.y - n1.y, kirisKotu(n2) - kirisKotu(n1));

            const beamNameEl = document.getElementById('splitBeamName');
            const beamLengthEl = document.getElementById('splitBeamLength');
            const distanceInput = document.getElementById('splitDistance');
            
            if (beamNameEl) beamNameEl.textContent = `E${elemId} (${elem.section})`;
            if (beamLengthEl) beamLengthEl.textContent = length.toFixed(3) + ' m';
            if (distanceInput) distanceInput.max = (length - 0.01).toFixed(2);
            
            const modal = pencereAc('splitModal');
            if (!modal) {
                showToast('Split modal not found', 'error');
                return;
            }
            
            // Reset selections
            document.querySelectorAll('#splitModal .modal-radio-item').forEach(item => {
                item.classList.remove('selected');
            });
            
            const midpointRadio = document.querySelector('#splitModal input[value="midpoint"]');
            if (midpointRadio) {
                midpointRadio.checked = true;
                midpointRadio.closest('.modal-radio-item')?.classList.add('selected');
            }
        }
        
        function closeSplitModal() { pencereKapat('splitModal'); }
        
        function selectSplitMethod(method) {
            document.querySelectorAll('#splitModal input[name="splitMethod"]').forEach(input => {
                const item = input.closest('.modal-radio-item');
                if (item) item.classList.remove('selected');
                if (input.value === method) {
                    input.checked = true;
                    if (item) item.classList.add('selected');
                }
            });
        }
        
        function executeSplit() {
            const methodInput = document.querySelector('#splitModal input[name="splitMethod"]:checked');
            const method = methodInput?.value || 'midpoint';
            
            const selectedBeamIds = getSelectedBeamIds();
            
            if (selectedBeamIds.length !== 1) {
                closeSplitModal();
                showToast('Select exactly one beam', 'warning');
                return;
            }
            
            const elemId = selectedBeamIds[0];
            const elem = model.elements[elemId];
            if (!elem) {
                closeSplitModal();
                return;
            }
            
            const n1 = model.nodes[elem.n1];
            const n2 = model.nodes[elem.n2];
            
            if (!n1 || !n2) {
                closeSplitModal();
                return;
            }
            
            const dx = n2.x - n1.x;
            const dy = n2.y - n1.y;
            const dz = kirisKotu(n2) - kirisKotu(n1);
            const length = Math.hypot(dx, dy, dz);

            let splitPoints = []; // Ratios where to split (0 to 1)
            
            if (method === 'midpoint') {
                splitPoints = [0.5];
            } else if (method === 'ratio') {
                const ratio = parseFloat(document.getElementById('splitRatio')?.value) || 0.5;
                splitPoints = [Math.max(0.01, Math.min(0.99, ratio))];
            } else if (method === 'distance') {
                const dist = parseFloat(document.getElementById('splitDistance')?.value) || 1;
                const ratio = dist / length;
                splitPoints = [Math.max(0.01, Math.min(0.99, ratio))];
            } else if (method === 'equal') {
                const parts = parseInt(document.getElementById('splitParts')?.value) || 2;
                for (let i = 1; i < parts; i++) {
                    splitPoints.push(i / parts);
                }
            }
            
            // Sort split points
            splitPoints.sort((a, b) => a - b);
            
            // Create new nodes at split points
            const newNodes = [];
            splitPoints.forEach(ratio => {
                const newX = n1.x + dx * ratio;
                const newY = n1.y + dy * ratio;
                const newZ = kirisKotu(n1) + dz * ratio;

                // Check if node exists at this location
                const existingNodeId = findNodeAtLocation(newX, newY, newZ);
                if (existingNodeId !== null) {
                    newNodes.push(existingNodeId);
                } else {
                    const newId = nextNodeId++;
                    model.nodes[newId] = { id: newId, x: newX, y: newY, z: newZ };
                    newNodes.push(newId);
                }
            });
            
            // Create new beams
            const newBeamIds = [];
            let prevNodeId = elem.n1;
            
            newNodes.forEach(nodeId => {
                const newElemId = nextElementId++;
                model.elements[newElemId] = {
                    id: newElemId,
                    n1: prevNodeId,
                    n2: nodeId,
                    section: elem.section,
                    orientation: elem.orientation || 0,
                    lineLoads: []
                };
                newBeamIds.push(newElemId);
                prevNodeId = nodeId;
            });
            
            // Last segment
            const lastElemId = nextElementId++;
            model.elements[lastElemId] = {
                id: lastElemId,
                n1: prevNodeId,
                n2: elem.n2,
                section: elem.section,
                orientation: elem.orientation || 0,
                lineLoads: []
            };
            newBeamIds.push(lastElemId);
            
            // Delete original beam
            delete model.elements[elemId];
            
            // Select new elements
            clearSelection();
            newBeamIds.forEach(id => selectedElements.add(id));
            newNodes.forEach(id => selectedElements.add(id));
            
            results = null;
            if (currentViewMode === '3d') update3DScene();
            else draw();
            
            updateEntityInfoPanel();
            saveState();
            closeSplitModal();
            showToast(`Split into ${newBeamIds.length} segments`);
        }
        
        // Legacy function for backward compatibility
        function duplicateSelected() {
            showCopyModal();
        }
        
        function duplicateSelectedBeam() {
            showCopyModal();
        }
        
        function mirrorSelected(axis) {
            // Quick mirror without modal - for backward compatibility
            const selectedBeamIds = getSelectedBeamIds();
            if (selectedBeamIds.length === 0) {
                showToast('Select beams to mirror first', 'warning');
                return;
            }
            showMirrorModal();
        }
        
        function mirrorSelectedBeam(axis) {
            showMirrorModal();
        }
        
        function splitSelectedBeam() {
            showSplitModal();
        }
        
        // ============== SELECT BY SECTION ==============
        function selectBySection() {
            // Get currently selected beam's section
            const selectedBeams = Array.from(selectedElements).filter(id => model.elements[id]);
            
            if (selectedBeams.length === 0) {
                // Show dialog to select section
                const sections = [...new Set(Object.values(model.elements).map(e => e.section))];
                if (sections.length === 0) {
                    showToast('No beams in model', 'warning');
                    return;
                }
                
                const section = prompt('Enter section name to select:\n' + sections.join('\n'));
                if (section) selectAllBySection(section);
                return;
            }
            
            // Use first selected beam's section
            const section = model.elements[selectedBeams[0]].section;
            selectAllBySection(section);
        }
        
        function selectAllBySection(sectionName) {
            clearSelection();
            
            Object.entries(model.elements).forEach(([id, elem]) => {
                if (elem.section === sectionName) {
                    selectedElements.add(parseInt(id));
                    selectedElements.add(elem.n1);
                    selectedElements.add(elem.n2);
                }
            });
            
            if (currentViewMode === '3d') update3DScene();
            else draw();
            
            updateEntityInfoPanel();
            showToast(`Selected ${Array.from(selectedElements).filter(id => model.elements[id]).length} beams with section ${sectionName}`);
        }
        
        // ============== CONTEXT MENU ==============
        let contextMenuTarget = null;
        
        function showContextMenu(e) {
            e.preventDefault();
            hideAllContextMenus();
            
            // Check what's under the cursor
            const rect = canvas.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;
            
            const clickedElem = getElementAtPosition(mouseX, mouseY);
            const clickedNode = getNodeAtPosition(mouseX, mouseY);
            
            // Calculate model position for context target
            const modelPos = screenToModel(mouseX, mouseY);
            
            if (clickedNode) {
                // Node context menu
                if (!selectedNodes.has(clickedNode.id)) {
                    clearSelection();
                    selectedNodes.add(clickedNode.id);
                    draw();
                    updateEntityInfoPanel();
                }
                ctxTarget = { type: 'node', elemId: null, nodeId: clickedNode.id, t: 0, x: modelPos.x, y: modelPos.y };
                showContextMenuAt('contextMenuNode', e.clientX, e.clientY);
            } else if (clickedElem) {
                // Beam context menu
                if (!selectedElements.has(clickedElem.id)) {
                    clearSelection();
                    selectedElements.add(clickedElem.id);
                    draw();
                    updateEntityInfoPanel();
                }
                // Calculate t parameter for split
                const beam = model.elements[clickedElem.id];
                let t = 0.5;
                if (beam) {
                    const n1 = model.nodes[beam.n1], n2 = model.nodes[beam.n2];
                    if (n1 && n2) {
                        const dx = n2.x - n1.x, dy = n2.y - n1.y;
                        const len = Math.sqrt(dx*dx + dy*dy);
                        if (len > 0.001) {
                            t = ((modelPos.x - n1.x) * dx + (modelPos.y - n1.y) * dy) / (len * len);
                            t = Math.max(0.05, Math.min(0.95, t));
                        }
                    }
                }
                ctxTarget = { type: 'beam', elemId: clickedElem.id, nodeId: null, t: t, x: modelPos.x, y: modelPos.y };
                cmdState.hoverBeam = clickedElem.id;
                cmdState.hoverPoint = { ratio: t, pointX: modelPos.x, pointY: modelPos.y };
                showContextMenuAt('contextMenu', e.clientX, e.clientY);
            } else {
                // Empty area context menu
                ctxTarget = { type: null, elemId: null, nodeId: null, t: 0, x: modelPos.x, y: modelPos.y };
                showContextMenuAt('contextMenuEmpty', e.clientX, e.clientY);
            }
        }
        
        // hideContextMenu artik js/commands/context.js icinde tek yerde durur
        // (hideAllContextMenus'a devreder). Buradaki dar surum zaten eziliyordu.
        
        function contextMenuAction(action) {
            hideContextMenu();
            
            switch(action) {
                case 'copy':
                    showCopyModal();
                    break;
                case 'split':
                    showSplitModal();
                    break;
                case 'mirror':
                    showMirrorModal();
                    break;
                case 'selectSame':
                    selectBySection();
                    break;
                case 'properties':
                    // Focus on entity info panel
                    document.getElementById('rightPanel')?.scrollTo(0, 0);
                    break;
                case 'delete':
                    deleteSelected();
                    break;
            }
        }
        
        // ============== TOAST NOTIFICATION SYSTEM ==============
        let toastCounter = 0;
        let selectionMode = 'all'; // 'all', 'nodes', 'beams'
        
        function setSelectionMode(mode) {
            selectionMode = mode;
            document.querySelectorAll('.selection-mode button').forEach(btn => {
                btn.classList.remove('active');
            });
            document.getElementById(`selMode${mode.charAt(0).toUpperCase() + mode.slice(1)}`).classList.add('active');
            updateStatusBar();
        }
        
        function updateStatusBar(message, type) {
            const statusMsg = document.getElementById('statusMessage');
            if (statusMsg && message) {
                // Strip HTML tags for status bar
                const plainText = message.replace(/<[^>]*>/g, '');
                
                // Add icon based on type
                const icons = {
                    success: '✓',
                    error: '✕',
                    warning: '⚠',
                    info: 'ℹ'
                };
                const icon = icons[type] || '';
                
                statusMsg.innerHTML = icon ? `<span style="margin-right:8px;">${icon}</span>${plainText}` : plainText;
                statusMsg.className = 'status-message ' + (type || '');
                
                // Clear after 8 seconds for success/info, keep error/warning longer
                const clearTime = (type === 'error' || type === 'warning') ? 15000 : 8000;
                setTimeout(() => {
                    if (statusMsg.textContent.includes(plainText.substring(0, 20))) {
                        statusMsg.innerHTML = 'Ready';
                        statusMsg.className = 'status-message';
                    }
                }, clearTime);
            }
            
            // Update selection count
            const statusSel = document.getElementById('statusSelection');
            if (statusSel) {
                const nodeCount = selectedNodes.size;
                const beamCount = selectedElements.size;
                statusSel.textContent = `Sel: ${nodeCount}N ${beamCount}B`;
            }
        }
        
        // zorlaGoster: hata disi bir mesaji da balon olarak gosterir. Durum
        // cubugu surekli updateCommandUI tarafindan uzerine yazildigi icin,
        // gorulmesi gereken bir bildirim (ornegin "onceki modelin geri
        // yuklendi") orada saniyeler icinde kayboluyordu.
        function showToast(message, type = 'success', duration = 3000, zorlaGoster = false) {
            // Backward compatibility for old calls
            if (type === true) type = 'error';
            if (type === false) type = 'success';
            
            // Always update status bar for all message types
            updateStatusBar(message, type);
            
            // Only show popup toast for errors (critical issues need attention)
            if (type !== 'error' && !zorlaGoster) {
                return; // Success, warning, info only shows in status bar
            }
            
            const container = document.getElementById('toastContainer');
            const id = `toast-${++toastCounter}`;
            
            const icons = {
                success: '<span class="icon"><svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg></span>',
                error: '<span class="icon"><svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></span>',
                warning: '<span class="icon"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg></span>',
                info: 'ℹ'
            };
            
            const titles = {
                success: 'Success',
                error: 'Error',
                warning: 'Warning',
                info: 'Info'
            };
            
            const toast = document.createElement('div');
            toast.id = id;
            toast.className = `toast ${type}`;
            toast.style.position = 'relative';
            toast.innerHTML = `
                <span class="toast-icon">${icons[type] || icons.info}</span>
                <div class="toast-content">
                    <div class="toast-title">${titles[type] || titles.info}</div>
                    <div class="toast-message">${message}</div>
                </div>
                <button class="toast-close" onclick="dismissToast('${id}')">&times;</button>
                <div class="toast-progress" style="animation-duration: ${duration}ms; color: var(--accent-${type === 'error' ? 'danger' : type});"></div>
            `;
            
            container.appendChild(toast);
            
            // Trigger animation
            requestAnimationFrame(() => {
                toast.classList.add('show');
            });
            
            // Auto dismiss
            setTimeout(() => dismissToast(id), duration);
            
            return id;
        }
        
        function dismissToast(id) {
            const toast = document.getElementById(id);
            if (toast) {
                toast.classList.remove('show');
                toast.classList.add('hiding');
                setTimeout(() => toast.remove(), 300);
            }
        }
        
        // ============== LOADING OVERLAY ==============
        function showLoading(message = 'Processing...') {
            const overlay = document.getElementById('loadingOverlay');
            const text = document.getElementById('loadingText');
            if (text) text.textContent = message;
            if (overlay) overlay.classList.add('active');
        }
        
        function hideLoading() {
            const overlay = document.getElementById('loadingOverlay');
            if (overlay) overlay.classList.remove('active');
        }
        
        // ============== DXF HELP MODAL ==============
        function showDXFHelp() {
            const modal = document.getElementById('dxfHelpModal');
            if (modal) {
                modal.classList.add('active');
                document.body.style.overflow = 'hidden';
            }
        }
        
        function closeDXFHelp(event) {
            // If called from overlay click, only close if clicking the overlay itself
            if (event && event.target !== event.currentTarget) return;
            
            const modal = document.getElementById('dxfHelpModal');
            if (modal) {
                modal.classList.remove('active');
                document.body.style.overflow = '';
            }
        }
        
        // ============== IMPORT SECTION GEOMETRY ==============
        let importedSectionData = null;
        
        function openImportGeometryModal() {
            document.getElementById('importGeometryModal').classList.add('active');
            document.body.style.overflow = 'hidden';
            
            // Reset state
            importedSectionData = null;
            document.getElementById('sectionDXFFile').value = '';
            document.getElementById('sectionFileName').textContent = '';
            document.getElementById('sectionImportPreview').style.display = 'none';
            document.getElementById('importedSectionName').value = '';
            document.getElementById('saveImportedSectionBtn').disabled = true;
        }
        
        function closeImportGeometryModal(event) {
            if (event && event.target !== event.currentTarget) return;
            document.getElementById('importGeometryModal').classList.remove('active');
            document.body.style.overflow = '';
        }
        
        function handleSectionDXFImport(event) {
            const file = event.target.files[0];
            if (!file) return;
            
            document.getElementById('sectionFileName').textContent = file.name;
            
            const reader = new FileReader();
            reader.onload = function(e) {
                try {
                    const content = e.target.result;
                    const geometry = parseSectionDXF(content);
                    
                    debugLog('Parsed geometry:', geometry);
                    
                    if (!geometry || geometry.points.length < 3) {
                        let errorMsg = 'Could not find valid geometry in DXF file.';
                        if (geometry && geometry.hasRegion) {
                            errorMsg = 'REGION entity found but geometry could not be extracted. Please EXPLODE the REGION in AutoCAD and save as LINE/POLYLINE.';
                        }
                        showToast(errorMsg, 'error', 6000);
                        document.getElementById('sectionImportPreview').style.display = 'none';
                        document.getElementById('saveImportedSectionBtn').disabled = true;
                        return;
                    }
                    
                    // Calculate section properties
                    const props = calculateSectionPropertiesFromPolygon(geometry.points);
                    
                    if (!props || props.A <= 0) {
                        showToast('Could not calculate section properties. Check geometry.', 'error');
                        return;
                    }
                    
                    // Store for saving
                    importedSectionData = {
                        points: geometry.points,
                        properties: props,
                        hasRegion: geometry.hasRegion
                    };
                    
                    // Display preview and properties
                    displaySectionImportResults(geometry.points, props);
                    
                    // Enable save button
                    document.getElementById('saveImportedSectionBtn').disabled = false;
                    
                    // Generate suggested name
                    const heightMM = Math.round(props.height * 1000);
                    const widthMM = Math.round(props.width * 1000);
                    document.getElementById('importedSectionName').value = `CUSTOM_${heightMM}x${widthMM}`;
                    
                    if (geometry.hasRegion) {
                        showToast('<span class="icon"><svg viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></span> REGION detected - geometry approximated from bounding box', 'warning', 5000);
                    }
                    
                } catch (err) {
                    debugError('DXF parse error:', err);
                    showToast('Error parsing DXF: ' + err.message, 'error');
                    document.getElementById('sectionImportPreview').style.display = 'none';
                    document.getElementById('saveImportedSectionBtn').disabled = true;
                }
            };
            reader.readAsText(file);
        }
        
        function parseSectionDXF(content) {
            // Parse DXF properly - group codes have leading spaces
            const rawLines = content.split(/\r?\n/);
            
            // Create pairs of (code, value)
            const pairs = [];
            for (let i = 0; i < rawLines.length - 1; i += 2) {
                const code = parseInt(rawLines[i].trim());
                const value = rawLines[i + 1] ? rawLines[i + 1].trim() : '';
                pairs.push({ code, value });
            }
            
            const points = [];
            let extMin = null, extMax = null;
            let hasRegion = false;
            let acisHexData = '';
            
            let i = 0;
            while (i < pairs.length) {
                const { code, value } = pairs[i];
                
                // Check for EXTMIN
                if (code === 9 && value === '$EXTMIN') {
                    i++;
                    let x = 0, y = 0;
                    while (i < pairs.length && !(pairs[i].code === 9 && pairs[i].value.startsWith('$'))) {
                        if (pairs[i].code === 10) x = parseFloat(pairs[i].value);
                        if (pairs[i].code === 20) y = parseFloat(pairs[i].value);
                        i++;
                    }
                    extMin = { x, y };
                    continue;
                }
                
                // Check for EXTMAX
                if (code === 9 && value === '$EXTMAX') {
                    i++;
                    let x = 0, y = 0;
                    while (i < pairs.length && !(pairs[i].code === 9 && pairs[i].value.startsWith('$'))) {
                        if (pairs[i].code === 10) x = parseFloat(pairs[i].value);
                        if (pairs[i].code === 20) y = parseFloat(pairs[i].value);
                        i++;
                    }
                    extMax = { x, y };
                    continue;
                }
                
                // Check for REGION entity
                if (code === 0 && value === 'REGION') {
                    hasRegion = true;
                }
                
                // Collect ACIS binary data (group code 310)
                if (code === 310) {
                    acisHexData += value;
                }
                
                // LINE entity
                if (code === 0 && value === 'LINE') {
                    let x1 = 0, y1 = 0, x2 = 0, y2 = 0;
                    i++;
                    while (i < pairs.length && pairs[i].code !== 0) {
                        if (pairs[i].code === 10) x1 = parseFloat(pairs[i].value);
                        if (pairs[i].code === 20) y1 = parseFloat(pairs[i].value);
                        if (pairs[i].code === 11) x2 = parseFloat(pairs[i].value);
                        if (pairs[i].code === 21) y2 = parseFloat(pairs[i].value);
                        i++;
                    }
                    points.push({ x: x1, y: y1 });
                    points.push({ x: x2, y: y2 });
                    continue;
                }
                
                // LWPOLYLINE entity
                if (code === 0 && value === 'LWPOLYLINE') {
                    i++;
                    while (i < pairs.length && pairs[i].code !== 0) {
                        if (pairs[i].code === 10) {
                            const x = parseFloat(pairs[i].value);
                            // Find corresponding Y
                            let j = i + 1;
                            while (j < pairs.length && pairs[j].code !== 10 && pairs[j].code !== 0) {
                                if (pairs[j].code === 20) {
                                    const y = parseFloat(pairs[j].value);
                                    points.push({ x, y });
                                    break;
                                }
                                j++;
                            }
                        }
                        i++;
                    }
                    continue;
                }
                
                // POLYLINE with VERTEX
                if (code === 0 && value === 'POLYLINE') {
                    i++;
                    while (i < pairs.length) {
                        if (pairs[i].code === 0 && pairs[i].value === 'VERTEX') {
                            let vx = 0, vy = 0;
                            i++;
                            while (i < pairs.length && pairs[i].code !== 0) {
                                if (pairs[i].code === 10) vx = parseFloat(pairs[i].value);
                                if (pairs[i].code === 20) vy = parseFloat(pairs[i].value);
                                i++;
                            }
                            points.push({ x: vx, y: vy });
                        } else if (pairs[i].code === 0 && pairs[i].value === 'SEQEND') {
                            i++;
                            break;
                        } else {
                            i++;
                        }
                    }
                    continue;
                }
                
                i++;
            }
            
            // If we found a REGION with ACIS data, try to extract points from it
            if (hasRegion && acisHexData.length > 0 && points.length < 3) {
                debugLog('Parsing ACIS data from REGION...');
                const acisPoints = parseACISPoints(acisHexData);
                if (acisPoints.length >= 3) {
                    points.push(...acisPoints);
                    debugLog('Extracted', acisPoints.length, 'points from ACIS data');
                }
            }
            
            // Fallback: use bounding box if still no points
            if (hasRegion && points.length < 3 && extMin && extMax) {
                debugLog('Using bounding box as fallback');
                points.push({ x: extMin.x, y: extMin.y });
                points.push({ x: extMax.x, y: extMin.y });
                points.push({ x: extMax.x, y: extMax.y });
                points.push({ x: extMin.x, y: extMax.y });
            }
            
            debugLog('Parsed points count:', points.length);
            
            // Remove duplicate points
            const uniquePoints = [];
            const tolerance = 0.01;
            for (const p of points) {
                if (isNaN(p.x) || isNaN(p.y)) continue;
                const exists = uniquePoints.some(up => 
                    Math.abs(up.x - p.x) < tolerance && Math.abs(up.y - p.y) < tolerance
                );
                if (!exists) {
                    uniquePoints.push(p);
                }
            }
            
            debugLog('Unique points count:', uniquePoints.length);
            
            // Sort points to form closed polygon (convex hull approach)
            if (uniquePoints.length >= 3) {
                const cx = uniquePoints.reduce((s, p) => s + p.x, 0) / uniquePoints.length;
                const cy = uniquePoints.reduce((s, p) => s + p.y, 0) / uniquePoints.length;
                
                uniquePoints.sort((a, b) => {
                    const angleA = Math.atan2(a.y - cy, a.x - cx);
                    const angleB = Math.atan2(b.y - cy, b.x - cx);
                    return angleA - angleB;
                });
            }
            
            return { points: uniquePoints, hasRegion, extMin, extMax };
        }
        
        // Parse ACIS binary data to extract point coordinates
        function parseACISPoints(hexData) {
            const points = [];
            
            try {
                // Convert hex string to byte array
                const bytes = [];
                for (let i = 0; i < hexData.length; i += 2) {
                    bytes.push(parseInt(hexData.substr(i, 2), 16));
                }
                
                // Look for "point" keyword pattern in ACIS data
                // "point" in hex: 706F696E74
                const pointPattern = [0x70, 0x6F, 0x69, 0x6E, 0x74]; // "point"
                
                for (let i = 0; i < bytes.length - 30; i++) {
                    // Check for pattern: length byte (05) + "point"
                    if (bytes[i] === 0x05 && 
                        bytes[i+1] === 0x70 && bytes[i+2] === 0x6F && 
                        bytes[i+3] === 0x69 && bytes[i+4] === 0x6E && bytes[i+5] === 0x74) {
                        
                        // Skip past "point" and look for coordinate marker (0x13)
                        let j = i + 6;
                        while (j < bytes.length - 24 && bytes[j] !== 0x13) {
                            j++;
                        }
                        
                        if (bytes[j] === 0x13 && j + 25 <= bytes.length) {
                            // Read 3 doubles (24 bytes) - X, Y, Z coordinates
                            const x = readDouble(bytes, j + 1);
                            const y = readDouble(bytes, j + 9);
                            // z = readDouble(bytes, j + 17); // We don't need Z
                            
                            if (isFinite(x) && isFinite(y) && Math.abs(x) < 100000 && Math.abs(y) < 100000) {
                                points.push({ x, y });
                            }
                        }
                    }
                }
                
                // Also look for vertex coordinates in "vertex" entities
                // "vertex" in hex: 766572746578
                for (let i = 0; i < bytes.length - 30; i++) {
                    if (bytes[i] === 0x06 && 
                        bytes[i+1] === 0x76 && bytes[i+2] === 0x65 && bytes[i+3] === 0x72 &&
                        bytes[i+4] === 0x74 && bytes[i+5] === 0x65 && bytes[i+6] === 0x78) {
                        
                        // Look for coordinate marker
                        let j = i + 7;
                        let foundCoords = false;
                        while (j < bytes.length - 24 && !foundCoords) {
                            if (bytes[j] === 0x13) {
                                const x = readDouble(bytes, j + 1);
                                const y = readDouble(bytes, j + 9);
                                
                                if (isFinite(x) && isFinite(y) && Math.abs(x) < 100000 && Math.abs(y) < 100000) {
                                    // Check if this point is already in the list
                                    const exists = points.some(p => 
                                        Math.abs(p.x - x) < 0.01 && Math.abs(p.y - y) < 0.01
                                    );
                                    if (!exists) {
                                        points.push({ x, y });
                                    }
                                    foundCoords = true;
                                }
                            }
                            j++;
                        }
                    }
                }
                
            } catch (e) {
                debugError('ACIS parse error:', e);
            }
            
            return points;
        }
        
        // Read IEEE 754 double from byte array (little-endian)
        function readDouble(bytes, offset) {
            const buffer = new ArrayBuffer(8);
            const view = new DataView(buffer);
            for (let i = 0; i < 8; i++) {
                view.setUint8(i, bytes[offset + i]);
            }
            return view.getFloat64(0, true); // little-endian
        }
        
        function calculateSectionPropertiesFromPolygon(points) {
            if (points.length < 3) return null;
            
            // Ensure points form a closed polygon
            const pts = [...points];
            
            // Find bounding box
            let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
            for (const p of pts) {
                minX = Math.min(minX, p.x);
                maxX = Math.max(maxX, p.x);
                minY = Math.min(minY, p.y);
                maxY = Math.max(maxY, p.y);
            }
            
            // Convert to meters if input seems to be in mm
            let scale = 1;
            const width = maxX - minX;
            const height = maxY - minY;
            if (width > 10 || height > 10) {
                // Assume mm, convert to m
                scale = 0.001;
            }
            
            // Scale and shift so min is at origin
            const scaledPts = pts.map(p => ({
                x: (p.x - minX) * scale,
                y: (p.y - minY) * scale
            }));
            
            const H = (maxY - minY) * scale;  // Total height
            const W = (maxX - minX) * scale;  // Total width
            
            // Flip Y so that Y=0 is at TOP (effective breadth convention)
            // After flip: top of section is at y=0, bottom at y=H
            const flippedPts = scaledPts.map(p => ({
                x: p.x,
                y: H - p.y
            }));
            
            // Calculate area using shoelace formula
            let A = 0;
            const n = flippedPts.length;
            for (let i = 0; i < n; i++) {
                const j = (i + 1) % n;
                A += flippedPts[i].x * flippedPts[j].y;
                A -= flippedPts[j].x * flippedPts[i].y;
            }
            A = Math.abs(A) / 2;
            
            // Calculate centroid
            let Cx = 0, Cy = 0;
            for (let i = 0; i < n; i++) {
                const j = (i + 1) % n;
                const f = flippedPts[i].x * flippedPts[j].y - flippedPts[j].x * flippedPts[i].y;
                Cx += (flippedPts[i].x + flippedPts[j].x) * f;
                Cy += (flippedPts[i].y + flippedPts[j].y) * f;
            }
            Cx = Math.abs(Cx) / (6 * A);
            Cy = Math.abs(Cy) / (6 * A);
            
            // Calculate second moments of area about centroid
            // Using Green's theorem
            let Ixx = 0, Iyy = 0;
            for (let i = 0; i < n; i++) {
                const j = (i + 1) % n;
                const xi = flippedPts[i].x - Cx;
                const yi = flippedPts[i].y - Cy;
                const xj = flippedPts[j].x - Cx;
                const yj = flippedPts[j].y - Cy;
                
                const cross = xi * yj - xj * yi;
                Ixx += (yi * yi + yi * yj + yj * yj) * cross;
                Iyy += (xi * xi + xi * xj + xj * xj) * cross;
            }
            Ixx = Math.abs(Ixx) / 12;  // Iy (about horizontal axis through centroid)
            Iyy = Math.abs(Iyy) / 12;  // Iz (about vertical axis through centroid)
            
            // Distance from centroid to extreme fibers
            // Cy is distance from TOP (y=0) to centroid
            const yTop = Cy;              // Distance from NA to top
            const yBot = H - Cy;          // Distance from NA to bottom
            
            // Section moduli
            const Wy_top = Ixx / yTop;    // For stress at top (plate side)
            const Wy_bot = Ixx / yBot;    // For stress at bottom (stiffener side)
            
            // Torsion constant (approximate for thin-walled)
            const J = (A * A) / (W + H);  // Rough approximation
            
            return {
                A: A,                  // m²
                Iy: Ixx,               // m⁴ (about horizontal/strong axis)
                Iz: Iyy,               // m⁴ (about vertical/weak axis)
                Wy_top: Wy_top,        // m³
                Wy_bot: Wy_bot,        // m³
                Wy: Math.min(Wy_top, Wy_bot),  // Conservative
                J: J,                  // m⁴
                centroidFromTop: Cy,   // m
                height: H,             // m
                width: W,              // m
                points: flippedPts     // For drawing
            };
        }
        
        function displaySectionImportResults(originalPoints, props) {
            document.getElementById('sectionImportPreview').style.display = 'block';
            
            // Display properties
            document.getElementById('secPropA').textContent = (props.A * 1e4).toFixed(2) + ' cm²';
            document.getElementById('secPropIy').textContent = (props.Iy * 1e8).toFixed(1) + ' cm⁴';
            document.getElementById('secPropIz').textContent = (props.Iz * 1e8).toFixed(1) + ' cm⁴';
            document.getElementById('secPropWyTop').textContent = (props.Wy_top * 1e6).toFixed(1) + ' cm³';
            document.getElementById('secPropWyBot').textContent = (props.Wy_bot * 1e6).toFixed(1) + ' cm³';
            document.getElementById('secPropCentroid').textContent = (props.centroidFromTop * 1000).toFixed(1) + ' mm';
            document.getElementById('secPropHeight').textContent = (props.height * 1000).toFixed(1) + ' mm';
            
            // Draw preview
            drawSectionPreview(props.points, props);
        }
        
        function drawSectionPreview(points, props) {
            const svg = document.getElementById('sectionPreviewSVG');
            if (!svg || points.length < 3) return;
            
            const svgWidth = 300;
            const svgHeight = 220;
            const padding = 30;
            
            // Scale to fit
            const W = props.width;
            const H = props.height;
            const scaleX = (svgWidth - 2 * padding) / W;
            const scaleY = (svgHeight - 2 * padding) / H;
            const scale = Math.min(scaleX, scaleY);
            
            // Center offset
            const offsetX = (svgWidth - W * scale) / 2;
            const offsetY = padding;
            
            // Transform points to SVG coords
            const svgPoints = points.map(p => ({
                x: offsetX + p.x * scale,
                y: offsetY + p.y * scale
            }));
            
            // Create path
            let pathD = `M ${svgPoints[0].x} ${svgPoints[0].y}`;
            for (let i = 1; i < svgPoints.length; i++) {
                pathD += ` L ${svgPoints[i].x} ${svgPoints[i].y}`;
            }
            pathD += ' Z';
            
            // Centroid position in SVG
            const centroidY = offsetY + props.centroidFromTop * scale;
            
            svg.innerHTML = `
                <!-- Grid -->
                <defs>
                    <pattern id="secGrid" width="20" height="20" patternUnits="userSpaceOnUse">
                        <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#334155" stroke-width="0.5"/>
                    </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#secGrid)"/>
                
                <!-- Section shape -->
                <path d="${pathD}" fill="var(--primary)" fill-opacity="0.3" stroke="var(--primary)" stroke-width="2"/>
                
                <!-- Neutral axis -->
                <line x1="${padding - 10}" y1="${centroidY}" x2="${svgWidth - padding + 10}" y2="${centroidY}" 
                      stroke="var(--success)" stroke-width="1.5" stroke-dasharray="5,3"/>
                <text x="${svgWidth - padding + 5}" y="${centroidY - 5}" fill="var(--success)" font-size="10">NA</text>
                
                <!-- Top label (plate side) -->
                <text x="${svgWidth / 2}" y="${offsetY - 8}" fill="var(--primary)" font-size="11" text-anchor="middle">
                    <span class="icon"><svg viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg></span> Plate (top)
                </text>
                
                <!-- Height dimension -->
                <line x1="${padding - 15}" y1="${offsetY}" x2="${padding - 15}" y2="${offsetY + H * scale}" 
                      stroke="var(--text-2)" stroke-width="1"/>
                <text x="${padding - 20}" y="${offsetY + H * scale / 2}" fill="var(--text-2)" font-size="9" 
                      text-anchor="middle" transform="rotate(-90, ${padding - 20}, ${offsetY + H * scale / 2})">
                    ${(H * 1000).toFixed(0)} mm
                </text>
            `;
        }
        
        function saveImportedSection() {
            if (!importedSectionData) {
                showToast('No section data to save', 'error');
                return;
            }
            
            const name = document.getElementById('importedSectionName').value.trim();
            if (!name) {
                showToast('Please enter a section name', 'error');
                return;
            }
            
            // Check if name already exists
            if (SECTIONS[name]) {
                if (!confirm(`Section "${name}" already exists. Overwrite?`)) {
                    return;
                }
            }
            
            // Save to SECTIONS
            const props = importedSectionData.properties;
            SECTIONS[name] = {
                A: props.A,
                Iy: props.Iy,
                Iz: props.Iz,
                J: props.J,
                Wy: props.Wy,
                Wz: props.Iz / (props.width / 2),
                h: props.height,
                centroidY: props.height - props.centroidFromTop,  // From bottom for consistency
                Wy_top: props.Wy_top,
                Wy_bot: props.Wy_bot,
                isCustom: true,
                points: props.points
            };
            
            // Update UI
            updateProfilesTable();
            updateSectionDropdowns();
            closeImportGeometryModal();
            
            showToast(`Section "${name}" imported successfully!`, 'success');
        }
        
        // Close modal on Escape key
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
                closeDXFHelp();
                closeImportGeometryModal();
            }
        });
        
        function exportJSON() {
            if (Object.keys(model.nodes).length === 0) {
                showToast('No model to export!', 'error');
                return;
            }
            
            const data = { model, results };
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const filename = 'grillage_model.json';
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            // Recent listesi ancak burasi ve import besledigi surece dolu olur -
            // addToRecentFiles yazilmisti ama hicbir yerden cagrilmiyordu.
            if (typeof addToRecentFiles === 'function') addToRecentFiles(filename, model);

            showToast('Model exported successfully', 'success');
        }
        
        function importJSON(event) {
            const file = event.target.files[0];
            if (!file) return;
            
            showLoading('Importing model...');
            const reader = new FileReader();
            reader.onload = e => {
                try {
                    const data = safeJsonParse(e.target.result, null);
                    if (!data || !data.model) {
                        throw new Error('Invalid file format');
                    }
                    if (!isValidModelData(data.model)) {
                        throw new Error('Invalid model structure');
                    }
                    model = data.model;
                    results = data.results || null;
                    
                    // Recalculate nextNodeId and nextElementId
                    const nodeIds = Object.keys(model.nodes).map(id => parseInt(id));
                    const elemIds = Object.keys(model.elements).map(id => parseInt(id));
                    nextNodeId = nodeIds.length > 0 ? Math.max(...nodeIds) + 1 : 1;
                    nextElementId = elemIds.length > 0 ? Math.max(...elemIds) + 1 : 1;
                    
                    updateModelSummary();
                    if (results) displayResults();
                    fitView();
                    saveState(); // Save for undo
                    if (typeof addToRecentFiles === 'function') addToRecentFiles(file.name, model);
                    if (typeof updateEmptyState === 'function') updateEmptyState();
                    hideLoading();
                    showToast('Model imported successfully', 'success');
                } catch (err) {
                    hideLoading();
                    showToast('Import error: ' + err.message, 'error');
                }
            };
            reader.readAsText(file);
        }
        
