// ============================================================================
// DXF OKUYUCU - TEK KAYNAK: Apps/_standart/dxf/dxf-oku.js
//   Dagitim: python _standart/dxf/dxf-yay.py    (DXFTrace + LumoStruct, kaynak
//   ve site kopyalari). Bu dosyalari ELLE duzenleme; burayi duzelt, dagit.
//   Denetim: node _standart/dxf/verify-dxf-tekkaynak.js
//
// DXF okuyucu ve geometri (saf; tarayici ve node ayni kodu kosar)
//
// Yuklenen ilk surumde olculen hatalar ve buradaki karsiliklari:
//
//  1) BOLUM SINIRI YOKTU. Tarayici "0 / LINE" gorunce nerede oldugunu
//     sormuyordu: BLOCKS bolumundeki blok TANIMI da cizim gibi okunuyordu.
//     Olculdu (tests/data/ornek.dxf): BRACKET blogunun icindeki cizgi
//     BRACKET-GEO katmaninda (0,0)-(300,300) diye gorundu - oysa cizimde
//     (4500,0) noktasina yerlestirilmis. Artik bolumler takip edilir; blok
//     tanimlari ayri tutulur ve INSERT ile ACILIR (olcek, donme, taban nokta).
//  2) KAPALI LWPOLYLINE'in kapanis kenari dusuyordu (70 biti 1): 4 koseli
//     kapali cokgen 3 kenar veriyordu.
//  3) BULGE (kod 42) yok sayiliyordu: yay, kiris olarak cikiyordu. Artik
//     bulge = tan(delta/4) bagintisiyla yaya cevrilip parcalanir.
//  4) LWPOLYLINE yuksekligi (kod 38) z'ye gitmiyordu.
//  5) DEDUP OLCEGE BAGLIYDI: yon "|dx| < 1" ile belirleniyordu. Metre olcekli
//     cizimde 0.4 m'lik her parca "dusey" sayilip 0.6 m otedeki BASKA bir
//     cizgi kopya diye siliniyordu (olculdu: METRE-SCALE 2 -> 1 cizgi).
//     Artik yon aci ile belirlenir, mesafe dik uzaklik olarak olculur ve
//     esik kullanicinin verdigi tolerans (cizim birimi) ile karsilastirilir.
//  6) CIRCLE/ARC yaricapi hic disa vurulmuyordu (x2,y2 merkezin tekrariydi).
//     Artik yay baslangic/bitis noktasi hesaplanir, merkez + yaricap + acilar
//     ayri alanlarda durur.
//  7) POINT okunmuyordu - oysa dugum noktalari genelde POINT olarak gelir.
//
// Birimler: DXF ne diyorsa o (cizim birimi). Donusum ihracatta yapilir.
// ============================================================================

(function (kok) {
    'use strict';
    var NL = String.fromCharCode(10), CR = String.fromCharCode(13);

    // ---- kucuk yardimcilar ----------------------------------------------
    function sayi(v) { var f = parseFloat(v); return isFinite(f) ? f : 0; }
    function bayrak(v, bit) { return (parseInt(v, 10) & bit) === bit; }

    // (kod, deger) cifti listesi. DXF her zaman iki satir: kod, deger.
    function ciftler(metin) {
        var ham = metin.split(NL), out = [], i, s;
        for (i = 0; i < ham.length; i++) {
            s = ham[i];
            if (s.length && s.charAt(s.length - 1) === CR) s = s.slice(0, -1);
            out.push(s.trim());
        }
        return out;
    }

    // ---- ana okuyucu ----------------------------------------------------
    // secenekler: { line, poly, circle, arc, point, insert, yaySegman,
    //               dedup, dedupTol }
    function dxfOku(metin, secenekler) {
        var s = secenekler || {};
        var ister = {
            LINE: s.line !== false, LWPOLYLINE: s.poly !== false, POLYLINE: s.poly !== false,
            CIRCLE: s.circle !== false, ARC: s.arc !== false, POINT: !!s.point
        };
        var yaySegman = s.yaySegman > 2 ? s.yaySegman : 24;   // tam dairede parca sayisi
        var satir = ciftler(metin);
        var uyarilar = [], baslik = { ucs: { x: 0, y: 0, z: 0 }, insbase: { x: 0, y: 0, z: 0 }, birim: null };

        var bolum = '', blokAdi = null, bloklar = {}, cizim = [], insertler = [];
        var atlanan = {};        // tanınmayan / kapsam disi entity turleri -> sayi
        var i = 0, n = satir.length;

        function baslikOku(ad, hedef) {
            var j = i + 2, kod;          // (9, ad) ciftinden SONRAKI cift
            while (j < n - 1) {
                kod = satir[j];
                if (kod === '9' || kod === '0') break;
                if (kod === '10') hedef.x = sayi(satir[j + 1]);
                else if (kod === '20') hedef.y = sayi(satir[j + 1]);
                else if (kod === '30') hedef.z = sayi(satir[j + 1]);
                j += 2;
            }
        }

        while (i < n - 1) {
            var kod = satir[i], deger = satir[i + 1];

            if (kod === '0') {
                if (deger === 'SECTION') {
                    // bolum adi hemen ardindan (2, ad) olarak gelir
                    bolum = (satir[i + 2] === '2') ? satir[i + 3] : '';
                    i += 4; continue;
                }
                if (deger === 'ENDSEC') { bolum = ''; blokAdi = null; i += 2; continue; }
                if (deger === 'EOF') break;

                if (bolum === 'BLOCKS' && deger === 'BLOCK') {
                    var blk = { ad: '', taban: { x: 0, y: 0, z: 0 }, ogeler: [], insertler: [] };
                    var j2 = i + 2;
                    while (j2 < n - 1 && satir[j2] !== '0') {
                        if (satir[j2] === '2' && !blk.ad) blk.ad = satir[j2 + 1];
                        else if (satir[j2] === '10') blk.taban.x = sayi(satir[j2 + 1]);
                        else if (satir[j2] === '20') blk.taban.y = sayi(satir[j2 + 1]);
                        else if (satir[j2] === '30') blk.taban.z = sayi(satir[j2 + 1]);
                        j2 += 2;
                    }
                    blokAdi = blk.ad || ('BLOCK_' + Object.keys(bloklar).length);
                    bloklar[blokAdi] = blk;
                    i = j2; continue;
                }
                if (bolum === 'BLOCKS' && deger === 'ENDBLK') { blokAdi = null; i += 2; continue; }

                // ---- entity ----
                if (bolum === 'ENTITIES' || (bolum === 'BLOCKS' && blokAdi)) {
                    var tur = deger, alan = {}, x = [], y = [], bul = [], j3 = i + 2, vertexler = null;
                    // POLYLINE (eski bicim) VERTEX alt ogeleriyle gelir - onlari
                    // burada toplamak gerekir, cunku araya "0 / VERTEX" giriyor.
                    while (j3 < n - 1 && satir[j3] !== '0') {
                        var c = satir[j3], v = satir[j3 + 1];
                        if (!(c in alan)) alan[c] = v;
                        if (c === '10') x.push(sayi(v));
                        else if (c === '20') y.push(sayi(v));
                        else if (c === '42') bul.push({ i: Math.max(0, x.length - 1), b: sayi(v) });
                        j3 += 2;
                    }
                    if (tur === 'POLYLINE') {
                        vertexler = { x: [], y: [], bul: [], kapali: bayrak(alan['70'] || '0', 1) };
                        // ardindan gelen VERTEX / SEQEND dizisi
                        while (j3 < n - 1 && satir[j3] === '0' && satir[j3 + 1] === 'VERTEX') {
                            var k = j3 + 2, vx = 0, vy = 0, vb = 0;
                            while (k < n - 1 && satir[k] !== '0') {
                                if (satir[k] === '10') vx = sayi(satir[k + 1]);
                                else if (satir[k] === '20') vy = sayi(satir[k + 1]);
                                else if (satir[k] === '42') vb = sayi(satir[k + 1]);
                                k += 2;
                            }
                            vertexler.x.push(vx); vertexler.y.push(vy); vertexler.bul.push(vb);
                            j3 = k;
                        }
                        if (j3 < n - 1 && satir[j3] === '0' && satir[j3 + 1] === 'SEQEND') {
                            var k2 = j3 + 2;
                            while (k2 < n - 1 && satir[k2] !== '0') k2 += 2;
                            j3 = k2;
                        }
                    }

                    var katman = alan['8'] || '0';
                    var hedefListe = (bolum === 'BLOCKS') ? bloklar[blokAdi].ogeler : cizim;
                    var hedefIns = (bolum === 'BLOCKS') ? bloklar[blokAdi].insertler : insertler;

                    if (tur === 'INSERT') {
                        hedefIns.push({
                            blok: alan['2'] || '', katman: katman,
                            x: sayi(alan['10']), y: sayi(alan['20']), z: sayi(alan['30']),
                            sx: alan['41'] !== undefined ? sayi(alan['41']) : 1,
                            sy: alan['42'] !== undefined ? sayi(alan['42']) : 1,
                            rot: sayi(alan['50']),
                            sutun: alan['70'] !== undefined ? parseInt(alan['70'], 10) || 1 : 1,
                            satirS: alan['71'] !== undefined ? parseInt(alan['71'], 10) || 1 : 1,
                            dx: sayi(alan['44']), dy: sayi(alan['45'])
                        });
                    } else if (ister[tur]) {
                        ogeEkle(hedefListe, tur, katman, alan, x, y, bul, vertexler, yaySegman);
                    } else if (tur !== 'VERTEX' && tur !== 'SEQEND' && bolum === 'ENTITIES') {
                        atlanan[tur] = (atlanan[tur] || 0) + 1;
                    }
                    i = j3; continue;
                }
                i += 2; continue;
            }

            if (bolum === 'HEADER' && kod === '9') {
                if (deger === '$UCSORG') baslikOku(deger, baslik.ucs);
                else if (deger === '$INSBASE') baslikOku(deger, baslik.insbase);
                else if (deger === '$INSUNITS') baslik.birim = parseInt(satir[i + 3], 10);
                i += 2; continue;
            }
            i += 2;
        }

        // ---- INSERT'leri ac -------------------------------------------------
        var acilan = 0, eksikBlok = {};
        if (s.insert !== false) {
            insertler.forEach(function (ins) {
                var say = blokAc(ins, bloklar, cizim, 0, eksikBlok);
                acilan += say;
            });
        } else if (insertler.length) {
            uyarilar.push(insertler.length + ' INSERT (block reference) skipped - block expansion is off.');
        }
        Object.keys(eksikBlok).forEach(function (ad) {
            uyarilar.push('Block "' + ad + '" is referenced ' + eksikBlok[ad] + ' time(s) but not defined in the file.');
        });
        var izgaraIns = insertler.filter(function (o) { return o.sutun > 1 || o.satirS > 1; }).length;
        if (izgaraIns) uyarilar.push(izgaraIns + ' INSERT uses column/row arrays (codes 70/71); only the first copy is read.');

        // ---- katmanlara dagit ----------------------------------------------
        var katmanlar = {};
        cizim.forEach(function (e) {
            if (!katmanlar[e.layer]) katmanlar[e.layer] = [];
            katmanlar[e.layer].push(e);
        });

        // ---- kopya parallel cizgileri at (istege bagli) ---------------------
        var atilan = 0;
        if (s.dedup) {
            Object.keys(katmanlar).forEach(function (ad) {
                var once = katmanlar[ad].length;
                katmanlar[ad] = kopyaAt(katmanlar[ad], s.dedupTol > 0 ? s.dedupTol : 15);
                atilan += once - katmanlar[ad].length;
            });
        }

        var atlananAd = Object.keys(atlanan);
        if (atlananAd.length) {
            uyarilar.push('Not read: ' + atlananAd.map(function (t) { return t + ' x' + atlanan[t]; }).join(', ') +
                          ' (this tool reads LINE, POLYLINE / LWPOLYLINE, CIRCLE, ARC, POINT and INSERT).');
        }

        return {
            layers: katmanlar, warnings: uyarilar, header: baslik,
            stats: sayim(katmanlar, { bloklar: Object.keys(bloklar).length, insertler: insertler.length, acilan: acilan, atilan: atilan })
        };
    }

    function sayim(katmanlar, ek) {
        var t = { layers: 0, segments: 0, points: 0, circles: 0, arcs: 0, lines: 0, polys: 0 };
        Object.keys(katmanlar).forEach(function (ad) {
            t.layers++;
            katmanlar[ad].forEach(function (e) {
                if (e.type === 'POINT') t.points++;
                else if (e.type === 'CIRCLE') t.circles++;
                else if (e.type === 'ARC') t.arcs++;
                else { t.segments++; if (e.type === 'LINE') t.lines++; else t.polys++; }
            });
        });
        t.entities = t.segments + t.points + t.circles + t.arcs;
        Object.keys(ek || {}).forEach(function (k) { t[k] = ek[k]; });
        return t;
    }

    // ---- tek entity -> oge(ler) ------------------------------------------
    function parcaEkle(liste, katman, tur, x1, y1, z1, x2, y2, z2, kaynak) {
        liste.push({ type: tur, layer: katman, x1: x1, y1: y1, z1: z1, x2: x2, y2: y2, z2: z2, src: kaynak || '' });
    }

    function ogeEkle(liste, tur, katman, alan, x, y, bul, vertexler, yaySegman) {
        var i;
        if (tur === 'LINE') {
            parcaEkle(liste, katman, 'LINE', sayi(alan['10']), sayi(alan['20']), sayi(alan['30']),
                      sayi(alan['11']), sayi(alan['21']), sayi(alan['31']));
            return;
        }
        if (tur === 'POINT') {
            var px = sayi(alan['10']), py = sayi(alan['20']), pz = sayi(alan['30']);
            liste.push({ type: 'POINT', layer: katman, x1: px, y1: py, z1: pz, x2: px, y2: py, z2: pz, src: '' });
            return;
        }
        if (tur === 'CIRCLE') {
            var cx = sayi(alan['10']), cy = sayi(alan['20']), cz = sayi(alan['30']), r = sayi(alan['40']);
            liste.push({ type: 'CIRCLE', layer: katman, x1: cx, y1: cy, z1: cz, x2: cx, y2: cy, z2: cz,
                         cx: cx, cy: cy, r: r, a1: 0, a2: 360, src: '' });
            return;
        }
        if (tur === 'ARC') {
            var ax = sayi(alan['10']), ay = sayi(alan['20']), az = sayi(alan['30']), ar = sayi(alan['40']);
            var a1 = sayi(alan['50']), a2 = alan['51'] !== undefined ? sayi(alan['51']) : 360;
            var d = Math.PI / 180;
            liste.push({
                type: 'ARC', layer: katman,
                x1: ax + ar * Math.cos(a1 * d), y1: ay + ar * Math.sin(a1 * d), z1: az,
                x2: ax + ar * Math.cos(a2 * d), y2: ay + ar * Math.sin(a2 * d), z2: az,
                cx: ax, cy: ay, r: ar, a1: a1, a2: a2, src: ''
            });
            return;
        }
        // POLYLINE / LWPOLYLINE
        var xs, ys, bulge = [], kapali, zSabit = 0;
        if (vertexler) {
            xs = vertexler.x; ys = vertexler.y; bulge = vertexler.bul; kapali = vertexler.kapali;
            zSabit = sayi(alan['30']);
        } else {
            xs = x; ys = y; kapali = bayrak(alan['70'] || '0', 1);
            zSabit = alan['38'] !== undefined ? sayi(alan['38']) : 0;     // yukseklik
            for (i = 0; i < xs.length; i++) bulge[i] = 0;
            (bul || []).forEach(function (b) { bulge[b.i] = b.b; });
        }
        var say = Math.min(xs.length, ys.length);
        if (say < 2) {
            if (say === 1) parcaEkle(liste, katman, 'LWPOLYLINE', xs[0], ys[0], zSabit, xs[0], ys[0], zSabit);
            return;
        }
        var son = kapali ? say : say - 1;
        for (i = 0; i < son; i++) {
            var j = (i + 1) % say;
            var b = bulge[i] || 0;
            if (Math.abs(b) > 1e-9) {
                yayParcala(liste, katman, xs[i], ys[i], xs[j], ys[j], b, zSabit, yaySegman);
            } else {
                parcaEkle(liste, katman, 'LWPOLYLINE', xs[i], ys[i], zSabit, xs[j], ys[j], zSabit);
            }
        }
    }

    // bulge: iki kose arasindaki yayin tan(delta/4) degeri (DXF tanimi).
    // Kirise indirgemek sacma sonuclar veriyordu (yuvarlatilmis kose duz
    // cikiyordu); yay burada kucuk parcalara bolunur.
    function yayParcala(liste, katman, x1, y1, x2, y2, b, z, yaySegman) {
        var delta = 4 * Math.atan(b);                 // isaretli acis acisi
        var kiris = Math.sqrt((x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1));
        if (kiris < 1e-12 || Math.abs(Math.sin(delta / 2)) < 1e-12) {
            parcaEkle(liste, katman, 'LWPOLYLINE', x1, y1, z, x2, y2, z); return;
        }
        // Merkez: kiris orta noktasindan, kirise dik yonde R*cos(delta/2).
        // R = kiris / (2 sin(delta/2)) ISARETLI; bu haliyle kucuk/buyuk yay ve
        // saat yonu/tersi dort halin hepsini tek bagintiyla verir (turetme:
        // p1 (0,0), p2 (1,0), delta = +90 -> merkez (0.5, +0.5); delta = -90 ->
        // (0.5, -0.5); delta = +270 -> (0.5, -0.5)).
        var r = kiris / (2 * Math.sin(delta / 2));      // isaretli yaricap
        var mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
        var ux = (x2 - x1) / kiris, uy = (y2 - y1) / kiris;
        var ofset = r * Math.cos(delta / 2);
        var cx = mx + (-uy) * ofset, cy = my + ux * ofset;
        var t1 = Math.atan2(y1 - cy, x1 - cx);
        var adim = Math.max(2, Math.ceil(Math.abs(delta) / (2 * Math.PI) * yaySegman));
        var px = x1, py = y1, k, t, nx, ny;
        for (k = 1; k <= adim; k++) {
            t = t1 + delta * k / adim;
            nx = cx + Math.abs(r) * Math.cos(t);
            ny = cy + Math.abs(r) * Math.sin(t);
            if (k === adim) { nx = x2; ny = y2; }
            parcaEkle(liste, katman, 'LWPOLYLINE', px, py, z, nx, ny, z, 'bulge');
            px = nx; py = ny;
        }
    }

    // ---- INSERT: blogu cizime ac ----------------------------------------
    // p_dunya = ins + R(rot) * S(sx,sy) * (p_blok - taban)
    function blokAc(ins, bloklar, cizim, derinlik, eksikBlok) {
        if (derinlik > 4) return 0;                    // ic ice blok: makul bir sinir
        var blk = bloklar[ins.blok];
        if (!blk) { eksikBlok[ins.blok] = (eksikBlok[ins.blok] || 0) + 1; return 0; }
        var d = Math.PI / 180, c = Math.cos(ins.rot * d), s = Math.sin(ins.rot * d);
        var sx = ins.sx || 1, sy = ins.sy || 1;
        function don(px, py) {
            var ax = (px - blk.taban.x) * sx, ay = (py - blk.taban.y) * sy;
            return { x: ins.x + ax * c - ay * s, y: ins.y + ax * s + ay * c };
        }
        var say = 0;
        blk.ogeler.forEach(function (e) {
            var p1 = don(e.x1, e.y1), p2 = don(e.x2, e.y2);
            // Katman: DXF'te blok ogesi "0" katmanindaysa INSERT'in katmanini
            // alir; kendi katmani varsa onu korur.
            var katman = (e.layer === '0') ? ins.katman : e.layer;
            var yeni = {
                type: e.type, layer: katman, x1: p1.x, y1: p1.y, z1: e.z1 + ins.z,
                x2: p2.x, y2: p2.y, z2: e.z2 + ins.z, src: 'INSERT:' + ins.blok
            };
            if (e.type === 'CIRCLE' || e.type === 'ARC') {
                var pc = don(e.cx, e.cy);
                yeni.cx = pc.x; yeni.cy = pc.y;
                yeni.r = e.r * Math.abs(sx);
                yeni.a1 = e.a1 + ins.rot; yeni.a2 = e.a2 + ins.rot;
                if (Math.abs(Math.abs(sx) - Math.abs(sy)) > 1e-9) yeni.src += ' (non-uniform scale on a curve)';
            }
            cizim.push(yeni); say++;
        });
        blk.insertler.forEach(function (ic) {
            var p = don(ic.x, ic.y);
            say += blokAc({
                blok: ic.blok, katman: (ic.katman === '0') ? ins.katman : ic.katman,
                x: p.x, y: p.y, z: ic.z + ins.z, sx: ic.sx * sx, sy: ic.sy * sy,
                rot: ic.rot + ins.rot, sutun: 1, satirS: 1, dx: 0, dy: 0
            }, bloklar, cizim, derinlik + 1, eksikBlok);
        });
        return say;
    }

    // ---- kopya paralel cizgiler -----------------------------------------
    // Bir levha cizimde iki cizgiyle gosterilir (kalinlik). Model icin tek
    // orta cizgi gerekir. ESKI SURUM yonu "|dx| < 1 birim" ile belirliyordu;
    // metre olcekli cizimde bu her kisa parcayi dusey sanip komsu cizgiyi
    // siliyordu. Artik: aci ile paralellik (1 derece), dik uzaklik < tol ve
    // izdusum ortusmesi. Tolerans cizim birimindedir (kullanici verir).
    function kopyaAt(ogeler, tol) {
        var cizgiler = [], digerleri = [];
        ogeler.forEach(function (e) {
            if (e.type === 'LINE' || e.type === 'LWPOLYLINE') cizgiler.push(e); else digerleri.push(e);
        });
        var kullanilan = [], out = [], i, j;
        for (i = 0; i < cizgiler.length; i++) {
            if (kullanilan[i]) continue;
            var a = cizgiler[i];
            var adx = a.x2 - a.x1, ady = a.y2 - a.y1, aL = Math.sqrt(adx * adx + ady * ady);
            if (aL < 1e-12) { out.push(a); continue; }
            var ux = adx / aL, uy = ady / aL;
            for (j = i + 1; j < cizgiler.length; j++) {
                if (kullanilan[j]) continue;
                var b = cizgiler[j];
                var bdx = b.x2 - b.x1, bdy = b.y2 - b.y1, bL = Math.sqrt(bdx * bdx + bdy * bdy);
                if (bL < 1e-12) continue;
                // paralellik: yon vektorlerinin capraz carpimi (isaretten bagimsiz)
                var capraz = Math.abs((adx * bdy - ady * bdx) / (aL * bL));
                if (capraz > 0.0175) continue;                       // ~1 derece
                // dik uzaklik: b'nin orta noktasinin a dogrusuna uzakligi
                var mx = (b.x1 + b.x2) / 2 - a.x1, my = (b.y1 + b.y2) / 2 - a.y1;
                var dik = Math.abs(mx * (-uy) + my * ux);
                if (dik > tol) continue;
                // boyca ortusme: izdusumler en az %50 ortusmeli, yoksa bunlar
                // ayni dogrultuda AMA farkli yerlerdeki iki cizgidir
                var t1 = mx * ux + my * uy;
                var pb1 = (b.x1 - a.x1) * ux + (b.y1 - a.y1) * uy, pb2 = (b.x2 - a.x1) * ux + (b.y2 - a.y1) * uy;
                var bMin = Math.min(pb1, pb2), bMax = Math.max(pb1, pb2);
                var ortak = Math.min(aL, bMax) - Math.max(0, bMin);
                if (ortak < 0.5 * Math.min(aL, bL)) continue;
                if (Math.abs(bL - aL) > Math.max(tol, 0.25 * aL)) continue;   // cok farkli boy = ayni sey degil
                kullanilan[j] = true;
            }
            out.push(a);
        }
        return out.concat(digerleri);
    }

    // ---- snap noktalari --------------------------------------------------
    // Uc noktalar, polyline koseleri, daire/yay merkezleri ve GERCEK kesisimler.
    // Kesisim hesabi O(n^2): buyuk cizimde atlanir - ama SESSIZ atlanmaz,
    // donuste bayrak verilir (kullaniciya soylenir).
    function snapNoktalari(katmanlar, gorunur, enFazlaParca) {
        var parcalar = [], noktalar = [], sinir = enFazlaParca > 0 ? enFazlaParca : 3000;
        Object.keys(katmanlar).forEach(function (ad) {
            if (gorunur && gorunur[ad] === false) return;
            katmanlar[ad].forEach(function (e) {
                if (e.type === 'POINT') { noktalar.push({ x: e.x1, y: e.y1, kind: 'node' }); return; }
                if (e.type === 'CIRCLE') {
                    noktalar.push({ x: e.cx, y: e.cy, kind: 'center' });
                    noktalar.push({ x: e.cx + e.r, y: e.cy, kind: 'quad' });
                    noktalar.push({ x: e.cx - e.r, y: e.cy, kind: 'quad' });
                    noktalar.push({ x: e.cx, y: e.cy + e.r, kind: 'quad' });
                    noktalar.push({ x: e.cx, y: e.cy - e.r, kind: 'quad' });
                    return;
                }
                if (e.type === 'ARC') {
                    noktalar.push({ x: e.cx, y: e.cy, kind: 'center' });
                    noktalar.push({ x: e.x1, y: e.y1, kind: 'end' });
                    noktalar.push({ x: e.x2, y: e.y2, kind: 'end' });
                    return;
                }
                noktalar.push({ x: e.x1, y: e.y1, kind: 'end' });
                noktalar.push({ x: e.x2, y: e.y2, kind: 'end' });
                noktalar.push({ x: (e.x1 + e.x2) / 2, y: (e.y1 + e.y2) / 2, kind: 'mid' });
                parcalar.push(e);
            });
        });
        var kesisimAtlandi = parcalar.length > sinir;
        if (!kesisimAtlandi) {
            for (var i = 0; i < parcalar.length; i++) {
                for (var j = i + 1; j < parcalar.length; j++) {
                    var p = parcaKesisimi(parcalar[i], parcalar[j]);
                    if (p) noktalar.push({ x: p.x, y: p.y, kind: 'int' });
                }
            }
        }
        // ayni noktalar birlesir; etiket sirasi: kesisim > uc > dugum > merkez > ceyrek > orta
        var harita = {}, sira = { int: 6, end: 5, node: 4, center: 3, quad: 2, mid: 1 };
        noktalar.forEach(function (p) {
            var k = Math.round(p.x * 1000) / 1000 + '|' + Math.round(p.y * 1000) / 1000;
            var v = harita[k];
            if (!v || sira[p.kind] > sira[v.kind]) harita[k] = p;
        });
        var out = Object.keys(harita).map(function (k) { return harita[k]; });
        return { points: out, intersectionsSkipped: kesisimAtlandi, segments: parcalar.length };
    }

    function parcaKesisimi(a, b) {
        var d = (a.x2 - a.x1) * (b.y2 - b.y1) - (a.y2 - a.y1) * (b.x2 - b.x1);
        if (Math.abs(d) < 1e-12) return null;
        var t = ((b.x1 - a.x1) * (b.y2 - b.y1) - (b.y1 - a.y1) * (b.x2 - b.x1)) / d;
        var u = ((b.x1 - a.x1) * (a.y2 - a.y1) - (b.y1 - a.y1) * (a.x2 - a.x1)) / d;
        var e = 1e-9;
        if (t < -e || t > 1 + e || u < -e || u > 1 + e) return null;
        return { x: a.x1 + t * (a.x2 - a.x1), y: a.y1 + t * (a.y2 - a.y1) };
    }

    // ---- sinirlar (gorunur katmanlar) -----------------------------------
    function sinirKutusu(katmanlar, gorunur) {
        var mnx = Infinity, mxx = -Infinity, mny = Infinity, mxy = -Infinity, var_ = false;
        Object.keys(katmanlar).forEach(function (ad) {
            if (gorunur && gorunur[ad] === false) return;
            katmanlar[ad].forEach(function (e) {
                var xs = [e.x1, e.x2], ys = [e.y1, e.y2];
                if (e.type === 'CIRCLE' || e.type === 'ARC') { xs.push(e.cx - e.r, e.cx + e.r); ys.push(e.cy - e.r, e.cy + e.r); }
                xs.forEach(function (v) { if (isFinite(v)) { mnx = Math.min(mnx, v); mxx = Math.max(mxx, v); var_ = true; } });
                ys.forEach(function (v) { if (isFinite(v)) { mny = Math.min(mny, v); mxy = Math.max(mxy, v); } });
            });
        });
        if (!var_) return { bos: true, minX: 0, maxX: 100, minY: 0, maxY: 100 };
        return { bos: false, minX: mnx, maxX: mxx, minY: mny, maxY: mxy };
    }

    // DXF $INSUNITS kodu -> ad (yalnizca bilgi; olcek kullanicinin)
    var BIRIM_ADI = { 0: 'unitless', 1: 'inch', 2: 'foot', 4: 'mm', 5: 'cm', 6: 'm', 8: 'microinch', 9: 'mil', 10: 'yard' };
    function birimAdi(kod) { return BIRIM_ADI[kod] || null; }

    var API = {
        dxfOku: dxfOku, snapNoktalari: snapNoktalari, sinirKutusu: sinirKutusu,
        parcaKesisimi: parcaKesisimi, kopyaAt: kopyaAt, birimAdi: birimAdi
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = API;
    else Object.keys(API).forEach(function (k) { kok[k] = API[k]; });
}(typeof window !== 'undefined' ? window : this));
