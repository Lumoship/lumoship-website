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
        // syncPanelLayout sonunda window'a 'resize' yayiyor; bu olayi
        // dinleyen bir sey tekrar syncPanelLayout cagirinca sonsuz ozyineleme
        // olusuyordu (yigin tasmasi). Tek tur calisir.
        let yerlesimSuruyor = false;

        function syncPanelLayout() {
            if (yerlesimSuruyor) return;
            yerlesimSuruyor = true;
            try { syncPanelLayoutGovde(); } finally { yerlesimSuruyor = false; }
        }

        function syncPanelLayoutGovde() {
            const left = document.getElementById('leftPanel');
            const right = document.getElementById('rightPanel');
            const bottom = document.getElementById('resultsBottomPanel');
            if (bottom) {
                // Alt panel HER IKI yan panele de uymali. Kenarlari tek tek
                // toplamak yerine TUVALIN kendi kutusu olculur: aradaki
                // surukleme tutamaklari da kendiliginden hesaba girer.
                // Sag kenar 6px'lik tutamaci saymadigi icin panel tuvalden
                // 6px tasiyordu.
                const tuval = document.querySelector('.canvas-area');
                const t = tuval ? tuval.getBoundingClientRect() : null;
                // Test kosumunda DOM taklidi gercek yerlesim uretmez ve
                // getBoundingClientRect NaN dondurur; olcum gecerli degilse
                // panel genisliklerinden hesaplanir.
                const olculebilir = t && Number.isFinite(t.left) && Number.isFinite(t.right) &&
                                    Number.isFinite(window.innerWidth);
                if (olculebilir) {
                    bottom.style.left = Math.round(t.left) + 'px';
                    bottom.style.right = Math.round(window.innerWidth - t.right) + 'px';
                } else {
                    if (left) bottom.style.left = (left.offsetWidth + 6) + 'px';
                    if (right) bottom.style.right = right.offsetWidth + 'px';
                }

                // Panel "bottom: 0" ile komut cubugunun ve alt bilgi seridinin
                // altina uzaniyordu; son satirlari onlarin arkasinda kaliyordu.
                const cubuk = document.getElementById('commandBar');
                const altBilgi = document.querySelector('.app-footer');
                const yuk = e => {
                    if (!e) return 0;
                    const q = e.getBoundingClientRect();
                    return Number.isFinite(q.height) ? q.height : 0;
                };
                bottom.style.bottom = Math.round(yuk(cubuk) + yuk(altBilgi)) + 'px';
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
            komutCubuguOlculeri();

            if (typeof window !== 'undefined' && window.dispatchEvent) {
                window.dispatchEvent(new Event('resize'));
            }
        }

        // Komut cubugunun yan bolumleri ve alt panelin ustunde kalacagi
        // yukseklik. Tek yon: syncPanelLayout bunu cagirir, bu geri cagirmaz.
        function komutCubuguOlculeri() {
            const cubuk = document.getElementById('commandBar');
            const tuval = document.querySelector('.canvas-area');
            if (!cubuk || !tuval) return;

            const t = tuval.getBoundingClientRect();
            const c = cubuk.getBoundingClientRect();
            if (!Number.isFinite(t.left) || !Number.isFinite(c.left)) return;
            // Test kosumundaki DOM taklidinde style bir CSSStyleDeclaration
            // degil; ozel degisken yazamayiz, gecerim.
            if (!cubuk.style || typeof cubuk.style.setProperty !== 'function') return;

            cubuk.style.setProperty('--cmd-sol', Math.max(0, Math.round(t.left - c.left)) + 'px');
            cubuk.style.setProperty('--cmd-sag', Math.max(0, Math.round(c.right - t.right)) + 'px');

            const altBilgi = document.querySelector('.app-footer');
            const h = c.height + (altBilgi ? altBilgi.getBoundingClientRect().height : 0);
            const kok = document.documentElement;
            if (kok && kok.style && typeof kok.style.setProperty === 'function')
                kok.style.setProperty('--alt-yukseklik', Math.round(h) + 'px');
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

        // Arac cubugu acilir menuleri sabit konumlu (bkz. css/main.css):
        // cubuk overflow-x:auto tasidigi icin normal akista kirpiliyorlardi.
        // Konumu acilis aninda vermek gerekir, CSS bunu tek basina yapamaz.
        (function acilirMenuKonumu() {
            function bagla() {
                document.querySelectorAll('.toolbar-dropdown').forEach(function (kap) {
                    // Test kosumundaki DOM taklidinde bunlar tam DOM nesnesi
                    // degil; korumasiz birakinca dosya hic yuklenmiyordu.
                    if (!kap || typeof kap.querySelector !== 'function') return;
                    var menu = kap.querySelector('.toolbar-dropdown-menu');
                    if (!menu || typeof kap.addEventListener !== 'function') return;

                    kap.addEventListener('mouseenter', function () {
                        var d = kap.getBoundingClientRect();
                        menu.style.visibility = 'hidden';
                        menu.style.display = 'block';
                        var g = menu.offsetWidth, y = menu.offsetHeight;
                        menu.style.display = '';
                        menu.style.visibility = '';

                        // Saga tasarsa sag kenara yasla; asagi sigmazsa yukari ac.
                        var sol = Math.min(d.left, window.innerWidth - g - 8);
                        var ust = (d.bottom + y > window.innerHeight - 8 && d.top - y > 8)
                            ? d.top - y : d.bottom;
                        menu.style.left = Math.max(8, sol) + 'px';
                        menu.style.top = Math.round(ust) + 'px';
                    });
                });
            }
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', bagla);
            } else {
                bagla();
            }
        })();

        // Paneller suruklenerek boyutlandirilabildigi icin olculer sabit
        // olamaz; degisimi izleyip syncPanelLayout'u cagiririz. Olculeri
        // yazan tek yer orasidir - buradan ikinci bir mekanizma kurmak
        // sonsuz ozyinelemeye yol acmisti.
        (function yerlesimDegisiminiIzle() {
            function kur() {
                const solPanel = document.querySelector('.panel');
                const sagPanel = document.querySelector('.entity-info-panel');
                const tuval = document.querySelector('.canvas-area');
                // Test kosumundaki DOM taklidinde bu elemanlar tam DOM
                // nesnesi degil; dinleyici takmaya calisinca dosya hic
                // yuklenmiyor ve icindeki her sey sessizce testsiz kaliyordu.
                if (!tuval || typeof document.addEventListener !== 'function') return;

                syncPanelLayout();

                // ResizeObserver tarayicinin cizim dongusune bagli; sekme on
                // planda degilken hic tetiklenmez. Surukleme sirasinda asagidaki
                // pointer dinleyicileri devreye girer.
                if (typeof ResizeObserver === 'function') {
                    window.__yerlesimIzleyici = new ResizeObserver(() => syncPanelLayout());
                    [solPanel, sagPanel, tuval].forEach(e => {
                        if (e) window.__yerlesimIzleyici.observe(e);
                    });
                }

                let suruklu = false;
                document.addEventListener('pointerdown', e => {
                    if (e.target && e.target.closest &&
                        e.target.closest('.panel-resize-handle, .results-resize-handle')) suruklu = true;
                }, true);
                document.addEventListener('pointermove', () => { if (suruklu) syncPanelLayout(); }, true);
                document.addEventListener('pointerup', () => {
                    if (!suruklu) return;
                    suruklu = false;
                    syncPanelLayout();
                }, true);
            }

            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', kur);
            } else {
                kur();
            }
        })();
