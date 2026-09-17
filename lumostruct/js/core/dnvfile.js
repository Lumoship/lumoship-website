/* ==========================================================================
   DNV 3D Beam DOSYASI OKUYUCU  (DNV_structure_concept_protocol)
   --------------------------------------------------------------------------
   .steel dosyasindan iki onemli farki var:

   1) DUGUM LISTESI YOK. Her kiris kendi uc koordinatlarini yaziyor; mesnetler
      ve serbest birlesimler de ayri ayri konum veriyor. Dugumler bu
      noktalarin CAKISANLARI birlestirilerek cikariliyor.

   2) KESITLER PARAMETRIK ve parametreler ADLARIYLA yaziliyor:
        "Web Height, hw=300  [mm], Flange width (incl. web), bf=150  [mm], ..."
      Tip numarasina (type="40") guvenmek yerine ADLARI okuyoruz - tip
      numaralari surumden surume degisebilir, adlar kendini anlatiyor.
      Taniyamadigimiz bir kesit SESSIZCE gecmiyor, uyari olarak donuyor.

   Dosya iki cesit: model dosyasi (structure_domain + loadcases) ve sonuc
   dosyasi (responsecases). Ikincisi karsilastirma icin okunabiliyor.
   ========================================================================== */

(function () {
    'use strict';

    const cocuklar = (d, ad) => d.cocuk.filter(c => c.ad === ad);
    const cocuk = (d, ad) => d.cocuk.find(c => c.ad === ad) || null;
    const sayi = v => { const x = parseFloat(v); return isFinite(x) ? x : null; };
    // Derinlemesine ilk eslesme - DNV agaci cok katmanli ve ara katmanlarin
    // adi surumle degisebiliyor.
    function derinBul(d, ad) {
        if (!d) return null;
        for (const c of d.cocuk) {
            if (c.ad === ad) return c;
            const alt = derinBul(c, ad);
            if (alt) return alt;
        }
        return null;
    }
    function derinHepsi(d, ad, topla) {
        topla = topla || [];
        if (!d) return topla;
        d.cocuk.forEach(c => { if (c.ad === ad) topla.push(c); derinHepsi(c, ad, topla); });
        return topla;
    }

    // "Web Height, hw=300  [mm], Flange width (incl. web), bf=150  [mm]"
    //   -> { 'web height': 300, 'hw': 300, 'flange width (incl. web)': 150, 'bf': 150 }
    // Hem uzun ad hem kisa simge anahtar olarak konuyor: dosyadan dosyaya
    // hangisinin yazildigi degisiyor.
    function parametreleriAyristir(metin) {
        const p = {};
        if (!metin) return p;
        // Virgul hem parametreleri hem "Flange width, bf" gibi ad-simge
        // ciftlerini ayirdigi icin once '=' etrafindan bolmek gerekiyor.
        const parcalar = String(metin).split(/,(?=[^=]*=)/);
        parcalar.forEach(par => {
            const m = /^(.*?)=\s*([-\d.eE+]+)\s*(?:\[([^\]]*)\])?/.exec(par.trim());
            if (!m) return;
            const deger = sayi(m[2]);
            if (deger === null) return;
            const birim = (m[3] || 'mm').trim().toLowerCase();
            const olcek = birim === 'm' ? 1000 : (birim === 'cm' ? 10 : 1);   // mm'ye cevir
            // "Web Height, hw" -> uzun ad ve simge
            m[1].split(',').forEach(ad => {
                const a = ad.trim().toLowerCase();
                if (a) p[a] = (birim === 'degrees' || birim === 'deg') ? deger : deger * olcek;
            });
        });
        return p;
    }

    // Parametre adlarindan LumoStruct kesitine. Taniyamazsa null doner.
    function dnvKesitOlculeri(par, aciklama) {
        const al = (...adlar) => { for (const a of adlar) if (par[a] !== undefined) return par[a]; return undefined; };
        const capD = al('outer diameter', 'od', 'diameter');
        const kalinlik = al('thickness', 't');
        const hw = al('web height', 'hw');
        const tw = al('web thickness', 't', 'tw');
        const bf = al('flange width (incl. web)', 'flange width', 'bf');
        const tf = al('flange thickness', 'tf');
        const pW = al('effective plate width', 'plate width', 'pw');
        const pT = al('plate thickness', 'pt');
        const yuk = al('height', 'h');

        if (capD !== undefined && kalinlik !== undefined && hw === undefined) {
            return { tur: 'PIPE', dims: { d: capD, t: kalinlik } };
        }
        if (hw !== undefined && bf !== undefined) {
            return {
                tur: 'T', dims: { h: hw, tw: tw !== undefined ? tw : kalinlik, bf: bf, tf: tf },
                plaka: (pW && pT) ? { w: pW, t: pT } : null
            };
        }
        if (hw !== undefined && bf === undefined) {
            return { tur: 'FB', dims: { h: hw, t: tw !== undefined ? tw : kalinlik },
                     plaka: (pW && pT) ? { w: pW, t: pT } : null };
        }
        if (yuk !== undefined && kalinlik !== undefined) {
            // Bulb profilleri genelde aciklamada "HP" ile geciyor.
            if (/\bHP\b|bulb/i.test(aciklama || '')) return { tur: 'HP', dims: { b: yuk, t: kalinlik } };
            return { tur: 'FB', dims: { h: yuk, t: kalinlik } };
        }
        return null;
    }

    function dnvDosyasiOku(metin) {
        const kok = basitXmlAyristir(metin);
        const proto = cocuk(kok, 'DNV_structure_concept_protocol');
        if (!proto) throw new Error('dnv: DNV_structure_concept_protocol bulunamadi');
        const model = cocuk(proto, 'model');
        if (!model) throw new Error('dnv: <model> bulunamadi');

        const veri = {
            surum: proto.nitelik.version || null,
            ad: model.nitelik.name || null,
            birim: {}, malzemeler: {}, kesitler: {},
            kirisler: [], mesnetler: [], eklemler: [],
            yukDurumlari: [], sonucDurumlari: []
        };

        const bir = derinBul(model, 'model_units');
        if (bir) veri.birim = Object.assign({}, bir.nitelik);

        derinHepsi(model, 'material').forEach(m => {
            const iz = cocuk(m, 'isotropic_linear_material');
            const ac = cocuk(m, 'description');
            if (!iz) return;
            veri.malzemeler[m.nitelik.name] = {
                ad: m.nitelik.name, aciklama: ac ? ac.nitelik.text : null,
                E: sayi(iz.nitelik.youngs_modulus), nu: sayi(iz.nitelik.poissons_ratio),
                yogunluk: sayi(iz.nitelik.density), akma: sayi(iz.nitelik.yield_stress)
            };
        });

        derinHepsi(model, 'section').forEach(sc => {
            const ps = cocuk(sc, 'p3db_section');
            const ac = cocuk(sc, 'description');
            const kf = derinBul(sc, 'shear_factors');
            const aciklama = ac ? ac.nitelik.text : null;
            const par = ps ? parametreleriAyristir(ps.nitelik.parameter_list) : {};
            veri.kesitler[sc.nitelik.name] = {
                ad: sc.nitelik.name, aciklama: aciklama,
                tip: ps ? ps.nitelik.type : null,
                parametre: par,
                olcu: dnvKesitOlculeri(par, aciklama),
                // DNV kayma carpanlarini kendisi veriyor; bizim kappa'miz bu.
                kayma: kf ? { fy: sayi(kf.nitelik.fy), fz: sayi(kf.nitelik.fz) } : null,
                korozyon: ps ? ps.nitelik.corrosions : null
            };
        });

        derinHepsi(model, 'straight_beam').forEach(b => {
            const yer = cocuk(b, 'local_system');
            const eksen = {};
            if (yer) cocuklar(yer, 'vector').forEach(v => {
                eksen[v.nitelik.dir] = [sayi(v.nitelik.x) || 0, sayi(v.nitelik.y) || 0, sayi(v.nitelik.z) || 0];
            });
            // Her segment ayri bir eleman: DNV bir kirisi parcalara bolebiliyor.
            derinHepsi(b, 'straight_segment').forEach(sg => {
                const hat = derinBul(sg, 'line');
                if (!hat) return;
                const uc = cocuklar(hat, 'position');
                const p1 = uc.find(p => p.nitelik.end === '1') || uc[0];
                const p2 = uc.find(p => p.nitelik.end === '2') || uc[1];
                if (!p1 || !p2) return;
                const nok = p => [sayi(p.nitelik.x) || 0, sayi(p.nitelik.y) || 0, sayi(p.nitelik.z) || 0];
                veri.kirisler.push({
                    ad: b.nitelik.name, dizin: sg.nitelik.index,
                    p1: nok(p1), p2: nok(p2), yerel: eksen,
                    malzeme: sg.nitelik.material_ref, kesit: sg.nitelik.section_ref
                });
            });
        });

        derinHepsi(model, 'support_point').forEach(sp => {
            const g = derinBul(sp, 'position');
            if (!g) return;
            const bc = {};
            derinHepsi(sp, 'boundary_condition').forEach(b => {
                bc[b.nitelik.dof] = { tur: b.nitelik.constraint, deger: sayi(b.nitelik.value) || 0 };
            });
            veri.mesnetler.push({
                ad: sp.nitelik.name,
                p: [sayi(g.nitelik.x) || 0, sayi(g.nitelik.y) || 0, sayi(g.nitelik.z) || 0],
                bc: bc
            });
        });

        derinHepsi(model, 'frame_joint').forEach(j => {
            const g = derinBul(j, 'position');
            if (!g) return;
            veri.eklemler.push({
                ad: j.nitelik.name,
                p: [sayi(g.nitelik.x) || 0, sayi(g.nitelik.y) || 0, sayi(g.nitelik.z) || 0]
            });
        });

        derinHepsi(model, 'loadcase').forEach(lc => {
            const ac = cocuk(lc, 'description');
            const durum = { ad: lc.nitelik.name, aciklama: ac ? ac.nitelik.text : null, dugumYukleri: [] };
            cocuklar(lc, 'joint_load').forEach(jl => {
                const kuv = derinBul(jl, 'force'), mom = derinBul(jl, 'moment');
                const vek = d => {
                    const v = d ? cocuk(d, 'vector') : null;
                    return v ? [sayi(v.nitelik.x) || 0, sayi(v.nitelik.y) || 0, sayi(v.nitelik.z) || 0] : [0, 0, 0];
                };
                durum.dugumYukleri.push({ eklem: jl.nitelik.joint_ref, F: vek(kuv), M: vek(mom) });
            });
            veri.yukDurumlari.push(durum);
        });

        // Sonuc dosyasi (ayri export): karsilastirma icin.
        derinHepsi(proto, 'responsecase').forEach(rc => {
            const d = { lc: rc.nitelik.loadcase_ref, aciklama: rc.nitelik.loadcase_description_ref, kiris: {} };
            derinHepsi(rc, 'beam_response').forEach(br => {
                d.kiris[br.nitelik.beam_ref] = derinHepsi(br, 'response').map(r => ({
                    par: sayi(r.nitelik.par),
                    tau_Qz: sayi(r.nitelik.tau_Qz), sig_Nx: sayi(r.nitelik.sig_Nx),
                    sig_My_top: sayi(r.nitelik.sig_My_top), sig_My_bot: sayi(r.nitelik.sig_My_bot)
                }));
            });
            veri.sonucDurumlari.push(d);
        });

        return veri;
    }

    // --------------------------------------------------------- model kurma
    // DNV'de dugum yok; noktalar birlestirilerek cikariliyor. Tolerans 1 mikron:
    // ayni dugumu tarif eden koordinatlar dosyada bire bir ayni yaziliyor, bu
    // yuzden gevsek bir tolerans FARKLI dugumleri birlestirme riski demek olurdu.
    function dnvModeliKur(veri, secenek) {
        secenek = secenek || {};
        const TOL = 1e-6;
        const uyarilar = [];
        const nodes = {}, elements = {}, constraints = {}, sections = {};
        const loads = [];
        const harita = new Map();
        let sayac = 0;

        const anahtar = p => p.map(v => Math.round(v / TOL)).join('|');
        function dugum(p) {
            const a = anahtar(p);
            if (harita.has(a)) return harita.get(a);
            const id = ++sayac;
            nodes[id] = { x: p[0], y: p[1], z: p[2] };
            harita.set(a, id);
            return id;
        }

        // Kesitler
        Object.values(veri.kesitler).forEach(k => {
            if (!k.olcu) {
                uyarilar.push('kesit "' + k.ad + '" (' + (k.aciklama || 'tip ' + k.tip) +
                              '): parametreleri taninmadi');
                return;
            }
            let props = null;
            const o = k.olcu;
            if (o.tur === 'PIPE') props = profileProperties('PIPE', o.dims);
            else props = profileProperties(o.tur, o.dims);
            if (!props) { uyarilar.push('kesit "' + k.ad + '": ' + o.tur + ' kurulamadi'); return; }
            sections[k.ad] = o.plaka
                ? plakaliKesitSI(props, o.plaka.w, o.plaka.t, 0)
                : profilePropertiesSI(props);
            // DNV 3D Beam'in kayma alani (Az = I*t/S, tarafsiz eksendeki TEPE
            // gerilme) KULLANILMAZ: kural kontrolu (RU-SHIP Pt.3 Ch.3 Sec.7)
            // ortalama gerilmeyi (h_stf + t_p) * t_w uzerinden ister; tepe
            // degerle kural sinirini kiyaslamak %10-20 gereksiz ceza olur.
            // Kesit kendi kural alanini profiles.js'te kurar. (k.kayma yalnizca
            // bilgi olarak dosyada kalir.)
        });

        // Kirisler
        veri.kirisler.forEach((b, i) => {
            const n1 = dugum(b.p1), n2 = dugum(b.p2);
            if (n1 === n2) { uyarilar.push('kiris "' + b.ad + '": sifir boy'); return; }
            const id = i + 1;
            let aci = 0;
            if (b.yerel && b.yerel.z) aci = steelYerelZdenAci(nodes[n1], nodes[n2], b.yerel.z);
            elements[id] = { n1: n1, n2: n2, section: b.kesit, orientation: aci, dnvAd: b.ad };
            if (!sections[b.kesit]) uyarilar.push('kiris "' + b.ad + '": kesit "' + b.kesit + '" yok');
        });

        // Mesnetler - konumu bir kirise denk gelmiyorsa yok sayilmaz, uyarilir.
        const AD = { dx: 'Ux', dy: 'Uy', dz: 'Uz', rx: 'Rx', ry: 'Ry', rz: 'Rz' };
        veri.mesnetler.forEach(m => {
            const a = anahtar(m.p);
            if (!harita.has(a)) { uyarilar.push('mesnet "' + m.ad + '": hicbir kirise denk gelmiyor'); return; }
            const d = harita.get(a);
            const c = constraints[d] || (constraints[d] = {});
            Object.keys(m.bc).forEach(dof => {
                const ad = AD[dof];
                if (!ad) return;
                const s = m.bc[dof];
                if (s.tur === 'free') return;
                c[ad] = true;
                if (s.tur === 'prescribed' && s.deger) {
                    if (ad[0] !== 'U') { uyarilar.push('mesnet "' + m.ad + '": zorlanmis DONME atlandi'); return; }
                    c.prescribed = c.prescribed || {};
                    c.prescribed[ad] = s.deger;
                }
            });
        });

        // Yukler
        const eklemDugum = {};
        veri.eklemler.forEach(j => { const a = anahtar(j.p); if (harita.has(a)) eklemDugum[j.ad] = harita.get(a); });
        veri.mesnetler.forEach(m => { const a = anahtar(m.p); if (harita.has(a)) eklemDugum[m.ad] = harita.get(a); });

        const lc = secenek.lc
            ? veri.yukDurumlari.find(x => x.ad === secenek.lc || x.aciklama === secenek.lc)
            : veri.yukDurumlari[0];
        if (lc) lc.dugumYukleri.forEach(y => {
            const d = eklemDugum[y.eklem];
            if (!d) { uyarilar.push('yuk: birlesim "' + y.eklem + '" bulunamadi'); return; }
            loads.push({
                nodeId: d,
                Fx: y.F[0] / 1000, Fy: y.F[1] / 1000, Fz: y.F[2] / 1000,   // N -> kN
                Mx: y.M[0] / 1000, My: y.M[1] / 1000, Mz: y.M[2] / 1000,
                case: 'L'
            });
        });

        // Yayili yukler (.clb dosyasindan; XML modelde yok). q N/m, DNV'de
        // eksi = asagi; LumoStruct'ta + = asagi (kN/m).
        if (lc && Array.isArray(lc.hatYukleri)) lc.hatYukleri.forEach(y => {
            const e = elements[y.kiris + 1];
            if (!e) { uyarilar.push('yayili yuk: kiris ' + y.kiris + ' yok'); return; }
            const q1 = -y.q1 / 1000, q2 = -y.q2 / 1000;
            e.lineLoads = e.lineLoads || [];
            e.lineLoads.push({ value: q1, q: q1, value2: (Math.abs(q2 - q1) > 1e-9) ? q2 : undefined,
                               startPct: 0, endPct: 100, start: 0, end: 1, direction: 'global', case: 'L' });
        });

        return {
            nodes: nodes, elements: elements, constraints: constraints,
            loads: loads, sections: sections, uyarilar: uyarilar,
            model: { ad: veri.ad }, lc: lc ? lc.ad : null
        };
    }

    window.dnvDosyasiOku = dnvDosyasiOku;
    window.dnvModeliKur = dnvModeliKur;
    window.dnvKesitOlculeri = dnvKesitOlculeri;
    window.dnvParametreleriAyristir = parametreleriAyristir;
})();
