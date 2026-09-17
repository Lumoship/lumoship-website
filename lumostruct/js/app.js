// ============== LumoStruct - Structural Grillage Analysis Tool ==============
// Main Application Entry Point
// Version: 65 (Modular)
// =====================================================================

(function() {
    'use strict';
    
    // ============== APPLICATION INITIALIZATION ==============
    
    // Wait for DOM to be ready
    document.addEventListener('DOMContentLoaded', function() {
        console.log('LumoStruct v65 - Initializing...');
        
        // Initialize DOM element cache
        if (typeof initDOMCache === 'function') {
            initDOMCache();
        }
        
        // Initialize canvas
        if (typeof resizeCanvas === 'function') {
            resizeCanvas();
            window.addEventListener('resize', resizeCanvas);
        }
        
        // Initialize theme from localStorage
        const savedTheme = localStorage.getItem('nodalTheme');
        if (savedTheme) {
            try {
                const theme = JSON.parse(savedTheme);
                if (typeof applyColorTheme === 'function') {
                    applyColorTheme(theme);
                    // Kanvas renk temasi kendi arka planini yaziyor; acik/koyu mod son
                    // sozu soylemeli, yoksa acik temada kanvas koyu kaliyor.
                    if (typeof applyThemeToScene === 'function') applyThemeToScene();
                }
            } catch(e) {
                console.warn('Could not load saved theme:', e);
            }
        }
        
        // Initialize label sizes from localStorage
        const savedLabelSize = localStorage.getItem('nodalLabelSize');
        if (savedLabelSize && typeof updateAllLabelSizes === 'function') {
            updateAllLabelSizes(parseFloat(savedLabelSize));
            const slider = document.getElementById('labelSizeSlider');
            if (slider) slider.value = savedLabelSize;
        }
        
        // Check for autosave
        if (typeof loadAutoSave === 'function') {
            loadAutoSave();
        }
        
        // Initialize recent files menu
        if (typeof updateRecentFilesMenu === 'function') {
            updateRecentFilesMenu();
        }
        
        // Initialize load cases UI
        if (typeof updateLoadCasesUI === 'function') {
            updateLoadCasesUI();
        }
        // Settings > Units: isaret kurallari (yardim.js, tek kaynak)
        const isaretKutu = document.getElementById('isaretKurallariKutusu');
        if (isaretKutu && typeof isaretKurallariHtml === 'function') isaretKutu.innerHTML = isaretKurallariHtml();
        
        // Initialize collapsible panels
        document.querySelectorAll('.collapsible-header').forEach(header => {
            header.addEventListener('click', function() {
                const panel = this.closest('.collapsible-panel');
                if (panel) {
                    panel.classList.toggle('collapsed');
                    const content = panel.querySelector('.collapsible-content');
                    if (content) {
                        content.style.display = panel.classList.contains('collapsed') ? 'none' : 'block';
                    }
                }
            });
        });
        
        // Initialize keyboard shortcuts
        document.addEventListener('keydown', function(e) {
            // Global keyboard handler
            if (typeof handleGlobalKeyboard === 'function') {
                handleGlobalKeyboard(e);
            }
        });
        
        // Update model summary
        if (typeof updateModelSummary === 'function') {
            updateModelSummary();
        }
        
        // Initial draw
        if (typeof draw === 'function') {
            draw();
        }
        
        // Enhance number inputs with custom steppers
        enhanceNumberInputs();

        // Bring the stress limits in line with the grade shown in the selector - otherwise
        // the app opens on Grade A while still checking against 355 MPa.
        if (typeof updateMaterialDisplay === 'function') {
            updateMaterialDisplay();
        }

        // Show the starting point if there is nothing modelled yet
        if (typeof updateEmptyState === 'function') {
            updateEmptyState();
        }

        // Kullanicinin arayuz olcegi (Settings > Interface)
        if (typeof arayuzOlceginiYukle === 'function') arayuzOlceginiYukle();
        if (typeof arayuzOlcekBilgisi === 'function') arayuzOlcekBilgisi();

        console.log('LumoStruct v65 - Ready');
    });
    
    // ============== NUMBER INPUT STEPPERS ==============
    function enhanceNumberInputs(root) {
        const scope = root || document;
        const upSvg = '<svg viewBox="0 0 24 24"><polyline points="6 15 12 9 18 15"/></svg>';
        const downSvg = '<svg viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>';
        scope.querySelectorAll('input[type="number"]:not([data-stepper])').forEach(inp => {
            inp.setAttribute('data-stepper', '1');
            const wrap = document.createElement('span');
            wrap.className = 'num-wrap';
            inp.parentNode.insertBefore(wrap, inp);
            wrap.appendChild(inp);
            const stepper = document.createElement('span');
            stepper.className = 'num-stepper';
            stepper.innerHTML =
                '<button type="button" tabindex="-1" data-dir="1" aria-label="Increase">' + upSvg + '</button>' +
                '<button type="button" tabindex="-1" data-dir="-1" aria-label="Decrease">' + downSvg + '</button>';
            wrap.appendChild(stepper);
            stepper.querySelectorAll('button').forEach(btn => {
                btn.addEventListener('click', () => {
                    const step = parseFloat(inp.step) || 1;
                    const dir = parseFloat(btn.dataset.dir);
                    const cur = parseFloat(inp.value) || 0;
                    let next = cur + dir * step;
                    if (inp.min !== '' && next < parseFloat(inp.min)) next = parseFloat(inp.min);
                    if (inp.max !== '' && next > parseFloat(inp.max)) next = parseFloat(inp.max);
                    next = Math.round(next * 1e6) / 1e6;
                    inp.value = next;
                    inp.dispatchEvent(new Event('input', { bubbles: true }));
                    inp.dispatchEvent(new Event('change', { bubbles: true }));
                });
            });
        });
    }
    window.enhanceNumberInputs = enhanceNumberInputs;
    
    // ============== GLOBAL ERROR HANDLER ==============
    window.onerror = function(msg, url, lineNo, columnNo, error) {
        console.error('LumoStruct Error:', msg, 'at', url, lineNo, columnNo);
        if (typeof showToast === 'function') {
            showToast('An error occurred. Check console for details.', 'error');
        }
        return false;
    };
    
    // ============== EXPOSE GLOBAL FUNCTIONS ==============
    // These functions need to be accessible from HTML onclick handlers
    
    // Make sure all onclick handlers work
    window.nodalApp = {
        version: '65-modular',
        initialized: false
    };
    
})();
