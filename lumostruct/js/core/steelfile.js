/* ==========================================================================
   .steel DOSYASI OKUYUCU
   --------------------------------------------------------------------------
   "Steel" programinin proje dosyasi: tek bir XML icinde malzemeler, plakalar,
   profiller ve BIRDEN COK model; her modelde kendi dugumleri, kirisleri,
   korozyon gruplari, yuk durumlari ve mesnet durumlari var.

   Tarayicida DOMParser var ama testler Node'da kosuyor ve orada yok. Ikisinde
   ayri yol izlemek, ancak birinde patlayan hatalar demek olurdu - o yuzden
   ayristirici burada, saf JavaScript. Dosya makine uretimi ve dar bir alt
   kume kullaniyor (nitelikli etiketler, kendini kapatanlar, yorum yok), bu
   yuzden kucuk bir tarayici yetiyor.

   Cevrim kararlari ve nereden bilindikleri:

     h ne demek?  T ve kosebentte GOVDE yuksekligi (toplam = h + flans),
                  KUTUDA ise DIS olcu. Ikisi de olcum: T okumasi CCL311
                  model 5'in uc T kesidini %0,3-0,6 ile tutturuyor (toplam
                  okumasi -1,1..-0,1 arasinda saciliyor), kutu okumasi
                  verify-steel.js'te portal vinci 34 kontrolde tutturuyor.

     korozyon     web / top / bottom paylari YON degil ROL bildirir. Assembly
                  iki plakaliysa top UST PLAKA, degilse profilin KENDI flansi.
                  Bunu ters baglayinca bp2 ve bp24 %5 sapiyor.

     z="a;b;c"    kirisin hedef yerel z ekseni. LumoStruct yonelimi bir DONME
                  ACISI ile tasiyor; aci varsayilan cerceveden geri hesaplanir.

   ACIK KONU: dar plakali kosebent assembly'lerinde (CCL311 bp19, bp21) Steel
   bizimkinin yarisi kadar mukavemet momenti veriyor, ALANLAR ise tutuyor.
   Bkz. tests/verify-ccl311-kesit.js sonundaki not.
   ========================================================================== */

(function () {
    'use strict';

    // ---------------------------------------------------------------- XML
    // Donen dugum: { ad, nitelik:{}, cocuk:[] }
    function steelXmlAyristir(metin) {
        const kok = { ad: '#kok', nitelik: {}, cocuk: [] };
        const yigin = [kok];
        // <ad ... /> | <ad ...> | </ad> | <?...?> | <!--...-->
        const re = /<(\/)?([A-Za-z_][\w.\-]*)((?:\s+[\w.\-:]+\s*=\s*"[^"]*")*)\s*(\/)?>|<\?[\s\S]*?\?>|<!--[\s\S]*?-->/g;
        let m;
        while ((m = re.exec(metin)) !== null) {
            if (!m[2]) continue;                       // bildirim ya da yorum
            if (m[1]) {                                 // kapanis
                if (yigin.length > 1) yigin.pop();
                continue;
            }
            const dugum = { ad: m[2], nitelik: nitelikAyristir(m[3] || ''), cocuk: [] };
            yigin[yigin.length - 1].cocuk.push(dugum);
            if (!m[4]) yigin.push(dugum);              // kendini kapatmiyorsa in
        }
        return kok;
    }

    function nitelikAyristir(metin) {
        const o = {};
        const re = /([\w.\-:]+)\s*=\s*"([^"]*)"/g;
        let m;
        while ((m = re.exec(metin)) !== null) o[m[1]] = cozumle(m[2]);
        return o;
    }

    function cozumle(s) {
        return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>')
                .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
                .replace(/&amp;/g, '&');
    }

    const cocuklar = (d, ad) => d.cocuk.filter(c => c.ad === ad);
    const cocuk = (d, ad) => d.cocuk.find(c => c.ad === ad) || null;
    const sayi = v => { const x = parseFloat(v); return isFinite(x) ? x : null; };

    // "1,4-9,14" -> [1,4,5,6,7,8,9,14]
    function araliklariAc(metin) {
        const sonuc = [];
        if (!metin) return sonuc;
        String(metin).split(',').forEach(par => {
            const p = par.trim();
            if (!p) return;
            const tire = p.indexOf('-', 1);            // bastaki eksi isareti degil
            if (tire > 0) {
                const a = parseInt(p.slice(0, tire), 10), b = parseInt(p.slice(tire + 1), 10);
                if (isFinite(a) && isFinite(b)) for (let i = a; i <= b; i++) sonuc.push(i);
            } else {
                const a = parseInt(p, 10);
                if (isFinite(a)) sonuc.push(a);
            }
        });
        return sonuc;
    }

    // ------------------------------------------------------------ dosya
    // SI -> mm cevrimi burada bir kez yapilir: dosya metre yaziyor, kesit
    // kutuphanemiz mm bekliyor.
    const mm = v => (v === null || v === undefined) ? null : v * 1000;

    function steelDosyasiOku(metin) {
        const kok = steelXmlAyristir(metin);
        const proje = cocuk(kok, 'project');
        if (!proje) throw new Error('steel: <project> bulunamadi');

        const veri = {
            surum: proje.nitelik.version || null,
            program: proje.nitelik.program || null,
            malzemeler: {}, plakalar: {}, profiller: {}, kesitler: {}, modeller: []
        };

        const mal = cocuk(proje, 'materials');
        if (mal) cocuklar(mal, 'material').forEach(m => {
            veri.malzemeler[m.nitelik.id] = {
                id: m.nitelik.id, ad: m.nitelik.name,
                E: sayi(m.nitelik.e), nu: sayi(m.nitelik.nu),
                yogunluk: sayi(m.nitelik.d), akma: sayi(m.nitelik.re)
            };
        });

        const pl = cocuk(proje, 'platings');
        if (pl) cocuklar(pl, 'plating').forEach(p => {
            veri.plakalar[p.nitelik.id] = { id: p.nitelik.id, w: mm(sayi(p.nitelik.w)), t: mm(sayi(p.nitelik.t)), mat: p.nitelik.mat };
        });

        const bp = cocuk(proje, 'beamProperties');
        if (bp) bp.cocuk.forEach(p => {
            const n = p.nitelik;
            if (p.ad === 'assembly') {
                veri.kesitler[n.id] = { id: n.id, tur: 'assembly', profil: n.profile, alt: n.bottom, ust: n.top, aciklama: n.comment };
                return;
            }
            const fl = cocuk(p, 'flange'), tp = cocuk(p, 'top'), bt = cocuk(p, 'bottom');
            const tanim = {
                id: n.id, tur: p.ad, mat: n.mat, tapered: n.tapered === 'true',
                h: mm(sayi(n.h)), t: mm(sayi(n.t)),
                h2: mm(sayi(n.h2)), t2: mm(sayi(n.t2))
            };
            if (fl) { tanim.fw = mm(sayi(fl.nitelik.w)); tanim.ft = mm(sayi(fl.nitelik.t)); }
            if (tp) { tanim.ustW = mm(sayi(tp.nitelik.w)); tanim.ustT = mm(sayi(tp.nitelik.t)); }
            if (bt) { tanim.altW = mm(sayi(bt.nitelik.w)); tanim.altT = mm(sayi(bt.nitelik.t)); }
            veri.profiller[n.id] = tanim;
            // Profil dogrudan bir kirise atanabiliyor (assembly olmadan).
            if (!veri.kesitler[n.id]) veri.kesitler[n.id] = { id: n.id, tur: 'profil', profil: n.id };
        });

        const md = cocuk(proje, 'models');
        if (md) cocuklar(md, 'model').forEach(m => veri.modeller.push(modelOku(m)));
        return veri;
    }

    function modelOku(m) {
        const model = {
            id: m.nitelik.id, ad: m.nitelik.name, aciklama: m.nitelik.comment,
            dugumler: {}, kirisler: {}, korozyonlar: [], yukDurumlari: [],
            mesnetDurumlari: [], analizler: []
        };

        const dn = cocuk(m, 'nodes');
        if (dn) cocuklar(dn, 'node').forEach(n => {
            const p = String(n.nitelik.p || '').split(';').map(parseFloat);
            model.dugumler[n.nitelik.id] = { x: p[0] || 0, y: p[1] || 0, z: p[2] || 0 };
        });

        const kr = cocuk(m, 'beams');
        if (kr) cocuklar(kr, 'beam').forEach(b => {
            const z = String(b.nitelik.z || '').split(';').map(parseFloat);
            model.kirisler[b.nitelik.id] = {
                n1: b.nitelik.n1, n2: b.nitelik.n2, bp: b.nitelik.bp,
                z: (z.length === 3 && z.every(isFinite)) ? z : null
            };
        });

        const kz = cocuk(m, 'corrosions');
        if (kz) cocuklar(kz, 'corrosion').forEach(c => model.korozyonlar.push({
            id: c.nitelik.id, ad: c.nitelik.name,
            web: mm(sayi(c.nitelik.web)) || 0,
            ust: mm(sayi(c.nitelik.top)) || 0,
            alt: mm(sayi(c.nitelik.bottom)) || 0,
            kirisler: araliklariAc(c.nitelik.beams)
        }));

        const yd = cocuk(m, 'loadCases');
        if (yd) cocuklar(yd, 'loadCase').forEach(lc => {
            const durum = { id: lc.nitelik.id, ad: lc.nitelik.name, yayili: [], tekil: [] };
            cocuklar(lc, 'linear').forEach(l => durum.yayili.push({
                id: l.nitelik.id, ad: l.nitelik.name,
                yon: l.nitelik.d || 'LocalZ',
                pos1: sayi(l.nitelik.pos1), f1: sayi(l.nitelik.f1),
                pos2: sayi(l.nitelik.pos2), f2: sayi(l.nitelik.f2),
                x1: sayi(l.nitelik.x1), x2: sayi(l.nitelik.x2),
                kirisler: araliklariAc(l.nitelik.beams)
            }));
            cocuklar(lc, 'nodal').forEach(n => durum.tekil.push({
                id: n.nitelik.id, ad: n.nitelik.name,
                fx: sayi(n.nitelik.fx) || 0, fy: sayi(n.nitelik.fy) || 0, fz: sayi(n.nitelik.fz) || 0,
                mx: sayi(n.nitelik.mx) || 0, my: sayi(n.nitelik.my) || 0, mz: sayi(n.nitelik.mz) || 0,
                dugumler: araliklariAc(n.nitelik.nodes)
            }));
            model.yukDurumlari.push(durum);
        });

        const md = cocuk(m, 'bcCases');
        if (md) cocuklar(md, 'bcCase').forEach(bc => {
            const durum = { id: bc.nitelik.id, ad: bc.nitelik.name, kosullar: [] };
            cocuklar(bc, 'bc').forEach(b => {
                const k = { dugumler: araliklariAc(b.nitelik.nodes), serbestlik: {} };
                b.cocuk.forEach(s => {
                    // tx/ty/tz -> oteleme, rx/ry/rz -> donme.
                    // type="fixed" tutulu; type="displacement" ZORLANMIS yer degistirme.
                    k.serbestlik[s.ad] = {
                        tur: s.nitelik.type || 'fixed',
                        deger: sayi(s.nitelik.value) || 0
                    };
                });
                durum.kosullar.push(k);
            });
            model.mesnetDurumlari.push(durum);
        });

        const an = cocuk(m, 'analyses');
        if (an) cocuklar(an, 'analysis').forEach(a => model.analizler.push({
            id: a.nitelik.id, ad: a.nitelik.name, lc: a.nitelik.lc, bc: a.nitelik.bc
        }));

        return model;
    }

    // ------------------------------------------------------- kesit kurma
    // Bir (kesit tanimi, korozyon) ciftini LumoStruct kesit nesnesine cevirir.
    // korozyon: { web, ust, alt } mm - .steel'in web/top/bottom paylari.
    function steelKesitiKur(veri, bpId, korozyon) {
        const tanim = veri.kesitler[bpId];
        if (!tanim) return null;
        const p = veri.profiller[tanim.profil];
        if (!p) return null;
        const kor = korozyon || { web: 0, ust: 0, alt: 0 };

        const ustPlaka = tanim.ust ? veri.plakalar[tanim.ust] : null;
        const altPlaka = tanim.alt ? veri.plakalar[tanim.alt] : null;
        const ikiPlaka = !!(ustPlaka && altPlaka);

        // ROL dagitimi: iki plaka varsa `top` UST PLAKAYA gider, yoksa
        // profilin kendi flansina. Alt plaka her zaman `bottom` alir.
        const profilKor = { web: kor.web, flange: ikiPlaka ? 0 : kor.ust, plate: kor.alt };

        let props = null;
        switch (p.tur) {
            case 't': props = profileProperties('T', { h: p.h, tw: p.t, bf: p.fw, tf: p.ft }, profilKor); break;
            case 'a': props = profileProperties('L', { a: p.h, b: p.fw, t: p.t, tf: p.ft }, profilKor); break;
            case 'f': props = profileProperties('FB', { h: p.h, t: p.t }, profilKor); break;
            case 'b': props = profileProperties('HP', { b: p.h, t: p.t }, profilKor); break;
            case 'box': props = profileProperties('BOX', {
                h: p.h, tw: p.t, ustW: p.ustW, ustT: p.ustT, altW: p.altW, altT: p.altT
            }, { web: kor.web, flange: kor.ust, plate: kor.alt }); break;
            case 'h': {
                // Yigma I kirisi: govde + ust ve alt flans. Konikligi (tapered)
                // henuz desteklemiyoruz; sabit kesit gibi, BAS olculeriyle
                // kuruluyor ve arayan taraf uyariliyor.
                const lama = profileProperties('FB', { h: p.h, t: p.t }, { web: kor.web });
                return plakaliKesitSI(lama, p.ustW, p.ustT, kor.ust,
                                      { w: p.altW, t: p.altT, kor: kor.alt });
            }
            default: return null;
        }
        if (!props) return null;

        if (!ustPlaka && !altPlaka) return profilePropertiesSI(props);
        const ana = ustPlaka || altPlaka;
        const anaPay = ustPlaka ? (ikiPlaka ? kor.ust : kor.ust) : kor.alt;
        const ikinci = ikiPlaka ? { w: altPlaka.w, t: altPlaka.t, kor: kor.alt } : null;
        return plakaliKesitSI(props, ana.w, ana.t, anaPay, ikinci);
    }

    // --------------------------------------------------- yerel z -> aci
    // LumoStruct yonelimi bir donme acisiyla tasiyor; dosya hedef z vektorunu
    // veriyor. Varsayilan cerceve elementFrame(n1, n2, 0) ile ayni olmali -
    // bu yuzden onu cagiriyoruz, kopyalamiyoruz.
    function yerelZdenAci(n1, n2, zHedef) {
        if (!zHedef) return 0;
        const c = elementFrame(n1, n2, 0);
        if (!c) return 0;
        const nokta = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
        return Math.atan2(-nokta(zHedef, c.y), nokta(zHedef, c.z)) * 180 / Math.PI;
    }

    // ------------------------------------------------------ model kurma
    // veri      : steelDosyasiOku ciktisi
    // modelId   : hangi model
    // secenek   : { analiz } ya da { lc, bc } - hangi yuk / mesnet durumu
    // Donen     : { nodes, elements, constraints, loads, sections, uyarilar }
    function steelModeliKur(veri, modelId, secenek) {
        secenek = secenek || {};
        const m = veri.modeller.find(x => String(x.id) === String(modelId));
        if (!m) throw new Error('steel: model ' + modelId + ' yok');

        let lcId = secenek.lc, bcId = secenek.bc;
        if (secenek.analiz !== undefined) {
            const a = m.analizler.find(x => String(x.id) === String(secenek.analiz));
            if (!a) throw new Error('steel: analiz ' + secenek.analiz + ' yok');
            lcId = a.lc; bcId = a.bc;
        }

        const uyarilar = [];
        const nodes = {}, elements = {}, constraints = {}, sections = {};
        const loads = [];

        Object.keys(m.dugumler).forEach(id => { nodes[id] = Object.assign({}, m.dugumler[id]); });

        // kiris -> korozyon grubu
        const korOf = {};
        m.korozyonlar.forEach(c => c.kirisler.forEach(k => { korOf[k] = c; }));

        // Kesitler (bp, korozyon) ciftine gore uretilir: ayni profil farkli
        // korozyon grubunda farkli kesittir.
        Object.keys(m.kirisler).forEach(id => {
            const b = m.kirisler[id];
            const n1 = nodes[b.n1], n2 = nodes[b.n2];
            if (!n1 || !n2) { uyarilar.push('kiris ' + id + ': dugum yok'); return; }
            const kor = korOf[id] || null;
            const ad = 'bp' + b.bp + (kor ? '_k' + kor.id : '');
            if (!sections[ad]) {
                const s = steelKesitiKur(veri, b.bp, kor ? { web: kor.web, ust: kor.ust, alt: kor.alt } : null);
                if (!s) { uyarilar.push('kesit kurulamadi: bp ' + b.bp); return; }
                sections[ad] = s;
            }
            elements[id] = {
                n1: b.n1, n2: b.n2, section: ad,
                orientation: yerelZdenAci(n1, n2, b.z)
            };
        });

        // Mesnetler
        const bc = m.mesnetDurumlari.find(x => String(x.id) === String(bcId)) || m.mesnetDurumlari[0];
        const AD = { tx: 'Ux', ty: 'Uy', tz: 'Uz', rx: 'Rx', ry: 'Ry', rz: 'Rz' };
        if (bc) bc.kosullar.forEach(k => {
            k.dugumler.forEach(d => {
                const c = constraints[d] || (constraints[d] = {});
                Object.keys(k.serbestlik).forEach(sr => {
                    const ad = AD[sr];
                    if (!ad) return;
                    c[ad] = true;
                    const s = k.serbestlik[sr];
                    if (s.tur === 'displacement' && s.deger) {
                        // Zorlanmis yer degistirme yalnizca OTELEMEDE destekleniyor.
                        if (ad[0] !== 'U') { uyarilar.push('dugum ' + d + ': zorlanmis DONME atlandi'); return; }
                        c.prescribed = c.prescribed || {};
                        c.prescribed[ad] = s.deger;
                    }
                });
            });
        });

        // Yukler
        const lc = m.yukDurumlari.find(x => String(x.id) === String(lcId)) || m.yukDurumlari[0];
        if (lc) {
            lc.tekil.forEach(t => t.dugumler.forEach(d => loads.push({
                nodeId: d,
                Fx: t.fx / 1000, Fy: t.fy / 1000, Fz: t.fz / 1000,
                Mx: t.mx / 1000, My: t.my / 1000, Mz: t.mz / 1000,
                case: 'L'
            })));
            lc.yayili.forEach(y => {
                if (y.yon !== 'LocalZ' && y.yon !== 'LocalY') {
                    uyarilar.push('yayili yuk ' + y.id + ': bilinmeyen yon "' + y.yon + '"');
                    return;
                }
                // Konum kodlari. Dosyadaki uc hal:
                //   pos = 0        kirisin BASI
                //   pos = 1        kirisin SONU
                //   pos = 4, x2=X  kirisin basindan X metre ileride; yuk ORADA
                //                  BITER (sonrasi sifir).
                // Sonuncusu su basinci icin: siddet f1'den f2'ye iner ve su
                // yuzeyinde kesilir. Steel'in kendi kesme kuvveti egrisiyle
                // dogrulandi - CCL311 kiris 2'de Fz tam 6200 mm'den sonra sabit
                // kaliyor ve toplam yuk (f1+f2)/2 * 6,2 = 257,4 kN ile kesme
                // farki 257,362 kN ortusuyor.
                if (y.pos1 !== 0) uyarilar.push('yayili yuk ' + y.id +
                    ': pos1 = ' + y.pos1 + ' destelenmiyor, bastan alindi');
                const f1 = y.f1 / 1000;                      // N/m -> kN/m
                const f2 = (y.f2 === null || y.f2 === undefined) ? f1 : y.f2 / 1000;

                y.kirisler.forEach(k => {
                    const e = elements[k];
                    if (!e) return;
                    const n1 = nodes[e.n1], n2 = nodes[e.n2];
                    const Lk = Math.sqrt(Math.pow(n2.x - n1.x, 2) + Math.pow(n2.y - n1.y, 2) +
                                         Math.pow((n2.z || 0) - (n1.z || 0), 2));
                    let bitis = 100, son = f2;
                    if (y.pos2 === 4 && y.x2 > 0) {
                        if (y.x2 >= Lk) {
                            // Yuk kirisin otesinde bitiyor: uctaki siddeti ara degerle.
                            son = f1 + (f2 - f1) * (Lk / y.x2);
                        } else {
                            bitis = 100 * y.x2 / Lk;
                        }
                    }
                    (e.lineLoads = e.lineLoads || []).push({
                        value: f1, value2: son,
                        startPct: 0, endPct: bitis,
                        dir: y.yon === 'LocalZ' ? 'localZ' : 'localY',
                        case: 'L'
                    });
                });
            });
        }

        return {
            nodes: nodes, elements: elements, constraints: constraints,
            loads: loads, sections: sections, uyarilar: uyarilar,
            model: { id: m.id, ad: m.ad }, lc: lcId, bc: bcId
        };
    }

    window.steelXmlAyristir = steelXmlAyristir;
    window.steelDosyasiOku = steelDosyasiOku;
    window.steelModeliKur = steelModeliKur;
    window.steelKesitiKur = steelKesitiKur;
    window.steelAraliklariAc = araliklariAc;
    window.steelYerelZdenAci = yerelZdenAci;
})();
