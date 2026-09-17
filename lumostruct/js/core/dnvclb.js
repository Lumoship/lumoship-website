/* ==========================================================================
   DNV 3D BEAM .clb DOSYASI OKUYUCU
   --------------------------------------------------------------------------
   Kullanici (17 Eylul 2026) bir .clb gonderdi: "bizim toolda ayni sonuclari
   hesaplayabiliyor mu bak". Dosya XML degil; iki katman:

   1) OLE2 bilesik kap (Word/Excel'in eski kabi). Akislar: 'AcisData'
      (model), 'ResponseData' (sonuclar, ikili), 'Contents' (surum),
      'RichEditData' (notlar).
   2) 'AcisData': ikili ACIS (SAB). Kayitlar etiketli belirtec dizisi:
        0x04 int32   0x06 double   0x07 kisa dizge (1 bayt boy)
        0x08 uzun dizge (2 bayt boy)   0x0c isaretci (int32, -1 bos)
        0x0d/0x0e tur adi   0x13/0x14 nokta/vektor (3 double)
        0x0a/0x0b true/false   0x15 enum (int32)   0x11 kayit sonu
      DNV'nin kendi turleri: model, beam, tnode, bc, dload, profile,
      material, loadCase; ACIS geometrisi: edge, vertex, point, straight.

   Cikti dnvDosyasiOku ile AYNI sekildedir (veri.kesitler / kirisler /
   mesnetler / yukDurumlari) ve dnvModeliKur o veriyle modeli kurar - XML
   ve .clb ayni yoldan gecer, ikisi icin ayri kurucu yok.

   Birimler: dosyada mm, N/mm (kN/m), MPa. Cikista metre ve N/m (XML
   okuyucunun birimi).

   Dogrulama: tests/verify-dnv-deck.js (54 kirislik guverte, DNV sonuc
   XML'i ile gerilme karsilastirmasi) ve tests/verify-dnv-clb.js.
   ========================================================================== */

(function () {
    'use strict';

    // ---------------------------------------------------------------- OLE2
    // Yalnizca okuma: baslik, FAT, dizin, mini akis. Zincirleri izleyip
    // akisi tek ArrayBuffer olarak dondurur.
    function oleAkislari(buf) {
        const dv = new DataView(buf);
        const u8 = new Uint8Array(buf);
        const imza = [0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1];
        for (let i = 0; i < 8; i++) if (u8[i] !== imza[i]) throw new Error('clb: OLE imzasi yok');
        const sekBoyu = 1 << dv.getUint16(0x1E, true);
        const miniBoyu = 1 << dv.getUint16(0x20, true);
        const fatSayisi = dv.getUint32(0x2C, true);
        const dizinIlk = dv.getUint32(0x30, true);
        const miniEsik = dv.getUint32(0x38, true);
        const miniFatIlk = dv.getUint32(0x3C, true);
        const miniFatSayisi = dv.getUint32(0x40, true);
        const difatIlk = dv.getUint32(0x44, true);
        const difatSayisi = dv.getUint32(0x48, true);
        const SON = 0xFFFFFFFE, BOS = 0xFFFFFFFF;
        const sekAdres = s => 512 + s * sekBoyu;

        // DIFAT: basliktaki 109 + zincirdeki sektorler
        const fatSektorleri = [];
        for (let i = 0; i < 109 && i < fatSayisi; i++) {
            const s = dv.getUint32(0x4C + i * 4, true);
            if (s !== BOS) fatSektorleri.push(s);
        }
        let ds = difatIlk;
        for (let k = 0; k < difatSayisi && ds !== SON && ds !== BOS; k++) {
            const taban = sekAdres(ds);
            const n = sekBoyu / 4 - 1;
            for (let i = 0; i < n; i++) {
                const s = dv.getUint32(taban + i * 4, true);
                if (s !== BOS && fatSektorleri.length < fatSayisi) fatSektorleri.push(s);
            }
            ds = dv.getUint32(taban + n * 4, true);
        }
        const fat = [];
        fatSektorleri.forEach(s => {
            const taban = sekAdres(s);
            for (let i = 0; i < sekBoyu / 4; i++) fat.push(dv.getUint32(taban + i * 4, true));
        });
        function zincir(ilk, tablo) {
            const out = [];
            let s = ilk, guvenlik = 0;
            while (s !== SON && s !== BOS && s < tablo.length && guvenlik++ < 1e6) { out.push(s); s = tablo[s]; }
            return out;
        }
        function akisOku(ilk, boy) {
            const out = new Uint8Array(boy);
            let yaz = 0;
            zincir(ilk, fat).forEach(s => {
                if (yaz >= boy) return;
                const n = Math.min(sekBoyu, boy - yaz);
                out.set(u8.subarray(sekAdres(s), sekAdres(s) + n), yaz);
                yaz += n;
            });
            return out;
        }

        // Dizin
        const dizinHam = akisOku(dizinIlk, zincir(dizinIlk, fat).length * sekBoyu);
        const ddv = new DataView(dizinHam.buffer);
        const girdiler = [];
        for (let i = 0; i + 128 <= dizinHam.length; i += 128) {
            const adBoy = ddv.getUint16(i + 64, true);
            let ad = '';
            for (let k = 0; k + 1 < adBoy - 1; k += 2) ad += String.fromCharCode(ddv.getUint16(i + k, true));
            girdiler.push({
                ad: ad, tur: dizinHam[i + 66],
                ilk: ddv.getUint32(i + 116, true),
                boy: ddv.getUint32(i + 120, true)
            });
        }
        const kok = girdiler.find(g => g.tur === 5);
        // Mini akis: kokun akisi, mini FAT ile bolunmus
        const miniFat = [];
        zincir(miniFatIlk, fat).forEach(s => {
            const taban = sekAdres(s);
            for (let i = 0; i < sekBoyu / 4; i++) miniFat.push(dv.getUint32(taban + i * 4, true));
        });
        const miniAkis = kok ? akisOku(kok.ilk, kok.boy) : new Uint8Array(0);
        function miniOku(ilk, boy) {
            const out = new Uint8Array(boy);
            let yaz = 0;
            zincir(ilk, miniFat).forEach(s => {
                if (yaz >= boy) return;
                const n = Math.min(miniBoyu, boy - yaz);
                out.set(miniAkis.subarray(s * miniBoyu, s * miniBoyu + n), yaz);
                yaz += n;
            });
            return out;
        }
        const akislar = {};
        girdiler.forEach(g => {
            if (g.tur !== 2) return;
            akislar[g.ad] = (g.boy < miniEsik) ? miniOku(g.ilk, g.boy) : akisOku(g.ilk, g.boy);
        });
        return akislar;
    }

    // ---------------------------------------------------------------- SAB
    function sabKayitlari(u8) {
        const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
        const bas = 'ACIS BinaryFile';
        for (let i = 0; i < bas.length; i++) if (u8[i] !== bas.charCodeAt(i)) throw new Error('clb: ACIS ikili basligi yok');
        let i = bas.length + 16;                       // surum, kayit sayisi, ...
        const dizge = (n) => { let s = ''; for (let k = 0; k < n; k++) s += String.fromCharCode(u8[i + k]); i += n; return s; };
        function belirtec() {
            const t = u8[i++];
            switch (t) {
                case 0x07: case 0x0d: case 0x0e: { const n = u8[i++]; return { t: t, v: dizge(n) }; }
                case 0x08: { const n = dv.getUint16(i, true); i += 2; return { t: t, v: dizge(n) }; }
                case 0x04: case 0x0c: case 0x15: { const v = dv.getInt32(i, true); i += 4; return { t: t, v: v }; }
                case 0x06: { const v = dv.getFloat64(i, true); i += 8; return { t: t, v: v }; }
                case 0x13: case 0x14: { const v = [dv.getFloat64(i, true), dv.getFloat64(i + 8, true), dv.getFloat64(i + 16, true)]; i += 24; return { t: t, v: v }; }
                case 0x0a: return { t: t, v: true };
                case 0x0b: return { t: t, v: false };
                case 0x0f: case 0x10: case 0x11: case 0x12: return { t: t, v: null };
                case 0x02: return { t: t, v: u8[i++] };
                case 0x03: { const v = dv.getInt16(i, true); i += 2; return { t: t, v: v }; }
                case 0x05: { const v = dv.getFloat32(i, true); i += 4; return { t: t, v: v }; }
                default: throw new Error('clb: bilinmeyen ACIS belirteci 0x' + t.toString(16) + ' @' + (i - 1));
            }
        }
        // baslik kuyrugu: 3 dizge + 3 double
        for (let k = 0; k < 6; k++) belirtec();
        const kayitlar = [];
        let cur = [];
        while (i < u8.length) {
            const b = belirtec();
            if (b.t === 0x11) { kayitlar.push(cur); cur = []; } else cur.push(b);
        }
        if (cur.length) kayitlar.push(cur);
        return kayitlar;
    }

    const turu = r => r.filter(b => b.t === 0x0d || b.t === 0x0e).map(b => b.v).join('/');
    const isaretciler = r => r.filter(b => b.t === 0x0c).map(b => b.v);
    const sayilar = r => r.filter(b => b.t === 0x06).map(b => b.v);
    const tamsayilar = r => r.filter(b => b.t === 0x04).map(b => b.v);
    const enumlar = r => r.filter(b => b.t === 0x15).map(b => b.v);
    const dizgeler = r => r.filter(b => b.t === 0x07 || b.t === 0x08).map(b => b.v);

    // ---------------------------------------------------------------- model
    function clbDosyasiOku(buf) {
        const akislar = oleAkislari(buf);
        if (!akislar.AcisData) throw new Error('clb: AcisData akisi yok');
        const K = sabKayitlari(akislar.AcisData);
        const tur = k => (k >= 0 && k < K.length) ? turu(K[k]) : '';

        const veri = {
            surum: null, ad: null, birim: { length: 'm', force: 'N' },
            malzemeler: {}, kesitler: {}, kirisler: [], mesnetler: [], eklemler: [],
            yukDurumlari: [], sonucDurumlari: [], kaynak: 'clb'
        };
        const icerik = akislar.Contents;
        if (icerik && icerik.length > 4) { let s = ''; for (let i = 4; i + 1 < icerik.length; i += 2) s += String.fromCharCode(icerik[i] | (icerik[i + 1] << 8)); veri.surum = s; }

        // Isim nitelikleri: string_attrib 'name' -> sahibinin adi
        const adlar = {};
        K.forEach((r, k) => {
            if (tur(k) !== 'string_attrib/name_attrib/gen/attrib') return;
            const d = dizgeler(r); const p = isaretciler(r);
            if (d.length >= 2 && d[0] === 'name') adlar[p[3]] = d[1];
        });
        K.forEach((r, k) => { if (tur(k) === 'model/dnv') veri.ad = adlar[k] || 'NONAME'; });

        // Noktalar: vertex -> point
        const noktaMm = v => { const p = isaretciler(K[v])[2]; const b = K[p].find(x => x.t === 0x13 || x.t === 0x14); return b ? b.v : null; };
        const m = p => p.map(x => x / 1000);

        // Malzemeler
        K.forEach((r, k) => {
            if (tur(k) !== 'material/list/dnv') return;
            const s = sayilar(r);
            veri.malzemeler[k] = { ad: adlar[k] || ('material' + k), E: s[0] * 1e6, nu: s[1], yogunluk: s[3], akma: s[4] * 1e6, cekme: s[5] * 1e6 };
        });

        // Kesitler: aciklama dizgesi XML'dekiyle ayni bicimde ("Web Height, hw=375 [mm], ...")
        K.forEach((r, k) => {
            if (tur(k) !== 'profile/list/dnv') return;
            const d = dizgeler(r), s = sayilar(r), e = enumlar(r);
            const aciklama = d[0] || '', tipAd = d[1] || '';
            const par = window.dnvParametreleriAyristir(aciklama);
            const olcu = window.dnvKesitOlculeri(par, aciklama + ' ' + tipAd);
            const ad = adlar[k] || (tipAd + ' ' + (d[2] || '')).trim() || ('profile' + k);
            veri.kesitler[k] = {
                ad: ad, tip: e[0], aciklama: aciklama + (tipAd ? ' (' + tipAd + ')' : ''), olcu: olcu,
                dnv: { A: s[0], Ay: s[1], Az: s[2], J: s[3], Iy: s[4], Iz: s[5] },
                kayma: (s[0] > 0) ? { fy: s[1] / s[0], fz: s[2] / s[0] } : null
            };
        });

        // Kirisler: beam -> edge -> vertex/vertex; profil isaretcisi
        const kirisKayit = {};
        K.forEach((r, k) => {
            if (tur(k) !== 'beam/dnv') return;
            const p = isaretciler(r);
            const edge = K[p[1]]; if (!edge || tur(p[1]) !== 'edge') return;
            const ep = isaretciler(edge);
            const p1 = noktaMm(ep[1]), p2 = noktaMm(ep[2]);
            if (!p1 || !p2) return;
            const id = tamsayilar(r)[0];
            const kesit = veri.kesitler[p[4]];
            kirisKayit[k] = veri.kirisler.length;
            veri.kirisler.push({ ad: 'Beam' + id, dnvId: id, p1: m(p1), p2: m(p2), kesit: kesit ? kesit.ad : null, yerel: null });
        });

        // Mesnetler: tnode -> nitelik zinciri 'vertex' -> vertex -> point; bc
        K.forEach((r, k) => {
            if (tur(k) !== 'tnode/dnv') return;
            const p = isaretciler(r);
            let a = p[0], vtx = null;
            while (a >= 0 && a < K.length) {
                const ra = K[a]; const d = dizgeler(ra);
                if (d.indexOf('vertex') >= 0) { vtx = isaretciler(ra).slice(-1)[0]; break; }
                a = isaretciler(ra)[1];
            }
            if (vtx === null || vtx < 0) return;
            const pt = noktaMm(vtx); if (!pt) return;
            const bcK = p[1];
            const id = tamsayilar(r)[0];
            if (bcK < 0 || tur(bcK) !== 'bc/dnv') { veri.eklemler.push({ ad: 'Node' + id, p: m(pt) }); return; }
            const e = enumlar(K[bcK]);
            const dof = ['dx', 'dy', 'dz', 'rx', 'ry', 'rz'];
            const bc = {};
            dof.forEach((d, i) => { bc[d] = { tur: e[i] === 1 ? 'fixed' : 'free' }; });
            veri.mesnetler.push({ ad: 'Node' + id, p: m(pt), bc: bc });
        });

        // Yuk durumlari ve yayili yukler (dload: [.., .., .., .., q1, q2] N/mm)
        K.forEach((r, k) => {
            if (tur(k) !== 'loadCase/list/dnv') return;
            veri.yukDurumlari.push({ kayit: k, ad: adlar[k] || ('LoadCase' + veri.yukDurumlari.length), aciklama: adlar[k] || null, dugumYukleri: [], hatYukleri: [] });
        });
        K.forEach((r, k) => {
            if (tur(k) !== 'dload/list/dnv') return;
            const p = isaretciler(r), s = sayilar(r);
            const lc = veri.yukDurumlari.find(d => d.kayit === p[1]) || veri.yukDurumlari[0];
            const kiris = kirisKayit[p[4]];
            if (!lc || kiris === undefined) return;
            // N/mm -> N/m; eksi = asagi (global -Z)
            lc.hatYukleri.push({ kiris: kiris, q1: s[4] * 1000, q2: s[5] * 1000 });
        });
        veri.yukDurumlari.forEach(d => delete d.kayit);
        return veri;
    }

    window.oleAkislari = oleAkislari;
    window.sabKayitlari = sabKayitlari;
    window.clbDosyasiOku = clbDosyasiOku;
})();
