        // ============== SOLVER: DRIVER AND VALIDATION UI ==============
        // Kullaniciya bakan taraf: Solve dugmesi, model dogrulama, hata mesajlari ve
        // analitik kiyas vakalari. Sayisal cekirdek js/core/fem.js icinde.

        let skipValidation = false;
        
        function proceedWithSolve() {
            skipValidation = true;
            solveModel();
            skipValidation = false;
        }
        
        function solveModel() {
            if (Object.keys(model.nodes).length === 0) {
                showToast('No model defined!', 'error');
                return;
            }
            
            // Run validation unless skipped
            if (!skipValidation) {
                const issues = validateModelForSolver();
                
                if (issues.errors.length > 0 || issues.warnings.length > 0) {
                    showValidationModal(issues);
                    if (issues.errors.length > 0) {
                        return; // Block solving if errors exist
                    }
                    return; // Show modal for warnings, user decides
                }
            }
            
            const solveBtn = document.getElementById('solveBtn');
            solveBtn.disabled = true;
            solveBtn.classList.add('loading');
            solveBtn.innerHTML = '<span class="btn-text"><span class="icon"><svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg></span> Solve</span>';
            showLoading('Solving structural model...');
            
            setTimeout(() => {
                try {
                    results = solve();

                // Cozucu, adindan cozulebilen bir kesidi kutuphaneye KENDISI
                // ekler (fem.js -> layerToSection). Panel bunu ogrenmezse
                // "Sections 0" yazarken modelde kesit olur; kullanici hangisine
                // inanacagini bilemez. Kutuphane buyuduyse arayuz onu gostersin.
                if (typeof updateSectionDropdowns === 'function') updateSectionDropdowns();
                    modelChangedAfterSolve = false;
                    showResultsVisualization = true;
                    displayResults();
                    updateResultsWarning();
                    updateResultsBottomPanel();
                    
                    if (view.showStress) {
                        updateStressLegend();
                    }
                    
                    if (currentViewMode === '3d') {
                        update3DScene();
                    } else {
                        draw();
                    }

                    const maxDef = (results.maxDeflection * 1000).toFixed(2);
                    showToast(`<span class="icon"><svg viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg></span> Analysis complete! Max deflection: ${maxDef} mm`, 'success');
                    
                    switchMainTab('results');

                    // Kamera OLDUGU GIBI kalir. Burada fitView() cagriliyordu:
                    // sonuc paneli acilinca tuval alcaliyor, model panelin
                    // arkasinda kalmasin diye. Ama bu, kullanicinin kendi
                    // kurdugu gorunusu her Solve'da sifirliyor; yakinlastirip
                    // bir detaya bakarken cozdurunce goruntu ziplayip
                    // uzaklasiyordu. Tuval kuculuyorsa yalnizca goruntu orani
                    // ve render boyutu guncellenir - cerceve korunur.
                    // Modeli yeniden cerceveletmek isteyen Fit dugmesine basar.
                    if (typeof syncPanelLayout === 'function') syncPanelLayout();
                } catch (e) {
                    // Enhanced error messages
                    const errorMsg = parsesolverError(e);
                    showToast(errorMsg, 'error');
                    debugError(e);
                }
                
                hideLoading();
                solveBtn.disabled = false;
                solveBtn.classList.remove('loading');
                solveBtn.innerHTML = '<span class="icon"><svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg></span> Solve';
            }, 100);
        }
        
        // ============== SOLVER VALIDATION (regression test) ==============
        // Solves classic beam cases with the real solve() and compares against
        // closed-form solutions. Does not disturb the user's model (sets up a
        // temporary model + section, then restores them).
        function validateSolver() {
            const L = 6, w = 10, P = 50;        // m, kN/m, kN
            const SEC = '__VALIDATION__';
            // Kurtarma artik montajla ayni Timoshenko katsayilarini kullaniyor, bu yuzden
            // statik olarak belirli bu vakalar TAM cikar. Genis tolerans, bir daha
            // sapma olusursa onu gizlerdi.
            const TOL = 0.1;                     // %

            // Known section (Iy=1e-4 m⁴, Wy=1e-3 m³)
            const testSection = {
                A: 0.01, Iy: 1e-4, Iz: 1e-4, J: 2e-4,
                Wy: 1e-3, Wz: 1e-3, Aweb: 0.006, h: 0.2, tw: 0.01,
                A_cm2: 100, Iy_cm4: 1e4, Wy_cm3: 1e3, profileName: SEC, type: 'TEST'
            };

            const ALL = { Ux: true, Uy: true, Uz: true, Rx: true, Rz: true };       // simple support (Ry free)
            const FIX = { Ux: true, Uy: true, Uz: true, Rx: true, Ry: true, Rz: true }; // fixed

            const makeNodes = () => ({ 0: { x: 0, y: 0, z: 0 }, 1: { x: L, y: 0, z: 0 } });
            const udlElem = () => ({ 0: { n1: 0, n2: 1, section: SEC, orientation: 0,
                lineLoads: [{ value: w, startPct: 0, endPct: 100, angle: 90 }] } });
            const plainElem = () => ({ 0: { n1: 0, n2: 1, section: SEC, orientation: 0, lineLoads: [] } });

            const cases = [
                { name: 'Simply supported + UDL',  formula: 'wL²/8',  exact: w * L * L / 8,
                  nodes: makeNodes(), elements: udlElem(),   constraints: { 0: ALL, 1: ALL }, loads: [] },
                { name: 'Fixed-fixed + UDL',        formula: 'wL²/12', exact: w * L * L / 12,
                  nodes: makeNodes(), elements: udlElem(),   constraints: { 0: FIX, 1: FIX }, loads: [] },
                { name: 'Cantilever + tip load',    formula: 'P·L',    exact: P * L,
                  nodes: makeNodes(), elements: plainElem(), constraints: { 0: FIX }, loads: [{ nodeId: 1, Fz: -P }] },
                { name: 'Cantilever + UDL',         formula: 'wL²/2',  exact: w * L * L / 2,
                  nodes: makeNodes(), elements: udlElem(),   constraints: { 0: FIX }, loads: [] }
            ];

            // Backup
            const backup = { nodes: model.nodes, elements: model.elements,
                constraints: model.constraints, loads: model.loads, pressure: model.pressure };
            const hadTestSec = SECTIONS[SEC];
            SECTIONS[SEC] = testSection;

            const out = [];
            try {
                cases.forEach(c => {
                    model.nodes = c.nodes;
                    model.elements = c.elements;
                    model.constraints = c.constraints;
                    model.loads = c.loads;
                    model.pressure = [];
                    let computed = NaN, err = NaN, pass = false;
                    try {
                        const r = solve();
                        computed = Math.abs(r.maxMoment);          // kN·m
                        err = (computed - c.exact) / c.exact * 100;
                        pass = isFinite(err) && Math.abs(err) <= TOL;
                    } catch (e) { /* pass stays false */ }
                    out.push({ name: c.name, formula: c.formula, exact: c.exact,
                        computed, err, pass });
                });
            } finally {
                // Restore (in all cases)
                model.nodes = backup.nodes;
                model.elements = backup.elements;
                model.constraints = backup.constraints;
                model.loads = backup.loads;
                model.pressure = backup.pressure;
                if (hadTestSec) SECTIONS[SEC] = hadTestSec; else delete SECTIONS[SEC];
            }
            return out;
        }
        
        // Open validation panel (modal)
        function showSolverValidation() {
            let results;
            try {
                results = validateSolver();
            } catch (e) {
                showToast('Validation failed to run: ' + e.message, 'error');
                return;
            }
            const total = results.length;
            const passed = results.filter(r => r.pass).length;
            const allPass = passed === total;

            let rows = '';
            results.forEach(r => {
                const ok = r.pass;
                const comp = isFinite(r.computed) ? r.computed.toFixed(2) : '—';
                const errTxt = isFinite(r.err) ? (r.err >= 0 ? '+' : '') + r.err.toFixed(2) + '%' : '—';
                rows += `
                    <tr style="border-bottom:1px solid var(--border-subtle, #2a3344);">
                        <td style="padding:8px 8px;">
                            <div style="font-size:var(--fs-md); color:var(--text-primary,#e2e8f0);">${r.name}</div>
                            <div style="font-family:var(--font-mono,monospace); font-size:var(--fs-sm); color:var(--text-tertiary,var(--text-3)); margin-top:2px;">Mmax = ${r.formula}</div>
                        </td>
                        <td style="padding:8px 8px; text-align:right; font-family:var(--font-mono,monospace); font-size:var(--fs-md); color:var(--text-secondary,var(--text-2));">${r.exact.toFixed(2)}</td>
                        <td style="padding:8px 8px; text-align:right; font-family:var(--font-mono,monospace); font-size:var(--fs-md); color:#185FA5; font-weight:600;">${comp}</td>
                        <td style="padding:8px 8px; text-align:right; font-family:var(--font-mono,monospace); font-size:var(--fs-sm); color:var(--text-tertiary,var(--text-3));">${errTxt}</td>
                        <td style="padding:8px 8px; text-align:center;">
                            <span style="display:inline-block; padding:4px 8px; border-radius:var(--r-ctl); font-size:var(--fs-xs); font-weight:700; letter-spacing:0.04em; ${ok ? 'background:rgba(29,158,117,0.15); color:#1D9E75;' : 'background:rgba(163,45,45,0.15); color:#e05757;'}">${ok ? 'PASS' : 'FAIL'}</span>
                        </td>
                    </tr>`;
            });

            const headerGrad = allPass ? 'linear-gradient(135deg, #14532d, #166534)' : 'linear-gradient(135deg, #7f1d1d, #991b1b)';
            const summaryIcon = allPass
                ? '<svg viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>'
                : '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>';

            const html = `
                <div class="modal-overlay active" id="solverValidationModal" onclick="closeSolverValidation(event)">
                    <div class="modal" style="max-width:660px;" onclick="event.stopPropagation()">
                        <div class="modal-header" style="background:${headerGrad};">
                            <h2><span class="icon">${summaryIcon}</span> Solver Validation — ${passed}/${total} PASSED</h2>
                            <button class="modal-close" onclick="closeSolverValidation()">&times;</button>
                        </div>
                        <div class="modal-body" style="padding:20px; max-height:65vh; overflow-y:auto;">
                            <p style="font-size:var(--fs-md); color:var(--text-secondary,var(--text-2)); margin:0 0 16px 0; line-height:1.5;">
                                Classic beam cases are solved with the real solver and compared against <strong>analytical (closed-form)</strong> solutions.
                                Tolerance ±2% — small deviations come from Timoshenko shear deformation (physical, not an error).
                            </p>
                            <table style="width:100%; border-collapse:collapse;">
                                <thead>
                                    <tr style="border-bottom:2px solid var(--border-default,#334155);">
                                        <th style="padding:8px; text-align:left; font-size:var(--fs-xs); text-transform:uppercase; letter-spacing:0.06em; color:var(--text-tertiary,var(--text-3));">Case</th>
                                        <th style="padding:8px; text-align:right; font-size:var(--fs-xs); text-transform:uppercase; letter-spacing:0.06em; color:var(--text-tertiary,var(--text-3));">Expected</th>
                                        <th style="padding:8px; text-align:right; font-size:var(--fs-xs); text-transform:uppercase; letter-spacing:0.06em; color:var(--text-tertiary,var(--text-3));">Computed</th>
                                        <th style="padding:8px; text-align:right; font-size:var(--fs-xs); text-transform:uppercase; letter-spacing:0.06em; color:var(--text-tertiary,var(--text-3));">Error</th>
                                        <th style="padding:8px; text-align:center; font-size:var(--fs-xs); text-transform:uppercase; letter-spacing:0.06em; color:var(--text-tertiary,var(--text-3));">Status</th>
                                    </tr>
                                </thead>
                                <tbody>${rows}</tbody>
                            </table>
                            <div style="font-family:var(--font-mono,monospace); font-size:var(--fs-xs); color:var(--text-tertiary,var(--text-3)); margin-top:12px; text-align:right;">Values: Mmax [kN·m] &nbsp;·&nbsp; L=6m, w=10 kN/m, P=50 kN</div>
                        </div>
                        <div class="modal-footer">
                            <button class="btn-secondary" onclick="showSolverValidation(); closeSolverValidation();">Re-run</button>
                            <button class="btn-primary" onclick="closeSolverValidation()">Close</button>
                        </div>
                    </div>
                </div>`;
            closeSolverValidation();
            document.body.insertAdjacentHTML('beforeend', html);
        }

        function closeSolverValidation(event) {
            if (event && event.target !== event.currentTarget) return;
            const m = document.getElementById('solverValidationModal');
            if (m) m.remove();
        }
        
        // Enhanced error message parser
        function parsesolverError(error) {
            const msg = error.message || String(error);

            // ZATEN ACIK olan mesaji genellestirme.
            //
            // Asagidaki kaliplar, cozucunun icinden gelen ham hatalari
            // ("singular matrix" gibi) kullanicinin okuyabilecegi bir cumleye
            // cevirmek icin. Ama cozucu artik bazi hallerde ZATEN kullanici
            // icin yazilmis, hangi kirisin sorunlu oldugunu soyleyen bir mesaj
            // atiyor. O mesaji "one or more beams" diye genellestirmek,
            // bilgiyi geri almak demek: kullanici kirisi bulamiyor.
            //
            // Isaret: cozucu boyle mesajlari kiris numarasiyla yaziyor.
            if (/beam \d/i.test(msg)) return msg;

            // Common error patterns and user-friendly messages
            if (msg.includes('singular') || msg.includes('Singular')) {
                return 'Model is unstable! Check boundary conditions - the structure may be able to move freely.';
            }
            if (msg.includes('NaN') || msg.includes('Infinity')) {
                return 'Numerical error! Check for zero-length beams or invalid section properties.';
            }
            if (msg.includes('section') || msg.includes('Section')) {
                return 'Section error! One or more beams have undefined or invalid sections.';
            }
            if (msg.includes('node') || msg.includes('Node')) {
                return 'Node error! Check that all beam endpoints are properly connected.';
            }
            if (msg.includes('constraint') || msg.includes('boundary')) {
                return 'Boundary condition error! Ensure at least one node is constrained.';
            }
            if (msg.includes('matrix') || msg.includes('Matrix')) {
                return 'Matrix assembly error! Model may have disconnected parts.';
            }
            
            return 'Solver error: ' + msg;
        }
        
        // Detailed model validation for solver
        function validateModelForSolver() {
            const issues = { errors: [], warnings: [] };
            
            // Check for nodes
            const nodeCount = Object.keys(model.nodes).length;
            if (nodeCount === 0) {
                issues.errors.push({ message: 'No nodes defined', details: 'Create at least 2 nodes to define a beam.' });
                return issues;
            }
            
            // Check for elements
            const elemCount = Object.keys(model.elements).length;
            if (elemCount === 0) {
                issues.errors.push({ message: 'No beams defined', details: 'Create at least one beam between nodes.' });
                return issues;
            }
            
            // Check for boundary conditions
            const bcCount = Object.keys(model.constraints).length;
            if (bcCount === 0) {
                issues.errors.push({ 
                    message: 'No boundary conditions', 
                    details: 'Add at least one support (fixed, pinned, or simply supported) to prevent rigid body motion.' 
                });
            }
            
            // Check for loads
            const hasLoads = model.loads.length > 0 || 
                           Object.values(model.elements).some(e => e.lineLoads && e.lineLoads.length > 0);
            if (!hasLoads) {
                issues.warnings.push({ 
                    message: 'No loads defined', 
                    details: 'Model will solve but results will be zero. Add point loads or line loads.' 
                });
            }
            
            // Check for disconnected nodes
            const connectedNodes = new Set();
            Object.values(model.elements).forEach(elem => {
                connectedNodes.add(elem.n1);
                connectedNodes.add(elem.n2);
            });
            
            const disconnectedNodes = Object.keys(model.nodes).filter(id => !connectedNodes.has(parseInt(id)));
            if (disconnectedNodes.length > 0) {
                issues.warnings.push({ 
                    message: `${disconnectedNodes.length} disconnected node(s)`, 
                    details: `Nodes ${disconnectedNodes.slice(0, 3).join(', ')}${disconnectedNodes.length > 3 ? '...' : ''} are not connected to any beam.` 
                });
            }
            
            // Check for missing sections
            const missingSections = [];
            Object.values(model.elements).forEach(elem => {
                if (!elem.section || !SECTIONS[elem.section]) {
                    missingSections.push(elem.id);
                }
            });
            if (missingSections.length > 0) {
                issues.errors.push({ 
                    message: `${missingSections.length} beam(s) have undefined sections`, 
                    details: `Beams ${missingSections.slice(0, 3).join(', ')}${missingSections.length > 3 ? '...' : ''} need valid section assignments.` 
                });
            }
            
            // Check for zero-length beams
            const zeroLengthBeams = [];
            Object.values(model.elements).forEach(elem => {
                const n1 = model.nodes[elem.n1];
                const n2 = model.nodes[elem.n2];
                if (n1 && n2) {
                    const L = Math.sqrt(Math.pow(n2.x - n1.x, 2) + Math.pow(n2.y - n1.y, 2));
                    if (L < 1e-6) {
                        zeroLengthBeams.push(elem.id);
                    }
                }
            });
            if (zeroLengthBeams.length > 0) {
                issues.errors.push({ 
                    message: `${zeroLengthBeams.length} zero-length beam(s)`, 
                    details: `Beams ${zeroLengthBeams.join(', ')} have start and end nodes at the same position.` 
                });
            }
            
            // Check for unsupported nodes with loads
            model.loads.forEach(load => {
                const nodeId = load.nodeId;
                // Check if this node or connected nodes have any path to a support
                // Simplified check: just warn if loaded node has no direct support
                if (!model.constraints[nodeId]) {
                    // This is actually fine, just informational
                }
            });
            
            // Check boundary condition sufficiency
            let hasVerticalSupport = false;
            let hasRotationSupport = false;
            Object.values(model.constraints).forEach(bc => {
                if (typeof bc === 'string') {
                    if (bc === 'fixed' || bc === 'simply_supported' || bc === 'pinned') {
                        hasVerticalSupport = true;
                    }
                    if (bc === 'fixed') {
                        hasRotationSupport = true;
                    }
                } else if (typeof bc === 'object') {
                    if (bc.Uz) hasVerticalSupport = true;
                    if (bc.Rx || bc.Ry) hasRotationSupport = true;
                }
            });
            
            if (!hasVerticalSupport) {
                issues.errors.push({ 
                    message: 'No vertical support', 
                    details: 'At least one node must be constrained in Z direction to prevent vertical movement.' 
                });
            }
            
            return issues;
        }
