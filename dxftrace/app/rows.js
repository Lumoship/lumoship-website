// ============================================================================
// DXFTrace - tablo uretimi ve dosya yazimi (saf; node testleri ayni kodu kosar)
//
// Ilk surumde olculen hatalar:
//  1) CSV KACISI YOKTU. Katman adi "DECK, MAIN" olan bir cizimde satir 9 alana
//     bolunuyor, basliksa 8 - dosya Excel'de kayiyordu. Artik RFC 4180:
//     ayirici, cift tirnak ya da satir sonu iceren alan tirnaklanir.
//  2) DAIRE/YAY YARICAPI YOKTU: x2,y2 merkezin tekrariydi, r hic yazilmiyordu.
//     Artik merkez (cx, cy), yaricap ve acilar ayri kolonlar; yayda x1,y1 /
//     x2,y2 gercek baslangic/bitis noktasi.
//  3) Z USTUNE YAZMA "0 disi ise" kuraliyla calisiyordu: 0 yazmak mumkun
//     degildi ve iki uca da ayni deger giriyordu. Artik acik bir onay kutusu.
//  4) ZIP adlarinda UTF-8 bayragi (genel amac biti 11) yoktu: Turkce katman
//     adlari arsivde bozuluyordu.
//
// Olcek: kullanicinin verdigi carpan (mm -> m icin 0.001). Once kaynak
// noktasi cikarilir, sonra carpilir - ters sira farkli sayi verir.
// ============================================================================

(function (kok) {
    'use strict';
    var NL = String.fromCharCode(10), TAB = String.fromCharCode(9), TIRNAK = String.fromCharCode(34);

    var KOLONLAR = [
        { ad: 'layer', etiket: 'layer' }, { ad: 'type', etiket: 'type' },
        { ad: 'x1', etiket: 'x1' }, { ad: 'y1', etiket: 'y1' }, { ad: 'z1', etiket: 'z1' },
        { ad: 'x2', etiket: 'x2' }, { ad: 'y2', etiket: 'y2' }, { ad: 'z2', etiket: 'z2' },
        { ad: 'len', etiket: 'length' },
        { ad: 'cx', etiket: 'cx' }, { ad: 'cy', etiket: 'cy' }, { ad: 'r', etiket: 'r' },
        { ad: 'a1', etiket: 'a1' }, { ad: 'a2', etiket: 'a2' },
        { ad: 'src', etiket: 'source' }
    ];

    function yuvarla(v, basamak) {
        if (typeof v !== 'number' || !isFinite(v)) return '';
        var f = +v.toFixed(basamak);
        return f === 0 ? 0 : f;                       // -0 yazmasin
    }

    // ogeler -> satir nesneleri. cfg: { ox, oy, olcek, zUstuneYaz, z, basamak, kolonlar }
    function satirlar(ogeler, cfg) {
        var c = cfg || {}, ox = c.ox || 0, oy = c.oy || 0, olcek = (typeof c.olcek === 'number' && c.olcek) ? c.olcek : 1;
        var bas = (typeof c.basamak === 'number') ? c.basamak : 2;
        var kol = c.kolonlar || {};
        var d = function (v) { return yuvarla(v, bas); };
        return (ogeler || []).map(function (e) {
            var x1 = (e.x1 - ox) * olcek, y1 = (e.y1 - oy) * olcek;
            var x2 = (e.x2 - ox) * olcek, y2 = (e.y2 - oy) * olcek;
            var z1 = c.zUstuneYaz ? (c.z || 0) : e.z1 * olcek;
            var z2 = c.zUstuneYaz ? (c.z || 0) : e.z2 * olcek;
            var r = {};
            if (kol.layer !== false) r.layer = e.layer;
            if (kol.type !== false) r.type = e.type;
            if (kol.x1 !== false) r.x1 = d(x1);
            if (kol.y1 !== false) r.y1 = d(y1);
            if (kol.z1 !== false) r.z1 = d(z1);
            if (kol.x2 !== false) r.x2 = d(x2);
            if (kol.y2 !== false) r.y2 = d(y2);
            if (kol.z2 !== false) r.z2 = d(z2);
            if (kol.len) {
                var dx = x2 - x1, dy = y2 - y1, dz = z2 - z1;
                r.len = (e.type === 'POINT' || e.type === 'CIRCLE') ? '' : d(Math.sqrt(dx * dx + dy * dy + dz * dz));
            }
            if (kol.arc) {
                var yay = (e.type === 'CIRCLE' || e.type === 'ARC');
                r.cx = yay ? d((e.cx - ox) * olcek) : '';
                r.cy = yay ? d((e.cy - oy) * olcek) : '';
                r.r = yay ? d(e.r * olcek) : '';
                r.a1 = yay ? d(e.a1) : '';
                r.a2 = yay ? d(e.a2) : '';
            }
            if (kol.src) r.src = e.src || '';
            return r;
        });
    }

    function basliklar(satir) {
        if (!satir) return [];
        return Object.keys(satir).map(function (k) {
            var t = KOLONLAR.filter(function (o) { return o.ad === k; })[0];
            return t ? t.etiket : k;
        });
    }

    // RFC 4180: ayirici, tirnak ya da satir sonu varsa tirnakla; ic tirnak iki kez.
    function alanYaz(v, ayirici) {
        var s = (v === null || v === undefined) ? '' : String(v);
        var kacisGerek = s.indexOf(ayirici) >= 0 || s.indexOf(TIRNAK) >= 0 ||
                         s.indexOf(NL) >= 0 || s.indexOf(String.fromCharCode(13)) >= 0;
        if (!kacisGerek) return s;
        return TIRNAK + s.split(TIRNAK).join(TIRNAK + TIRNAK) + TIRNAK;
    }

    function yaz(satirlarDizi, bicim) {
        var rows = satirlarDizi || [];
        if (!rows.length) return '';
        if (bicim === 'json') return JSON.stringify(rows, null, 2);
        var ayirici = (bicim === 'tsv' || bicim === 'excel') ? TAB : ',';
        var anahtar = Object.keys(rows[0]);
        var metin = basliklar(rows[0]).map(function (h) { return alanYaz(h, ayirici); }).join(ayirici) + NL;
        rows.forEach(function (r) {
            metin += anahtar.map(function (k) { return alanYaz(r[k], ayirici); }).join(ayirici) + NL;
        });
        return metin;
    }

    function uzanti(bicim) { return bicim === 'json' ? 'json' : (bicim === 'excel' ? 'txt' : (bicim === 'tsv' ? 'tsv' : 'csv')); }
    function mime(bicim) {
        return bicim === 'json' ? 'application/json' : (bicim === 'csv' ? 'text/csv' : 'text/tab-separated-values');
    }
    // Dosya adinda yasak karakterler (Windows) ve bosluklar
    function guvenliAd(s) {
        var out = '', i, ch, yasak = '/' + String.fromCharCode(92) + ':*?' + TIRNAK + '<>|';
        for (i = 0; i < String(s).length; i++) {
            ch = String(s).charAt(i);
            out += (yasak.indexOf(ch) >= 0) ? '_' : (ch === ' ' ? '_' : ch);
        }
        return out;
    }

    // ---- ZIP (sikistirmasiz STORE; harici kitaplik yok) -----------------
    var crcTablo = (function () {
        var t = new Array(256), n, c, k;
        for (n = 0; n < 256; n++) { c = n; for (k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); t[n] = c >>> 0; }
        return t;
    }());
    function crc32(bytes) {
        var c = 0xFFFFFFFF, i;
        for (i = 0; i < bytes.length; i++) c = crcTablo[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
        return (c ^ 0xFFFFFFFF) >>> 0;
    }
    // dosyalar: [{name, data}] -> Uint8Array
    function zipBaytlari(dosyalar) {
        var enc = (typeof TextEncoder !== 'undefined') ? new TextEncoder() : null;
        function kodla(s) {
            if (enc) return enc.encode(s);
            var b = Buffer.from(s, 'utf8'), u = new Uint8Array(b.length), i;
            for (i = 0; i < b.length; i++) u[i] = b[i];
            return u;
        }
        var u16 = function (v) { return [v & 0xFF, (v >>> 8) & 0xFF]; };
        var u32 = function (v) { return [v & 0xFF, (v >>> 8) & 0xFF, (v >>> 16) & 0xFF, (v >>> 24) & 0xFF]; };
        var UTF8 = 0x0800;                 // genel amac biti 11: adlar UTF-8
        var parcalar = [], merkez = [], ofset = 0;
        dosyalar.forEach(function (f) {
            var adB = kodla(f.name), veriB = kodla(f.data), crc = crc32(veriB);
            var yerel = [].concat(u32(0x04034b50), u16(20), u16(UTF8), u16(0), u16(0), u16(0),
                                  u32(crc), u32(veriB.length), u32(veriB.length), u16(adB.length), u16(0));
            parcalar.push(new Uint8Array(yerel), adB, veriB);
            merkez.push({ adB: adB, crc: crc, boy: veriB.length, ofset: ofset });
            ofset += yerel.length + adB.length + veriB.length;
        });
        var merkezBas = ofset, mParcalar = [];
        merkez.forEach(function (c) {
            var kayit = [].concat(u32(0x02014b50), u16(20), u16(20), u16(UTF8), u16(0), u16(0), u16(0),
                                  u32(c.crc), u32(c.boy), u32(c.boy), u16(c.adB.length), u16(0), u16(0), u16(0), u16(0),
                                  u32(0), u32(c.ofset));
            mParcalar.push(new Uint8Array(kayit), c.adB);
            ofset += kayit.length + c.adB.length;
        });
        var son = [].concat(u32(0x06054b50), u16(0), u16(0), u16(merkez.length), u16(merkez.length),
                            u32(ofset - merkezBas), u32(merkezBas), u16(0));
        var hepsi = parcalar.concat(mParcalar, [new Uint8Array(son)]);
        var toplam = hepsi.reduce(function (s, a) { return s + a.length; }, 0);
        var out = new Uint8Array(toplam), p = 0;
        hepsi.forEach(function (a) { out.set(a, p); p += a.length; });
        return out;
    }

    // Genel ad alanina konan adlar (tarayicida window): baska bir dosyadaki
    // yardimciyla cakismasin diye "tablo" onekli. Ad cakismasi sessiz hatadir.
    var API = {
        KOLONLAR: KOLONLAR, tabloSatirlari: satirlar, tabloBasliklari: basliklar, tabloYaz: yaz,
        alanYaz: alanYaz, uzanti: uzanti, mime: mime, guvenliAd: guvenliAd,
        zipBaytlari: zipBaytlari, crc32: crc32
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = API;
    else Object.keys(API).forEach(function (k) { kok[k] = API[k]; });
}(typeof window !== 'undefined' ? window : this));
