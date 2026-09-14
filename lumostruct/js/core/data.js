        // ============== DATA ==============
        
        // HP Profile Catalog (EN 10067)
        const HP_CATALOG = [
            { name: "HP60x4", b: 60, t: 4, c: 13, r: 3.5, A: 3.08, dx: 3.24, Ixx: 8.82 },
            { name: "HP60x5", b: 60, t: 5, c: 13, r: 3.5, A: 3.79, dx: 3.32, Ixx: 10.6 },
            { name: "HP80x5", b: 80, t: 5, c: 14, r: 4, A: 5.09, dx: 4.33, Ixx: 26.3 },
            { name: "HP80x6", b: 80, t: 6, c: 14, r: 4, A: 6.03, dx: 4.43, Ixx: 30.4 },
            { name: "HP80x7", b: 80, t: 7, c: 14, r: 4, A: 6.95, dx: 4.52, Ixx: 34.2 },
            { name: "HP100x6", b: 100, t: 6, c: 15.5, r: 4.5, A: 7.64, dx: 5.40, Ixx: 61.7 },
            { name: "HP100x7", b: 100, t: 7, c: 15.5, r: 4.5, A: 8.82, dx: 5.51, Ixx: 69.7 },
            { name: "HP100x8", b: 100, t: 8, c: 15.5, r: 4.5, A: 9.98, dx: 5.61, Ixx: 77.2 },
            { name: "HP120x6", b: 120, t: 6, c: 17, r: 5, A: 9.24, dx: 6.48, Ixx: 112 },
            { name: "HP120x7", b: 120, t: 7, c: 17, r: 5, A: 10.7, dx: 6.60, Ixx: 127 },
            // ---- TURETILMIS SATIR, EN 10067'den DEGIL ----
            // Katalogdaki degerler (A 11,72  dx 6,96  Ixx 165) uc olcutte
            // birden aile egilimini kiriyordu; bu dosyadaki oteki dokuz ailenin
            // HEPSI ayni olcutleri %0,8 icinde sagliyor.
            //   1) Alan bir aile icinde t ile DOGRUSALDIR (bulb ayni hadde
            //      yuvasindan cikar, degisen yalnizca govde). HP120x6 ve x7'den
            //      dogru: A(8) = 12,16. Aileler arasi egilimden: 12,14.
            //   2) dIxx/dt ~ h^3/12 * dt: h = 12 cm icin 14,4 cm4/mm. Katalogun
            //      x6 -> x7 adimi 15 (uyuyor), x7 -> x8 adimi 38 (uymuyor).
            //      Ixx(8) = 127 + ~15 = 142.
            //   3) dx adimi ailede 0,12; katalogda 0,12 sonra 0,36.
            //      dx(8) = 6,60 + 0,12 = 6,72.
            // Ayni yanlis sayilar SectionPro ve Midship Scantling'de de var -
            // uc arac tek kaynaktan besleniyor, birbirini dogrulamiyor.
            //
            // EN 10067 tablosuna bakilip DOGRULANMALI. O zamana kadar bu satir
            // turetilmis: kesit kurulurken uyari veriyor (bkz. profiles.js).
            { name: "HP120x8", b: 120, t: 8, c: 17, r: 5, A: 12.15, dx: 6.72, Ixx: 142, turetilmis: true },
            { name: "HP140x7", b: 140, t: 7, c: 19, r: 5.5, A: 12.6, dx: 7.68, Ixx: 208 },
            { name: "HP140x8", b: 140, t: 8, c: 19, r: 5.5, A: 14.3, dx: 7.81, Ixx: 232 },
            { name: "HP140x9", b: 140, t: 9, c: 19, r: 5.5, A: 15.9, dx: 7.93, Ixx: 254 },
            { name: "HP160x7", b: 160, t: 7, c: 22, r: 6, A: 14.5, dx: 8.83, Ixx: 322 },
            { name: "HP160x8", b: 160, t: 8, c: 22, r: 6, A: 16.4, dx: 8.97, Ixx: 359 },
            { name: "HP160x9", b: 160, t: 9, c: 22, r: 6, A: 18.3, dx: 9.10, Ixx: 394 },
            { name: "HP180x8", b: 180, t: 8, c: 25, r: 7, A: 18.6, dx: 10.10, Ixx: 526 },
            { name: "HP180x9", b: 180, t: 9, c: 25, r: 7, A: 20.8, dx: 10.25, Ixx: 579 },
            { name: "HP180x10", b: 180, t: 10, c: 25, r: 7, A: 22.9, dx: 10.39, Ixx: 629 },
            { name: "HP180x11", b: 180, t: 11, c: 25, r: 7, A: 25.0, dx: 10.52, Ixx: 677 },
            { name: "HP200x9", b: 200, t: 9, c: 28, r: 8, A: 23.3, dx: 11.38, Ixx: 814 },
            { name: "HP200x10", b: 200, t: 10, c: 28, r: 8, A: 25.7, dx: 11.54, Ixx: 886 },
            { name: "HP200x11", b: 200, t: 11, c: 28, r: 8, A: 28.1, dx: 11.69, Ixx: 955 },
            { name: "HP200x12", b: 200, t: 12, c: 28, r: 8, A: 30.4, dx: 11.83, Ixx: 1020 },
            { name: "HP220x10", b: 220, t: 10, c: 31, r: 9, A: 28.6, dx: 12.68, Ixx: 1210 },
            { name: "HP220x11", b: 220, t: 11, c: 31, r: 9, A: 31.2, dx: 12.84, Ixx: 1300 },
            { name: "HP220x12", b: 220, t: 12, c: 31, r: 9, A: 33.8, dx: 12.99, Ixx: 1400 },
            { name: "HP240x10", b: 240, t: 10, c: 34, r: 10, A: 31.4, dx: 13.82, Ixx: 1610 },
            { name: "HP240x11", b: 240, t: 11, c: 34, r: 10, A: 34.4, dx: 13.99, Ixx: 1740 },
            { name: "HP240x12", b: 240, t: 12, c: 34, r: 10, A: 37.3, dx: 14.15, Ixx: 1870 },
            { name: "HP260x10", b: 260, t: 10, c: 37, r: 11, A: 34.3, dx: 14.96, Ixx: 2100 },
            { name: "HP260x11", b: 260, t: 11, c: 37, r: 11, A: 37.5, dx: 15.14, Ixx: 2270 },
            { name: "HP260x12", b: 260, t: 12, c: 37, r: 11, A: 40.7, dx: 15.31, Ixx: 2440 },
            { name: "HP280x11", b: 280, t: 11, c: 40, r: 12, A: 40.7, dx: 16.28, Ixx: 2900 },
            { name: "HP280x12", b: 280, t: 12, c: 40, r: 12, A: 44.2, dx: 16.46, Ixx: 3120 },
            { name: "HP300x11", b: 300, t: 11, c: 43, r: 13, A: 43.8, dx: 17.42, Ixx: 3640 },
            { name: "HP300x12", b: 300, t: 12, c: 43, r: 13, A: 47.6, dx: 17.61, Ixx: 3920 },
            { name: "HP320x12", b: 320, t: 12, c: 46, r: 14, A: 51.0, dx: 18.75, Ixx: 4840 },
            { name: "HP340x12", b: 340, t: 12, c: 49, r: 15, A: 54.4, dx: 19.89, Ixx: 5900 },
            { name: "HP370x13", b: 370, t: 13, c: 53.5, r: 16.5, A: 64.1, dx: 21.73, Ixx: 8230 },
            { name: "HP400x14", b: 400, t: 14, c: 58, r: 18, A: 74.6, dx: 23.59, Ixx: 11200 },
            { name: "HP430x15", b: 430, t: 15, c: 62.5, r: 19.5, A: 85.9, dx: 25.55, Ixx: 14900 }
        ];
        
        // L-Angle Catalog (Equal Angles) - EN 10056
        const L_CATALOG = [
            { name: "L50x50x5", a: 50, b: 50, t: 5, A: 4.80, Ixx: 11.0 },
            { name: "L50x50x6", a: 50, b: 50, t: 6, A: 5.69, Ixx: 12.8 },
            { name: "L60x60x6", a: 60, b: 60, t: 6, A: 6.91, Ixx: 22.8 },
            { name: "L60x60x8", a: 60, b: 60, t: 8, A: 9.03, Ixx: 28.9 },
            { name: "L70x70x7", a: 70, b: 70, t: 7, A: 9.40, Ixx: 42.3 },
            { name: "L75x75x8", a: 75, b: 75, t: 8, A: 11.5, Ixx: 58.9 },
            { name: "L80x80x8", a: 80, b: 80, t: 8, A: 12.3, Ixx: 72.2 },
            { name: "L80x80x10", a: 80, b: 80, t: 10, A: 15.1, Ixx: 87.5 },
            { name: "L90x90x9", a: 90, b: 90, t: 9, A: 15.5, Ixx: 110 },
            { name: "L100x100x10", a: 100, b: 100, t: 10, A: 19.2, Ixx: 168 },
            { name: "L100x100x12", a: 100, b: 100, t: 12, A: 22.7, Ixx: 196 },
            { name: "L120x120x10", a: 120, b: 120, t: 10, A: 23.2, Ixx: 298 },
            { name: "L120x120x12", a: 120, b: 120, t: 12, A: 27.5, Ixx: 350 },
            { name: "L150x150x12", a: 150, b: 150, t: 12, A: 34.8, Ixx: 705 },
            { name: "L150x150x15", a: 150, b: 150, t: 15, A: 43.0, Ixx: 860 }
        ];
        
        // T-Section Catalog (Welded T)
        const T_CATALOG = [
            { name: "T80x80x8x8", h: 80, bf: 80, tw: 8, tf: 8, A: 12.2, Ixx: 46.0 },
            { name: "T100x100x10x10", h: 100, bf: 100, tw: 10, tf: 10, A: 19.0, Ixx: 113 },
            { name: "T120x100x10x10", h: 120, bf: 100, tw: 10, tf: 10, A: 21.0, Ixx: 185 },
            { name: "T120x120x10x12", h: 120, bf: 120, tw: 10, tf: 12, A: 26.4, Ixx: 220 },
            { name: "T150x100x10x12", h: 150, bf: 100, tw: 10, tf: 12, A: 26.2, Ixx: 428 },
            { name: "T150x150x10x12", h: 150, bf: 150, tw: 10, tf: 12, A: 31.8, Ixx: 511 },
            { name: "T180x100x10x12", h: 180, bf: 100, tw: 10, tf: 12, A: 29.2, Ixx: 728 },
            { name: "T200x100x10x12", h: 200, bf: 100, tw: 10, tf: 12, A: 31.2, Ixx: 987 },
            { name: "T200x150x12x15", h: 200, bf: 150, tw: 12, tf: 15, A: 44.7, Ixx: 1280 },
            { name: "T250x150x12x15", h: 250, bf: 150, tw: 12, tf: 15, A: 50.7, Ixx: 2250 }
        ];
        
        // Flat Bar Catalog - Common Sizes
        const FB_CATALOG = [
            { name: "FB50x6", h: 50, t: 6 },
            { name: "FB60x6", h: 60, t: 6 },
            { name: "FB60x8", h: 60, t: 8 },
            { name: "FB75x8", h: 75, t: 8 },
            { name: "FB80x8", h: 80, t: 8 },
            { name: "FB80x10", h: 80, t: 10 },
            { name: "FB100x8", h: 100, t: 8 },
            { name: "FB100x10", h: 100, t: 10 },
            { name: "FB100x12", h: 100, t: 12 },
            { name: "FB120x10", h: 120, t: 10 },
            { name: "FB120x12", h: 120, t: 12 },
            { name: "FB150x10", h: 150, t: 10 },
            { name: "FB150x12", h: 150, t: 12 },
            { name: "FB150x15", h: 150, t: 15 },
            { name: "FB200x12", h: 200, t: 12 },
            { name: "FB200x15", h: 200, t: 15 },
            { name: "FB200x20", h: 200, t: 20 },
            { name: "FB250x15", h: 250, t: 15 },
            { name: "FB250x20", h: 250, t: 20 }
        ];
        
        // Created Sections (starts empty, user adds profiles)
        const SECTIONS = {};
        
        // Current profile type being edited
        let currentProfileType = 'HP';
        
        // Safe DOM access helpers
        const $ = (id) => document.getElementById(id);
        const setStyle = (id, prop, val) => { const el = $(id); if (el) el.style[prop] = val; };
        const setText = (id, val) => { const el = $(id); if (el) el.textContent = val; };
        const setHtml = (id, val) => { const el = $(id); if (el) el.innerHTML = val; };
        const setChecked = (id, val) => { const el = $(id); if (el) el.checked = val; };
        const setValue = (id, val) => { const el = $(id); if (el) el.value = val; };
        const getChecked = (id) => { const el = $(id); return el ? el.checked : false; };
        
        const MATERIALS = {
            'A':    { E: 210e9, G: 80.77e9, yield: 235e6 },
            'AH32': { E: 210e9, G: 80.77e9, yield: 315e6 },
            'AH36': { E: 210e9, G: 80.77e9, yield: 355e6 },
            'DH36': { E: 210e9, G: 80.77e9, yield: 355e6 }
        };
        
        // ============== DEBUG FLAG ==============
        const DEBUG = false; // Set to true for development logging
        
        function debugLog(...args) {
            if (DEBUG) console.log(...args);
        }
        function debugWarn(...args) {
            if (DEBUG) console.warn(...args);
        }
        function debugError(...args) {
            if (DEBUG) console.error(...args);
        }
        
        // ============== DOM ELEMENT CACHE ==============
        // Cache frequently accessed DOM elements for better performance
        const DOM = {
            // Will be populated on init
        };
        
        function initDOMCache() {
            DOM.canvas = document.getElementById('canvas');
            DOM.canvas3d = document.getElementById('canvas3d');
            DOM.modelSummary = document.getElementById('modelSummary');
            DOM.nodeCount = document.getElementById('nodeCount');
            DOM.elementCount = document.getElementById('elementCount');
            DOM.constraintCount = document.getElementById('constraintCount');
            DOM.loadCount = document.getElementById('loadCount');
            DOM.resultsPanel = document.getElementById('resultsPanel');
            DOM.noResults = document.getElementById('noResults');
            DOM.stressLegend = document.getElementById('stressLegend');
            DOM.entityInfoPanel = document.getElementById('entityInfoPanel');
            DOM.entityInfoEmpty = document.getElementById('entityInfoEmpty');
            DOM.entityInfoNode = document.getElementById('entityInfoNode');
            DOM.entityInfoBeam = document.getElementById('entityInfoBeam');
            DOM.entityInfoMulti = document.getElementById('entityInfoMulti');
            DOM.commandLine = document.getElementById('commandLine');
            DOM.confirmModal = document.getElementById('confirmModal');
            DOM.contextMenu = document.getElementById('contextMenu');
            DOM.coordDisplay = document.getElementById('coordDisplay');
            DOM.sigmaLimit = document.getElementById('sigmaLimit');
        }
        
        // ============== EVENT LISTENER MANAGER ==============
        // Track event listeners for proper cleanup
        const eventListeners = [];
        
        function addManagedEventListener(element, event, handler, options) {
            if (!element) return;
            element.addEventListener(event, handler, options);
            eventListeners.push({ element, event, handler, options });
        }
        
        function removeAllManagedEventListeners() {
            eventListeners.forEach(({ element, event, handler, options }) => {
                if (element) {
                    element.removeEventListener(event, handler, options);
                }
            });
            eventListeners.length = 0;
        }
        
        // ============== MEMORY MANAGEMENT ==============
        // Clean up Three.js objects to prevent memory leaks
        function disposeThreeObject(obj) {
            if (!obj) return;
            
            if (obj.geometry) {
                obj.geometry.dispose();
            }
            if (obj.material) {
                if (Array.isArray(obj.material)) {
                    obj.material.forEach(m => {
                        if (m.map) m.map.dispose();
                        m.dispose();
                    });
                } else {
                    if (obj.material.map) obj.material.map.dispose();
                    obj.material.dispose();
                }
            }
            if (obj.children) {
                obj.children.forEach(child => disposeThreeObject(child));
            }
        }
        
        function clearThreeScene() {
            if (!threeScene) return;
            
            // Dispose all objects except lights and camera
            const toRemove = [];
            threeScene.traverse(obj => {
                if (obj.userData && obj.userData.isModelObject) {
                    toRemove.push(obj);
                }
            });
            
            toRemove.forEach(obj => {
                disposeThreeObject(obj);
                threeScene.remove(obj);
            });
        }
        
        // ============== UTILITY FUNCTIONS ==============
        
        // Safe JSON parse with fallback
        function safeJsonParse(str, fallback = null) {
            try {
                return JSON.parse(str);
            } catch (e) {
                debugError('JSON parse error:', e);
                return fallback;
            }
        }
        
        // Safe toFixed that handles NaN/Infinity
        function safeToFixed(num, decimals = 2) {
            if (num === null || num === undefined || isNaN(num) || !isFinite(num)) {
                return '0';
            }
            return Number(num).toFixed(decimals);
        }
        
        // Safe number parsing with default
        function safeParseFloat(str, defaultVal = 0) {
            const num = parseFloat(str);
            return isNaN(num) ? defaultVal : num;
        }
        
        function safeParseInt(str, defaultVal = 0) {
            const num = parseInt(str, 10);
            return isNaN(num) ? defaultVal : num;
        }
        
        // Safe array access
        function safeArrayGet(arr, index, defaultVal = null) {
            if (!Array.isArray(arr) || index < 0 || index >= arr.length) {
                return defaultVal;
            }
            return arr[index];
        }
        
        // Safe object property access
        function safeGet(obj, path, defaultVal = null) {
            if (!obj) return defaultVal;
            const keys = path.split('.');
            let result = obj;
            for (const key of keys) {
                if (result === null || result === undefined) return defaultVal;
                result = result[key];
            }
            return result !== undefined ? result : defaultVal;
        }
        
        // Clamp number to range
        function clamp(num, min, max) {
            return Math.max(min, Math.min(max, num));
        }
        
        // Safe division (prevents NaN/Infinity)
        function safeDivide(a, b, defaultVal = 0) {
            if (b === 0 || isNaN(b) || !isFinite(b)) return defaultVal;
            const result = a / b;
            return isNaN(result) || !isFinite(result) ? defaultVal : result;
        }
        
        // Validate model structure
        // Yuklenen/geri alinan bir modelin SEKLI dogru mu. Adi eskiden validateModel'di
        // ve solver.js'teki ayni adli muhendislik kontrolu tarafindan eziliyordu:
        // ayni global kapsam, sonra yuklenen kazanir. Sonucta dosya dogrulamasi hep
        // truthy bir nesne alip her JSON'u kabul ediyordu.
        function isValidModelData(m) {
            if (!m) return false;
            if (!m.nodes || typeof m.nodes !== 'object') return false;
            if (!m.elements || typeof m.elements !== 'object') return false;
            if (!m.constraints || typeof m.constraints !== 'object') return false;
            if (!Array.isArray(m.loads)) return false;
            return true;
        }
        
        let model = {
            nodes: {},
            elements: {},
            constraints: {},
            loads: [],
            pressure: []
        };
        
