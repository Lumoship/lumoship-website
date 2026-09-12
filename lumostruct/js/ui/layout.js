        // ============== PANEL KATLAMA VE GENISLIK HAFIZASI ==============
        //
        // Iki yan panel pencerenin %32'sini aliyordu ve bu her oturumda
        // yeniden ayarlanmasi gereken bir seydi: suruklenen genislik hicbir
        // yerde saklanmiyordu. Rhino/Femap gibi araclarda goruntu penceresi
        // %75-85'tir ve panel durumu hatirlanir.
        //
        // Tutamagi CIFT TIKLAMAK paneli katlar/acar. Tutamak katlaninca da
        // yerinde kalir (6 px), yani geri acmak ayni hareket.

        const LAYOUT_KEY = 'lumostruct_layout';
        const LAYOUT_DEFAULT = { leftW: 320, rightW: 280, leftOff: false, rightOff: false };

        function readLayout() {
            try {
                return Object.assign({}, LAYOUT_DEFAULT,
                    JSON.parse(localStorage.getItem(LAYOUT_KEY) || '{}'));
            } catch (e) {
                return Object.assign({}, LAYOUT_DEFAULT);
            }
        }

        function writeLayout(d) {
            try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(d)); } catch (e) { /* özel mod */ }
        }

        // Yerlesim degisince kanvas, 3B render ve alt panel birlikte guncellenir.
        // Tek yerden yapilir ki biri unutulup kaymasin.
        function syncPanelLayout() {
            const left = document.getElementById('leftPanel');
            const right = document.getElementById('rightPanel');
            const bottom = document.getElementById('resultsBottomPanel');
            if (bottom) {
                // Alt panel HER IKI yan panele de uymali. Sag kenari CSS'te
                // `right: 280px` diye sabit kodluydu, yani sag panel
                // surukleninc de katlaninca da yerinde kaliyordu.
                if (left) bottom.style.left = (left.offsetWidth + 6) + 'px';
                if (right) bottom.style.right = right.offsetWidth + 'px';
            }
            if (typeof threeRenderer !== 'undefined' && threeRenderer) {
                const container = document.getElementById('threeContainer');
                if (container) {
                    threeRenderer.setSize(container.clientWidth, container.clientHeight);
                    if (typeof threeCamera !== 'undefined' && threeCamera) {
                        threeCamera.aspect = container.clientWidth / container.clientHeight;
                        threeCamera.updateProjectionMatrix();
                    }
                }
            }
            if (typeof window !== 'undefined' && window.dispatchEvent) {
                window.dispatchEvent(new Event('resize'));
            }
        }

        // taraf: 'left' | 'right'. force verilirse o duruma getirir.
        function togglePanelCollapse(side, force) {
            const el = document.getElementById(side === 'left' ? 'leftPanel' : 'rightPanel');
            const handle = document.getElementById(
                side === 'left' ? 'leftPanelResizeHandle' : 'rightPanelResizeHandle');
            if (!el) return false;

            const d = readLayout();
            const anahtar = side === 'left' ? 'leftOff' : 'rightOff';
            const gAnahtar = side === 'left' ? 'leftW' : 'rightW';
            const katla = (force === undefined) ? !d[anahtar] : !!force;

            if (katla) {
                // Acikken ki genisligi sakla ki geri acilinca ayni yere donsun.
                if (el.offsetWidth > 0) d[gAnahtar] = el.offsetWidth;
                el.style.display = 'none';
            } else {
                el.style.display = '';
                el.style.width = d[gAnahtar] + 'px';
            }
            d[anahtar] = katla;
            writeLayout(d);

            if (handle) {
                handle.classList.toggle('collapsed', katla);
                handle.title = katla
                    ? 'Show panel (double-click)'
                    : 'Drag to resize · double-click to hide';
            }
            syncPanelLayout();
            return katla;
        }

        function applyStoredLayout() {
            const d = readLayout();
            const left = document.getElementById('leftPanel');
            const right = document.getElementById('rightPanel');
            if (left && !d.leftOff) left.style.width = d.leftW + 'px';
            if (right && !d.rightOff) right.style.width = d.rightW + 'px';
            if (d.leftOff) togglePanelCollapse('left', true);
            if (d.rightOff) togglePanelCollapse('right', true);
            // Katlanmamis olsalar bile tutamak ipucusu dogru olsun
            ['left', 'right'].forEach(s => {
                const h = document.getElementById(
                    s === 'left' ? 'leftPanelResizeHandle' : 'rightPanelResizeHandle');
                if (h && !h.title) h.title = 'Drag to resize · double-click to hide';
            });
            syncPanelLayout();
        }

        (function initPanelCollapse() {
            if (typeof document === 'undefined' || !document.addEventListener) return;

            document.addEventListener('dblclick', function (e) {
                if (!e.target || !e.target.closest) return;
                if (e.target.closest('#leftPanelResizeHandle')) {
                    togglePanelCollapse('left');
                    e.preventDefault();
                } else if (e.target.closest('#rightPanelResizeHandle')) {
                    togglePanelCollapse('right');
                    e.preventDefault();
                }
            });

            // Suruklemeyle degisen genislik de saklanir - eskiden her acilista
            // varsayilana donuyordu.
            document.addEventListener('mouseup', function () {
                const left = document.getElementById('leftPanel');
                const right = document.getElementById('rightPanel');
                const d = readLayout();
                let degisti = false;
                if (left && !d.leftOff && left.offsetWidth && left.offsetWidth !== d.leftW) {
                    d.leftW = left.offsetWidth; degisti = true;
                }
                if (right && !d.rightOff && right.offsetWidth && right.offsetWidth !== d.rightW) {
                    d.rightW = right.offsetWidth; degisti = true;
                }
                if (degisti) writeLayout(d);
            });

            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', applyStoredLayout);
            } else {
                applyStoredLayout();
            }
        })();
