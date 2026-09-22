// ============================================================================
// DXFTrace - arayuz. Hesap yok: okuma app/dxf.js, tablo app/rows.js.
//
// Ilk surumden degisenler (arayuz tarafi):
//  - alert() yerine bildirim seridi: alert tarayicida her seyi kilitliyor ve
//    dosya suruklerken ust uste biniyordu.
//  - Katman adlari artik innerHTML'e GIRMIYOR. Adinda cift tirnak olan bir
//    katman (olculdu: PL"12) title="" niteligini kiriyordu; ayrica ad id
//    olarak kullanildigi icin CSS.escape ile kacis gerekiyordu. Artik DOM
//    ogesi olusturulur, ad textContent ile yazilir, eleman-ad eslemesi Map'te
//    durur.
//  - Sihirbaz adimlari dosya okunana kadar kapali (once bos sayfalara
//    gidilebiliyordu).
//  - Tuval cihaz piksel oranina gore kurulur (yuksek DPI'da bulanik degil).
// ============================================================================

var DT = (function () {
    'use strict';

    var dxfText = '', dosyaAdi = '', okundu = null;
    var katmanRenk = {}, katmanGorunur = {}, katmanSeckisi = {};   // ad -> checkbox
    var snapNoktalar = [], snapAcik = true, hoverNokta = null, secilenNokta = null, kesisimAtlandi = false;
    var kaynak = { x: 0, y: 0 };                 // gosterilen koordinat = ham - kaynak
    var ucs = { x: 0, y: 0 };
    var bicim = 'csv';
    var canvas = null, ctx = null, dpr = 1;
    var camX = 0, camY = 0, camS = 1, kaydiriyor = false, sonX = 0, sonY = 0, surukleme = 0;
    var PALET = ['#3b82f6', '#06b6d4', '#22c55e', '#f59e0b', '#ef4444', '#a78bfa', '#f472b6', '#fb923c',
                 '#34d399', '#60a5fa', '#fbbf24', '#4ade80', '#e879f9', '#2dd4bf', '#f87171'];

    // ---- kucuk yardimcilar ----------------------------------------------
    function el(id) { return document.getElementById(id); }
    function yaz(id, metin) { var e = el(id); if (e) e.textContent = metin; }
    var bildirimZaman = null;
    function bildir(metin, tur) {
        var t = el('toast');
        if (!t) return;
        t.textContent = metin;
        t.className = 'dt-toast show' + (tur ? ' ' + tur : '');
        if (bildirimZaman) clearTimeout(bildirimZaman);
        bildirimZaman = setTimeout(function () { t.className = 'dt-toast'; }, tur === 'error' ? 6000 : 3200);
    }
    function sayiBicim(v) { return (Math.round(v * 1000) / 1000).toString(); }
    function katmanAdlari() { return okundu ? Object.keys(okundu.layers).sort() : []; }

    // ---- sayfa gecisi ----------------------------------------------------
    function gotoPage(n) {
        if (n > 1 && !okundu) { bildir('Read a drawing first.', 'error'); return; }
        var sayfalar = document.querySelectorAll('.ea-page');
        var i;
        for (i = 0; i < sayfalar.length; i++) sayfalar[i].classList.remove('active');
        ['step1btn', 'step2btn', 'step3btn'].forEach(function (id, k) {
            var b = el(id);
            b.classList.remove('active', 'completed');
            if (k < n - 1) b.classList.add('completed');
            if (k === n - 1) b.classList.add('active');
        });
        el('line1').classList.toggle('completed', n > 1);
        el('line2').classList.toggle('completed', n > 2);
        el('page-' + n).classList.add('active');
        window.scrollTo({ top: 0, behavior: 'smooth' });
        if (n === 2) { katmanListesi(); setTimeout(tuvalKur, 30); }
        if (n === 3) { ihracatListesi(); preview(); }
    }

    // ---- dosya -----------------------------------------------------------
    function drop(e) {
        e.preventDefault();
        el('dropzone').classList.remove('dragover');
        var f = e.dataTransfer.files[0];
        if (f) dosyaYukle(f);
    }
    function pick(e) { var f = e.target.files[0]; if (f) dosyaYukle(f); }

    function dosyaYukle(f) {
        if (f.name.toLowerCase().slice(-4) !== '.dxf') { bildir('That is not a .dxf file.', 'error'); return; }
        dosyaAdi = f.name;
        var r = new FileReader();
        r.onerror = function () { bildir('The file could not be read.', 'error'); };
        r.onload = function (ev) {
            dxfText = ev.target.result;
            var dz = el('dropzone');
            dz.className = 'dxf-dropzone loaded';
            dz.onclick = null;
            dz.textContent = '';
            var ik = document.createElement('span'); ik.className = 'dxf-dropzone-icon'; ik.textContent = String.fromCharCode(0x2705);
            var b1 = document.createElement('div'); b1.className = 'dxf-dropzone-title'; b1.textContent = f.name;
            var b2 = document.createElement('div'); b2.className = 'dxf-dropzone-sub';
            b2.textContent = 'Loaded - check the settings below, then read the drawing.';
            dz.appendChild(ik); dz.appendChild(b1); dz.appendChild(b2);
            el('fileInfoRow').style.display = 'flex';
            yaz('fileNameBadge', f.name);
            yaz('fileSizeBadge', (f.size / 1024).toFixed(1) + ' KB');
            el('settingsPanel').style.display = 'block';
            bildir('File loaded - ' + (f.size / 1024).toFixed(0) + ' KB.');
        };
        r.readAsText(f);
    }

    // ---- okuma -----------------------------------------------------------
    function parse() {
        if (!dxfText) { bildir('Load a DXF file first.', 'error'); return; }
        var t0 = (window.performance && performance.now) ? performance.now() : 0;
        okundu = dxfOku(dxfText, {
            line: el('chkLine').checked, poly: el('chkPoly').checked,
            circle: el('chkCircle').checked, arc: el('chkArc').checked,
            point: el('chkPoint').checked, insert: el('chkInsert').checked,
            yaySegman: parseInt(el('arcSeg').value, 10) || 24,
            dedup: el('chkDedup').checked, dedupTol: parseFloat(el('dedupTol').value) || 15
        });
        var sure = ((window.performance && performance.now) ? performance.now() : 0) - t0;

        katmanRenk = {}; katmanGorunur = {}; katmanSeckisi = {};
        katmanAdlari().forEach(function (ad, i) { katmanRenk[ad] = PALET[i % PALET.length]; katmanGorunur[ad] = true; });

        var s = okundu.stats;
        yaz('statLayers', s.layers); yaz('statSegments', s.segments);
        yaz('statCurves', s.circles + s.arcs); yaz('statPoints', s.points);
        yaz('canvasCount', 'Entities: ' + s.entities);

        var birim = birimAdi(okundu.header.birim);
        var ub = el('unitBadge');
        ub.style.display = birim ? 'inline-flex' : 'none';
        ub.textContent = 'units: ' + (birim || '-');

        ucs = { x: okundu.header.ucs.x, y: okundu.header.ucs.y };
        var ucsVar = Math.abs(ucs.x) > 1e-9 || Math.abs(ucs.y) > 1e-9;
        var ub2 = el('useUcsBtn');
        ub2.style.display = ucsVar ? 'inline-flex' : 'none';
        ub2.textContent = ucsVar ? ('Use UCS (' + sayiBicim(ucs.x) + ', ' + sayiBicim(ucs.y) + ')') : 'Use UCS origin';

        secilenNokta = null; hoverNokta = null;
        snapYenile();
        kaynakUygula(ucsVar ? ucs.x : 0, ucsVar ? ucs.y : 0);

        uyarilariGoster(ucsVar);
        el('btn1to2').style.display = 'inline-flex';
        el('step2btn').disabled = false; el('step3btn').disabled = false;
        el('btnHeaderExport').disabled = false;

        if (!s.layers) { bildir('No geometry found. Check the entity types, or the file may be a binary DXF.', 'error'); return; }
        bildir(s.layers + ' layers, ' + s.entities + ' entities read in ' + sure.toFixed(0) + ' ms.');
        gotoPage(2);
    }

    function uyarilariGoster(ucsVar) {
        var liste = el('warnList'), notlar = (okundu ? okundu.warnings : []).slice();
        if (ucsVar) notlar.unshift('UCS origin found in the file (' + sayiBicim(ucs.x) + ', ' + sayiBicim(ucs.y) +
                                   '); coordinates are shown relative to it. "Raw 0,0" switches back.');
        if (okundu && okundu.stats.atilan) notlar.push(okundu.stats.atilan + ' duplicate parallel line(s) dropped by the tolerance.');
        if (okundu && okundu.stats.acilan) notlar.push(okundu.stats.acilan + ' entity(ies) came from ' + okundu.stats.insertler + ' block reference(s).');
        if (kesisimAtlandi) notlar.push('Too many segments for intersection snaps - endpoints, midpoints, centres and vertices are still available.');
        liste.textContent = '';
        notlar.forEach(function (n) {
            var d = document.createElement('div');
            d.className = 'warn-item';
            d.textContent = n;
            liste.appendChild(d);
        });
        el('warnPanel').style.display = notlar.length ? 'block' : 'none';
    }

    // ---- katman listesi (DOM; ad asla HTML'e girmez) ----------------------
    function katmanListesi() {
        var kutu = el('layerList');
        kutu.textContent = '';
        var adlar = katmanAdlari();
        if (!adlar.length) {
            var bos = document.createElement('div');
            bos.style.cssText = 'text-align:center;padding:20px;color:var(--text-muted);font-size:var(--fs-xs)';
            bos.textContent = 'No layers';
            kutu.appendChild(bos); return;
        }
        adlar.forEach(function (ad) {
            var satir = document.createElement('div');
            satir.className = 'layer-item' + (katmanGorunur[ad] ? ' vis-on' : '');
            var sw = document.createElement('div'); sw.className = 'layer-swatch'; sw.style.background = katmanRenk[ad];
            var isim = document.createElement('span'); isim.className = 'layer-name'; isim.textContent = ad; isim.title = ad;
            var say = document.createElement('span'); say.className = 'layer-count'; say.textContent = okundu.layers[ad].length;
            // Gorunurluk isareti: dolu / bos daire. Emoji goz (U+1F441) bu
            // yazi tipinde kutu olarak ciziliyordu - olculdu, tarayicida
            // bos kare gorundu.
            var goz = document.createElement('span'); goz.className = 'layer-eye';
            goz.textContent = katmanGorunur[ad] ? String.fromCharCode(0x25CF) : String.fromCharCode(0x25CB);
            goz.title = katmanGorunur[ad] ? 'Visible - click to hide' : 'Hidden - click to show';
            satir.appendChild(sw); satir.appendChild(isim); satir.appendChild(say); satir.appendChild(goz);
            satir.onclick = function () {
                katmanGorunur[ad] = !katmanGorunur[ad];
                katmanListesi(); snapYenile(); draw();
            };
            kutu.appendChild(satir);
        });
    }
    function allLayers(v) {
        katmanAdlari().forEach(function (ad) { katmanGorunur[ad] = v; });
        katmanListesi(); snapYenile(); draw();
    }

    // ---- snap ------------------------------------------------------------
    function snapYenile() {
        if (!okundu) { snapNoktalar = []; return; }
        var s = snapNoktalari(okundu.layers, katmanGorunur, 3000);
        snapNoktalar = s.points;
        kesisimAtlandi = s.intersectionsSkipped;
        yaz('canvasSnapCount', 'Snap pts: ' + snapNoktalar.length + (kesisimAtlandi ? ' (no intersections)' : ''));
        if (secilenNokta) noktaOkumasi();
    }
    function snapToggle(v) { snapAcik = v; hoverNokta = null; draw(); }
    function enYakinSnap(px, py, yaricap) {
        if (!snapAcik) return null;
        var en = null, ed = yaricap * yaricap, i, p, sx, sy, dx, dy, d;
        for (i = 0; i < snapNoktalar.length; i++) {
            p = snapNoktalar[i];
            sx = p.x * camS + camX; sy = -p.y * camS + camY;
            dx = sx - px; dy = sy - py; d = dx * dx + dy * dy;
            if (d < ed) { ed = d; en = p; }
        }
        return en;
    }
    var TUR_ADI = { end: 'endpoint', mid: 'midpoint', int: 'intersection', center: 'centre', quad: 'quadrant', node: 'point' };
    function noktaOkumasi() {
        var k = el('ptKind'), c = el('ptCoord'), h = el('ptCoordRaw'), kp = el('ptCopyBtn'), ob = el('ptOriginBtn');
        if (!secilenNokta) {
            k.style.display = 'none'; c.textContent = '- click a snap point -'; h.textContent = '';
            kp.disabled = true; ob.disabled = true; return;
        }
        var rx = secilenNokta.x - kaynak.x, ry = secilenNokta.y - kaynak.y;
        k.style.display = 'inline-block'; k.textContent = TUR_ADI[secilenNokta.kind] || 'point';
        c.textContent = 'X ' + sayiBicim(rx) + '   Y ' + sayiBicim(ry);
        var kaydi = Math.abs(kaynak.x) > 1e-9 || Math.abs(kaynak.y) > 1e-9;
        h.textContent = kaydi ? ('raw DXF: ' + sayiBicim(secilenNokta.x) + ', ' + sayiBicim(secilenNokta.y)) : '';
        kp.disabled = false; ob.disabled = false;
    }
    function copyPoint() {
        if (!secilenNokta) return;
        var metin = sayiBicim(secilenNokta.x - kaynak.x) + ',' + sayiBicim(secilenNokta.y - kaynak.y);
        panoyaYaz(metin, 'Point copied: ' + metin);
    }
    function panoyaYaz(metin, mesaj) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(metin).then(function () { bildir(mesaj); },
                function () { bildir('The browser blocked clipboard access.', 'error'); });
        } else { bildir('The browser blocked clipboard access.', 'error'); }
    }

    // ---- kaynak noktasi --------------------------------------------------
    function kaynakUygula(ox, oy) {
        kaynak = { x: ox, y: oy };
        var fx = el('originX'), fy = el('originY');
        if (fx) fx.value = ox; if (fy) fy.value = oy;
        yaz('originBadge', 'Origin: ' + sayiBicim(ox) + ', ' + sayiBicim(oy));
        noktaOkumasi(); preview(); draw();
    }
    function originFromFields() {
        kaynakUygula(parseFloat(el('originX').value) || 0, parseFloat(el('originY').value) || 0);
    }
    function useUcs() { kaynakUygula(ucs.x, ucs.y); bildir('Origin set to the drawing UCS.'); }
    function resetOrigin() { kaynakUygula(0, 0); bildir('Raw DXF (WCS) coordinates.'); }
    function pointAsOrigin() {
        if (!secilenNokta) return;
        kaynakUygula(secilenNokta.x, secilenNokta.y);
        bildir('0,0 is now the selected point.');
    }

    // ---- tuval -----------------------------------------------------------
    function tuvalKur() {
        canvas = el('dxfCanvas');
        if (!canvas) return;
        ctx = canvas.getContext('2d');
        dpr = window.devicePixelRatio || 1;
        var kutu = canvas.parentElement;
        // Yukseklik: genisligin 0.58 kati ama 620 px'i gecmesin - genis
        // ekranda tuval sayfayi asiyordu (olculdu: 1238 px genislikte 718 px).
        var w = kutu.clientWidth || 900, h = Math.min(620, Math.max(420, Math.round(w * 0.58)));
        canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
        canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        fit();
    }
    function tuvalOlcu() { return { w: canvas ? canvas.width / dpr : 900, h: canvas ? canvas.height / dpr : 560 }; }
    function fit() {
        if (!canvas) { tuvalKur(); return; }
        var s = sinirKutusu(okundu ? okundu.layers : {}, katmanGorunur);
        var o = tuvalOlcu(), pad = 44;
        var W = o.w - 2 * pad, H = o.h - 2 * pad;
        var gw = (s.maxX - s.minX) || 1, gh = (s.maxY - s.minY) || 1;
        camS = Math.min(W / gw, H / gh);
        camX = pad - s.minX * camS + (W - gw * camS) / 2;
        camY = pad + s.maxY * camS + (H - gh * camS) / 2;
        draw();
    }
    function zoom(f) {
        var o = tuvalOlcu();
        camX = o.w / 2 - (o.w / 2 - camX) * f;
        camY = o.h / 2 - (o.h / 2 - camY) * f;
        camS *= f; draw();
    }
    // Tuval renkleri CSS degiskenlerinden okunur: arac acik temaya gecince
    // (Midship ile ayni app.css) tuvalin koyu kalmasi gerekmesin diye.
    function temaRenk(ad, varsayilan) {
        var v = getComputedStyle(document.body).getPropertyValue(ad);
        return (v && v.trim()) ? v.trim() : varsayilan;
    }
    function draw() {
        if (!canvas) return;
        var o = tuvalOlcu();
        ctx.clearRect(0, 0, o.w, o.h);
        ctx.fillStyle = temaRenk('--bg-secondary', '#0a0e17'); ctx.fillRect(0, 0, o.w, o.h);
        // izgara
        ctx.strokeStyle = temaRenk('--border', 'rgba(59,130,246,0.15)'); ctx.lineWidth = 0.5;
        var adim = 50, x, y;
        for (x = ((camX % adim) + adim) % adim; x < o.w; x += adim) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, o.h); ctx.stroke(); }
        for (y = ((camY % adim) + adim) % adim; y < o.h; y += adim) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(o.w, y); ctx.stroke(); }
        // kaynak isareti (gosterilen 0,0)
        var kx = kaynak.x * camS + camX, ky = -kaynak.y * camS + camY;
        ctx.strokeStyle = 'rgba(6,182,212,0.6)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(kx - 14, ky); ctx.lineTo(kx + 14, ky); ctx.moveTo(kx, ky - 14); ctx.lineTo(kx, ky + 14); ctx.stroke();
        ctx.beginPath(); ctx.arc(kx, ky, 4, 0, Math.PI * 2); ctx.stroke();
        // geometri
        if (okundu) {
            var d = Math.PI / 180;
            katmanAdlari().forEach(function (ad) {
                if (!katmanGorunur[ad]) return;
                ctx.strokeStyle = katmanRenk[ad]; ctx.fillStyle = katmanRenk[ad]; ctx.lineWidth = 1.2;
                okundu.layers[ad].forEach(function (e) {
                    var X1 = e.x1 * camS + camX, Y1 = -e.y1 * camS + camY;
                    if (e.type === 'POINT') {
                        ctx.beginPath(); ctx.arc(X1, Y1, 2.5, 0, Math.PI * 2); ctx.fill(); return;
                    }
                    if (e.type === 'CIRCLE') {
                        ctx.beginPath(); ctx.arc(e.cx * camS + camX, -e.cy * camS + camY, Math.abs(e.r) * camS, 0, Math.PI * 2); ctx.stroke(); return;
                    }
                    if (e.type === 'ARC') {
                        ctx.beginPath();
                        ctx.arc(e.cx * camS + camX, -e.cy * camS + camY, Math.abs(e.r) * camS, -e.a1 * d, -e.a2 * d, true);
                        ctx.stroke(); return;
                    }
                    ctx.beginPath(); ctx.moveTo(X1, Y1); ctx.lineTo(e.x2 * camS + camX, -e.y2 * camS + camY); ctx.stroke();
                });
            });
        }
        snapIsareti(hoverNokta, false);
        snapIsareti(secilenNokta, true);
        yaz('canvasZoom', 'Zoom: ' + Math.round(camS * 100) + '%');
    }
    function snapIsareti(p, secili) {
        if (!p || !ctx) return;
        var sx = p.x * camS + camX, sy = -p.y * camS + camY;
        var renk = { end: '#22c55e', mid: '#60a5fa', int: '#f59e0b', center: '#06b6d4', quad: '#a78bfa', node: '#f472b6' }[p.kind] || '#22c55e';
        ctx.save();
        ctx.strokeStyle = renk; ctx.lineWidth = 1.5;
        if (secili) {
            ctx.beginPath(); ctx.arc(sx, sy, 8, 0, Math.PI * 2); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(sx - 14, sy); ctx.lineTo(sx + 14, sy); ctx.moveTo(sx, sy - 14); ctx.lineTo(sx, sy + 14); ctx.stroke();
            var etiket = sayiBicim(p.x - kaynak.x) + ', ' + sayiBicim(p.y - kaynak.y);
            ctx.font = '11px "JetBrains Mono", monospace';
            var w = ctx.measureText(etiket).width;
            ctx.fillStyle = temaRenk('--bg-primary', '#0a0e17'); ctx.globalAlpha = 0.92;
            ctx.fillRect(sx + 12, sy - 26, w + 12, 18); ctx.globalAlpha = 1;
            ctx.strokeRect(sx + 12, sy - 26, w + 12, 18);
            ctx.fillStyle = renk; ctx.fillText(etiket, sx + 18, sy - 13);
        } else {
            ctx.strokeRect(sx - 5, sy - 5, 10, 10);
        }
        ctx.restore();
    }

    // ---- ihracat listesi -------------------------------------------------
    function ihracatListesi() {
        var kutu = el('exportLayerList');
        kutu.textContent = ''; katmanSeckisi = {};
        var adlar = katmanAdlari();
        if (!adlar.length) {
            var bos = document.createElement('div');
            bos.style.cssText = 'color:var(--text-muted);font-size:var(--fs-xs)';
            bos.textContent = 'No layers'; kutu.appendChild(bos); return;
        }
        adlar.forEach(function (ad) {
            var satir = document.createElement('div'); satir.className = 'export-layer-item';
            var etiket = document.createElement('label');
            var cb = document.createElement('input');
            cb.type = 'checkbox'; cb.className = 'export-cb'; cb.checked = katmanGorunur[ad] !== false;
            cb.onchange = preview;
            var sw = document.createElement('div'); sw.className = 'export-swatch'; sw.style.background = katmanRenk[ad];
            var isim = document.createElement('span'); isim.className = 'export-layer-name'; isim.textContent = ad; isim.title = ad;
            etiket.appendChild(cb); etiket.appendChild(sw); etiket.appendChild(isim);
            var say = document.createElement('span'); say.className = 'export-layer-stats';
            var n = okundu.layers[ad].length;
            say.textContent = n + (n === 1 ? ' entity' : ' entities');
            satir.appendChild(etiket); satir.appendChild(say);
            kutu.appendChild(satir);
            katmanSeckisi[ad] = cb;
        });
    }
    function allExport(v) {
        Object.keys(katmanSeckisi).forEach(function (ad) { katmanSeckisi[ad].checked = v; });
        preview();
    }
    function secilenKatmanlar() {
        return katmanAdlari().filter(function (ad) { return katmanSeckisi[ad] && katmanSeckisi[ad].checked; });
    }
    function setFmt(f, e) {
        bicim = f;
        var hepsi = document.querySelectorAll('.fmt-opt'), i;
        for (i = 0; i < hepsi.length; i++) hepsi[i].classList.remove('active');
        if (e) e.classList.add('active');
        preview();
    }
    function scaleChanged() {
        var s = el('scaleSel').value;
        el('scaleCustom').style.display = (s === 'custom') ? 'block' : 'none';
        preview();
    }
    function olcek() {
        var s = el('scaleSel').value;
        if (s === 'custom') return parseFloat(el('scaleCustom').value) || 1;
        return parseFloat(s) || 1;
    }
    function tabloAyari() {
        return {
            ox: parseFloat(el('originX').value) || 0,
            oy: parseFloat(el('originY').value) || 0,
            olcek: olcek(),
            zUstuneYaz: el('zFix').checked,
            z: parseFloat(el('zValue').value) || 0,
            basamak: parseInt(el('decimals').value, 10),
            kolonlar: {
                layer: el('colLayer').checked, type: el('colType').checked,
                x1: el('colX1').checked, y1: el('colY1').checked, z1: el('colZ1').checked,
                x2: el('colX2').checked, y2: el('colY2').checked, z2: el('colZ2').checked,
                len: el('colLen').checked, arc: el('colArc').checked, src: el('colSrc').checked
            }
        };
    }
    function katmanSatirlari(ad, cfg) { return tabloSatirlari(okundu.layers[ad] || [], cfg); }
    function tumSatirlar(cfg) {
        var out = [];
        secilenKatmanlar().forEach(function (ad) { katmanSatirlari(ad, cfg).forEach(function (r) { out.push(r); }); });
        return out;
    }
    function tabanAd() {
        var a = dosyaAdi.replace(/\.dxf$/i, '');
        return a || 'dxftrace';
    }

    function preview() {
        if (!okundu || !el('page-3')) return;
        el('zValue').disabled = !el('zFix').checked;
        var cfg = tabloAyari(), bol = el('splitByLayer').checked;
        var onizleme = el('exportPreview');
        if (bol) {
            var dosyalar = secilenKatmanlar().map(function (ad) { return { ad: ad, say: katmanSatirlari(ad, cfg).length }; })
                                             .filter(function (f) { return f.say; });
            yaz('previewCount', dosyalar.length + ' file' + (dosyalar.length === 1 ? '' : 's') + ' in a .zip');
            if (!dosyalar.length) { onizleme.textContent = 'Pick at least one layer.'; return; }
            var metin = 'one file per layer, bundled as ' + tabanAd() + '_layers.zip' + String.fromCharCode(10) + String.fromCharCode(10);
            dosyalar.forEach(function (f) {
                metin += '  ' + guvenliAd(tabanAd() + '_' + f.ad + '.' + uzanti(bicim)) + '   (' + f.say + ' rows)' + String.fromCharCode(10);
            });
            onizleme.textContent = metin;
            return;
        }
        var rows = tumSatirlar(cfg);
        yaz('previewCount', rows.length + ' rows');
        if (!rows.length) { onizleme.textContent = 'Pick at least one layer.'; return; }
        var sinir = (bicim === 'json') ? 8 : 14;
        var kirpik = rows.slice(0, sinir);
        var govde = tabloYaz(kirpik, bicim);
        if (rows.length > sinir) govde += String.fromCharCode(10) + '... ' + (rows.length - sinir) + ' more rows';
        onizleme.textContent = govde;
    }

    function download() {
        if (!okundu) { bildir('Read a drawing first.', 'error'); return; }
        var cfg = tabloAyari(), bol = el('splitByLayer').checked, katmanlar = secilenKatmanlar();
        if (!katmanlar.length) { bildir('Pick at least one layer.', 'error'); return; }
        if (!bol) {
            var rows = tumSatirlar(cfg);
            if (!rows.length) { bildir('Nothing to write - the selected layers are empty.', 'error'); return; }
            indir(new Blob([tabloYaz(rows, bicim)], { type: mime(bicim) }), tabanAd() + '_dxftrace.' + uzanti(bicim));
            bildir(rows.length + ' rows written.');
            return;
        }
        var dosyalar = [];
        katmanlar.forEach(function (ad) {
            var rows = katmanSatirlari(ad, cfg);
            if (rows.length) dosyalar.push({ name: guvenliAd(tabanAd() + '_' + ad + '.' + uzanti(bicim)), data: tabloYaz(rows, bicim) });
        });
        if (!dosyalar.length) { bildir('Nothing to write - the selected layers are empty.', 'error'); return; }
        indir(new Blob([zipBaytlari(dosyalar)], { type: 'application/zip' }), tabanAd() + '_layers.zip');
        bildir(dosyalar.length + ' files zipped.');
    }
    function copyTable() {
        if (!okundu) return;
        var rows = tumSatirlar(tabloAyari());
        if (!rows.length) { bildir('Pick at least one layer.', 'error'); return; }
        panoyaYaz(tabloYaz(rows, bicim), rows.length + ' rows copied.');
    }
    function indir(blob, ad) {
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = ad;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 1500);
    }

    // ---- sifirla ---------------------------------------------------------
    function reset() {
        dxfText = ''; dosyaAdi = ''; okundu = null;
        katmanRenk = {}; katmanGorunur = {}; katmanSeckisi = {};
        snapNoktalar = []; hoverNokta = null; secilenNokta = null; kesisimAtlandi = false;
        camX = 0; camY = 0; camS = 1; ucs = { x: 0, y: 0 };
        el('dxfFileInput').value = '';
        var dz = el('dropzone');
        dz.className = 'dxf-dropzone';
        dz.onclick = function () { el('dxfFileInput').click(); };
        dz.textContent = '';
        var ik = document.createElement('span'); ik.className = 'dxf-dropzone-icon'; ik.textContent = String.fromCharCode(0x1F4D0);
        var b1 = document.createElement('div'); b1.className = 'dxf-dropzone-title'; b1.textContent = 'Drop a DXF file here';
        var b2 = document.createElement('div'); b2.className = 'dxf-dropzone-sub';
        b2.textContent = 'or click to browse - ASCII DXF (AutoCAD R12 and newer). The file never leaves your browser.';
        dz.appendChild(ik); dz.appendChild(b1); dz.appendChild(b2);
        el('fileInfoRow').style.display = 'none';
        el('settingsPanel').style.display = 'none';
        el('warnPanel').style.display = 'none';
        el('btn1to2').style.display = 'none';
        el('unitBadge').style.display = 'none';
        el('useUcsBtn').style.display = 'none';
        el('step2btn').disabled = true; el('step3btn').disabled = true; el('btnHeaderExport').disabled = true;
        ['statLayers', 'statSegments', 'statCurves', 'statPoints'].forEach(function (id) { yaz(id, String.fromCharCode(0x2014)); });
        yaz('canvasCount', 'Entities: -'); yaz('canvasSnapCount', 'Snap pts: -');
        el('layerList').textContent = ''; el('exportLayerList').textContent = '';
        el('exportPreview').textContent = 'Pick at least one layer.';
        yaz('previewCount', String.fromCharCode(0x2014));
        kaynakUygula(0, 0);
        gotoPage(1);
        if (canvas) draw();
        bildir('Cleared.');
    }

    // ---- olaylar ---------------------------------------------------------
    document.addEventListener('DOMContentLoaded', function () {
        canvas = el('dxfCanvas');
        if (!canvas) return;
        ctx = canvas.getContext('2d');
        canvas.addEventListener('wheel', function (e) {
            e.preventDefault();
            var f = e.deltaY < 0 ? 1.15 : 0.87;
            camX = e.offsetX - (e.offsetX - camX) * f;
            camY = e.offsetY - (e.offsetY - camY) * f;
            camS *= f; draw();
        }, { passive: false });
        canvas.addEventListener('mousedown', function (e) {
            kaydiriyor = true; sonX = e.clientX; sonY = e.clientY; surukleme = 0;
            canvas.style.cursor = 'grabbing';
        });
        canvas.addEventListener('mousemove', function (e) {
            if (kaydiriyor) {
                var dx = e.clientX - sonX, dy = e.clientY - sonY;
                camX += dx; camY += dy; sonX = e.clientX; sonY = e.clientY;
                surukleme += Math.abs(dx) + Math.abs(dy);
                draw();
            }
            var p = enYakinSnap(e.offsetX, e.offsetY, 14);
            var degisti = (p !== hoverNokta);
            hoverNokta = p;
            canvas.style.cursor = kaydiriyor ? 'grabbing' : (p ? 'pointer' : 'crosshair');
            if (!kaydiriyor && degisti) draw();
            var wx = (e.offsetX - camX) / camS, wy = -(e.offsetY - camY) / camS;
            var kaydi = Math.abs(kaynak.x) > 1e-9 || Math.abs(kaynak.y) > 1e-9;
            yaz('canvasCursor', 'Cursor: (' + (wx - kaynak.x).toFixed(1) + ', ' + (wy - kaynak.y).toFixed(1) + ')' +
                (kaydi ? ' [raw ' + wx.toFixed(1) + ', ' + wy.toFixed(1) + ']' : ''));
        });
        canvas.addEventListener('mouseup', function (e) {
            kaydiriyor = false; canvas.style.cursor = 'crosshair';
            if (surukleme < 5) {
                var p = enYakinSnap(e.offsetX, e.offsetY, 14);
                if (p) { secilenNokta = p; noktaOkumasi(); }
            }
            draw();
        });
        canvas.addEventListener('mouseleave', function () {
            kaydiriyor = false; canvas.style.cursor = 'crosshair'; hoverNokta = null; draw();
        });
        window.addEventListener('resize', function () {
            if (el('page-2').classList.contains('active')) tuvalKur();
        });
        document.addEventListener('keydown', function (e) {
            if (!el('page-2').classList.contains('active')) return;
            var t = e.target && e.target.tagName;
            if (t === 'INPUT' || t === 'SELECT' || t === 'TEXTAREA') return;
            if (e.key === 'f' || e.key === 'F') { fit(); }
            else if (e.key === 'Escape') { secilenNokta = null; noktaOkumasi(); draw(); }
        });
    });

    return {
        gotoPage: gotoPage, drop: drop, pick: pick, parse: parse,
        allLayers: allLayers, snapToggle: snapToggle, zoom: zoom, fit: fit,
        copyPoint: copyPoint, pointAsOrigin: pointAsOrigin, useUcs: useUcs, resetOrigin: resetOrigin,
        originFromFields: originFromFields, allExport: allExport, setFmt: setFmt, scaleChanged: scaleChanged,
        preview: preview, download: download, copyTable: copyTable, reset: reset
    };
}());
