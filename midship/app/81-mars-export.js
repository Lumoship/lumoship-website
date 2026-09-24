// =============================================================================
// 81-mars-export.js — Midship modelini BV MARS'a XML olarak verir
//   (MarineSoftwareImport 1.9, Mars2000 2.9q ve Mars 4.5 ayni semayi kullaniyor
//    — iki kurulumdaki XSD birebir ayni, md5 ile dogrulandi 22 Eylul 2026).
//
// Mars'a modeli ELLE girmek yerine bu dosyayi acarsin; kural taramasini kendi
// motoruyla kosturup bizim sonucla karsilastirabilirsin.
//
// YAPI:
//   MarsExport.topla()      DOM + uygulama durumundan duz bir model nesnesi
//   MarsExport.uret(model)  model -> { xml, eksikler, uyarilar }   ** SAF **
//   MarsExport.indir()      topla + uret + dosya indir
//
// uret() saf tutuldu, cunku dogrulamayi node kosuyor: _standart/mars/verify-mars.js
// uretilen XML'i BV'nin KENDI semasiyla dogruluyor (PowerShell System.Xml).
// Tarayicida ayri, testte ayri bir uretici olsaydi "gecerli" sozu tahmin olurdu.
//
// BIRIMLER - MARS'IN KENDI PROJE DOSYASINDAN OLCULDU (23 Eylul 2026)
//   Ice aktarma semasi (MarineSoftwareImport 1.9) birim SOYLEMIYOR - tek atifi
//   "positivefloat". Bu yuzden Mars'in kendi yazdigi .xma proje dosyasindaki
//   degerler olculdu (dosya musteri verisi oldugu icin burada aktarilmiyor):
//     Node Y / Z, Node Radius                              -> METRE
//     Strake DistanceOffset (DistanceType = S_Distance)    -> METRE
//     LongitudinalStiffenersGroup Start / Spacing          -> METRE
//     CrossSection Bredth / DepDeck / DepTop               -> METRE
//     Strake Thickness, profil WebHeight / WebThickness    -> MM
//     MainParticulars StandardFrameSpacing                 -> MM
//   Capraz kontrol: bir panelin dugum zincirinden elle hesaplanan egri apsisi
//   dosyadaki DistanceOffset ile ve Mars ekraninin "s = ... m" yazisiyla ayni
//   cikti. Yani kesit GEOMETRISI metre, KALINLIK / PROFIL OLCUSU / CERCEVE
//   ARALIGI mm.
//   Midship her ikisini de mm tutuyor; donusum TEK yerde, metre() islevinde.
//   Onceki surum dugumleri mm yaziyordu - o dosya Mars'ta 1000 kat buyuk bir
//   kesit olurdu.
//
// MARS PANEL = MIDSHIP GROUP. Midship'in "panel" dedigi sey dugumden dugume TEK
// parcadir (Mars'ta Segment). Mars'in Panel'i bir parca ZINCIRI ve strake /
// stiffener konumlari zincir boyunca EGRI APSISI ile verilir - Midship'in
// panelData'si tam olarak boyle calisiyor (strakes: toplam len = zincir boyu;
// stiffGroups: panel basindan uzaklik). Esleme birebir, uydurma yok.
//
// EKSIK ALAN politikasi: sema 19 zorunlu ana boyut istiyor; Midship'te 15'i var.
// Kalan uc tanesi (DeadWeight, HeavyBallastDraft, BlockCoefMinBallastDraft)
// kullanicidan istenir - UYDURULMAZ. AERuleFromFr0 frame tablosundan turetilir
// (kural boyunun kic ucu APden olculur; frame 0 APden x0 uzakta, yani AE
// frame 0'a gore -x0'dadir) ve gerekcesi uyarilarda yazilir.
// =============================================================================
(function (kok) {
  'use strict';

  // >>> MARS_ESLEME - TEK KAYNAK: Apps/_standart/mars/ (mars-yay.py yazar, elle duzenleme)
  // Midship pozisyon kodu -> BV PositionCode (pozisyon-eslemesi.json)
  var POZISYON = {
    'bilge': 'Bilge',
    'bottom': 'Bottom',
    'centreGirder': 'Double bottom girder',
    'coaming': 'Hatch coaming',
    'coamingTop': 'Hatch coaming',
    'deck': 'Lower deck',
    'innerBottom': 'Inner bottom',
    'innerSide': 'Inner hull',
    'longBhd': 'Watertight bulkhead',
    'other': 'Miscellaneous',
    'side': 'Side shell',
    'sideGirder': 'Double bottom girder',
    'stringer': 'Lower deck',
    'tweenDeck': 'Lower deck',
    'upperDeck': 'Strength deck (weather)',
  };
  // Midship gemi tipi -> BV ServiceNotation
  var NOTASYON = {
    'bulk_carrier': 'Bulk carrier',
    'container': 'Container ship',
    'general_cargo': 'General cargo ship',
    'other': 'General cargo ship',
    'tanker': 'Oil tanker',
  };
  // Midship kompartiman turu -> BV MainDestination (sema 1.9 enum yazimi birebir).
  // uret() SAF kalmak zorunda (node'da tarayicisiz kosuyor), bu yuzden liste
  // burada da duruyor; 12-cad.js COMP_TYPES ile ayrisirsa _standart/mars/
  // verify-mars.js duser - iki taraf elle senkron tutulmaz, denetlenir.
  var KOMPARTIMAN = {
    'ballast': 'Ballast water tank',
    // Midship'te 'cargo' = "General cargo hold", genel kuru yuk (istif yuku t/m2).
    // "Dry bulk cargo hold" BV'de dokme yuk gemisi ambaridir: ayri kural seti ve
    // semanin CompartmentBulkData blogu. Ikisi ARTIK ayri tur.
    'cargo': 'General cargo hold',
    'dryBulk': 'Dry bulk cargo hold',
    'container': 'Container cargo hold',
    'holdIndepTank': 'Hold containing independent tank',
    'liquidCargo': 'Cargo oil tank',
    'liquidCargoHeated': 'Heated cargo oil tank',
    'lngMembrane': 'Membrane liquefied gas tank',
    'lngIndependent': 'Independent liquefied gas tank',
    'fuel': 'Fuel and lube oil tank',
    'fuelHeated': 'Heated fuel and lube oil tank',
    'freshwater': 'Fresh water tank',
    'machinery': 'Machinery space',
    'accommodation': 'Accommodation space',
    'cofferdamGas': 'Cofferdam gas carrier',
    'hopperWell': 'Hopper well',
    'void': 'Void space',
    'drySpace': 'Dry space',
    'other': 'Other',
  };
  // <<< MARS_ESLEME

  var NL = String.fromCharCode(10);

  // ---- PROFIL ADI -> MARS StiffProp -------------------------------------
  // Sema StiffType icin dort harf tanir: T (T profil), L (kose), B (bulb),
  // F (lama). HW/TW govde, HF/TF flans olculeri (mm).
  // Midship adlari: "HP 200x10" | "L 100x75x9" | "T 400x12/150x16" | "FB 200x12".
  //
  // NEDEN: ilk surumde profil yalnizca AD olarak gidiyordu; StiffProp olculeri
  // sifir yazilip uyari birakiliyordu. Sifir olculu profil MARS'ta kesit
  // ozelligi vermez - dosya acilsa bile tarama anlamsiz olurdu.
  function marsProfil(ad, katalog) {
    var s = String(ad || '').trim();
    if (!s) return null;
    var m;
    // T 400x12/150x16
    m = /^T\s*([\d.]+)\s*[xX]\s*([\d.]+)\s*\/\s*([\d.]+)\s*[xX]\s*([\d.]+)$/.exec(s);
    if (m) return { ad: s, tur: 'T', HW: +m[1], TW: +m[2], HF: +m[3], TF: +m[4], uretim: 'Built-up' };
    // L 100x75x9  (a = govde, b = flans, t = kalinlik)
    m = /^L\s*([\d.]+)\s*[xX]\s*([\d.]+)\s*[xX]\s*([\d.]+)$/.exec(s);
    if (m) return { ad: s, tur: 'L', HW: +m[1], TW: +m[3], HF: +m[2], TF: +m[3], uretim: 'Rolled' };
    // FB 200x12
    m = /^FB\s*([\d.]+)\s*[xX]\s*([\d.]+)$/.exec(s);
    if (m) return { ad: s, tur: 'F', HW: +m[1], TW: +m[2], HF: 0, TF: 0, uretim: 'Rolled' };
    // HP 200x10  (bulb: govde yuksekligi + kalinlik; bulb sekli turun kendisinde)
    m = /^HP\s*([\d.]+)\s*[xX]\s*([\d.]+)$/.exec(s);
    if (m) {
      var k = (katalog || []).filter(function (h) { return h.b === +m[1] && h.t === +m[2]; })[0];
      return { ad: s, tur: 'B', HW: +m[1], TW: +m[2], HF: 0, TF: 0, uretim: 'Rolled', standart: k ? 'EN 10067' : undefined };
    }
    return null;
  }

  // ------------------------------------------------------------ yardimcilar
  function esc(s) {
    return String(s === undefined || s === null ? '' : s)
      .split('&').join('&amp;').split('<').join('&lt;').split('>').join('&gt;')
      .split('"').join('&quot;');
  }
  // mm -> m: kesit geometrisi Mars tarafinda metre (yukaridaki BIRIMLER notu).
  // Basamak varsayilani 4: metrede 1 ondalik 100 mm olurdu, 4 ondalik 0.1 mm.
  function metre(v, basamak) {
    if (v === '' || v === null || v === undefined) return null;
    var x = Number(v);
    if (!isFinite(x)) return null;
    return say(x / 1000, basamak === undefined ? 4 : basamak);
  }
  function say(v, basamak) {
    // BOS ALAN SAYI DEGILDIR: Number('') === 0 oldugu icin bos bir girdi
    // sessizce "0" olarak yazilirdi (olculdu: bos projede yalnizca ShipName
    // eksik gorunuyordu, oysa butun boyutlar bostu).
    if (v === '' || v === null || v === undefined) return null;
    var n = Number(v);
    if (!isFinite(n)) return null;
    var b = (basamak === undefined) ? 3 : basamak;
    return String(+n.toFixed(b));
  }
  function nitelik(obj) {
    var out = [];
    Object.keys(obj).forEach(function (k) {
      var v = obj[k];
      if (v === undefined || v === null || v === '') return;
      out.push(k + '="' + esc(v) + '"');
    });
    return out.join(' ');
  }

  // ------------------------------------------------------------ uretici (saf)
  // model:
  //   gemi { ad, tip, LOA, Lpp, L, B, D, T, Tbal, TbalAgir, Cb, CbBal, DWT, V,
  //          bilgeKeel, LL, Dfb, Dbhd, AEFr0 }
  //   frame { f0, x0, rows:[{from,to,s}] }
  //   malzemeler [{ id, ad, tur, E, ReH, Rm, rho, nu }]
  //   strakeTipleri [{ id, ad, kalinlik }]
  //   stiffTipleri [{ id, ad, tur, HW, TW, HF, TF, uretim }]
  //   kompartimanlar [{ id, ad, tur, xBas, xSon, yMin, yMax, zMin, zMax }]   (m / mm karisik degil: hepsi m)
  //   bm { seaHog:[{x,max,min}], seaSag, harbHog, harbSag, sfSea, sfHarb }   (opsiyonel)
  function uret(model) {
    var eksikler = [], uyarilar = [];
    var g = (model && model.gemi) || {};

    function zorunlu(ad, deger, aciklama) {
      var v = say(deger);
      if (v === null) { eksikler.push({ alan: ad, aciklama: aciklama || '' }); return null; }
      return v;
    }

    var notasyon = NOTASYON[g.tip] || null;
    if (!notasyon) eksikler.push({ alan: 'ServiceNotation', aciklama: 'gemi tipi BV notasyonuna eslenemedi: ' + (g.tip || '-') });

    var ana = {
      ShipName: g.ad || '',
      ServiceNotation: notasyon,
      LengthOverAll: zorunlu('LengthOverAll', g.LOA),
      LengthBtwPerp: zorunlu('LengthBtwPerp', g.Lpp),
      RuleLength: zorunlu('RuleLength', g.L),
      AERuleFromFr0: zorunlu('AERuleFromFr0', g.AEFr0, 'frame tablosundan turetilir'),
      LoadLineLength: zorunlu('LoadLineLength', g.LL),
      BreadthMoulded: zorunlu('BreadthMoulded', g.B),
      DepthAtStrengthDeck: zorunlu('DepthAtStrengthDeck', g.D),
      FreeboardDeck: zorunlu('FreeboardDeck', g.Dfb),
      BulkheadDeck: zorunlu('BulkheadDeck', g.Dbhd),
      DeadWeight: zorunlu('DeadWeight', g.DWT, 'Midship sayfasinda yok - Mars disa aktarim penceresinde sorulur'),
      ScantlingDraft: zorunlu('ScantlingDraft', g.T),
      MinBallastDraft: zorunlu('MinBallastDraft', g.Tbal),
      HeavyBallastDraft: zorunlu('HeavyBallastDraft', g.TbalAgir, 'Midship sayfasinda yok - pencerede sorulur'),
      BlockCoefScantlingDraft: zorunlu('BlockCoefScantlingDraft', g.Cb),
      BlockCoefMinBallastDraft: zorunlu('BlockCoefMinBallastDraft', g.CbBal, 'Midship sayfasinda yok - pencerede sorulur'),
      MaxServiceSpeed: zorunlu('MaxServiceSpeed', g.V),
      BilgeKeel: (g.bilgeKeel === undefined || g.bilgeKeel === null) ? 'false' : (g.bilgeKeel ? 'true' : 'false')
    };
    if (!g.ad) eksikler.push({ alan: 'ShipName', aciklama: 'gemi adi bos' });

    // ---- frame tablosu -----------------------------------------------------
    var frameXml = '';
    var fr = model && model.frame;
    if (fr && fr.rows && fr.rows.length) {
      var gruplar = fr.rows.map(function (r) {
        return '        <FramesGroup ' + nitelik({ FramesCount: Math.max(0, Math.round(r.to - r.from)), Spacing: say(r.s, 1) }) + '/>';
      });
      frameXml =
        '      <FrameTable ' + nitelik({ FirstFrameIndex: Math.round(fr.f0 || 0) }) + '>' + NL +
        '        <FramesGroups>' + NL + gruplar.join(NL) + NL + '        </FramesGroups>' + NL +
        '      </FrameTable>';
    } else {
      uyarilar.push('Frame tablosu bos: Mars dosyasi cerceve bilgisi olmadan gider (sema zorunlu tutmuyor).');
    }

    // ---- SWBM / SF ---------------------------------------------------------
    // Sema dort dagilimi da zorunlu tutuyor (sea/harbour, BM/SF). Midship tek
    // bir hog/sag ciftini tasiyor; noktalar verilmediyse blok hic yazilmaz.
    var bmXml = '';
    if (model && model.bm && model.bm.seaBM && model.bm.seaBM.length) {
      var nokta = function (liste) {
        return liste.map(function (p) {
          return '          <BMPoint ' + nitelik({ X: say(p.x), MSWMax: say(p.max), MSWMin: say(p.min) }) + '/>';
        }).join(NL);
      };
      var sfNokta = function (liste) {
        return liste.map(function (p) {
          return '          <SFPoint ' + nitelik({ X: say(p.x), VSFMax: say(p.max), VSFMin: say(p.min) }) + '/>';
        }).join(NL);
      };
      bmXml =
        '      <SWBMSFDistributions>' + NL +
        '        <BMDistributionSeaGoing>' + NL + nokta(model.bm.seaBM) + NL + '        </BMDistributionSeaGoing>' + NL +
        '        <BMDistributionHarbour>' + NL + nokta(model.bm.harbBM || model.bm.seaBM) + NL + '        </BMDistributionHarbour>' + NL +
        '        <SFDistributionSeaGoing>' + NL + sfNokta(model.bm.seaSF || []) + NL + '        </SFDistributionSeaGoing>' + NL +
        '        <SFDistributionHarbour>' + NL + sfNokta(model.bm.harbSF || model.bm.seaSF || []) + NL + '        </SFDistributionHarbour>' + NL +
        '      </SWBMSFDistributions>';
    }

    // ---- Properties --------------------------------------------------------
    // Kesitte gecen malzeme / kalinlik / profil listede yoksa BURADA uretilir:
    // ID'ler tek yerden dagitilir, boylece kesit ile Properties arasinda
    // eslesmeyen ID kalamaz. Sema ID tutarliligini DENETLEMEZ - eslesmeyen ID
    // sessiz hata olurdu (Mars ya yanlis levhayi kullanir ya da dosyayi reddeder).
    var malz = ((model && model.malzemeler) || []).slice();
    var strakeT = ((model && model.strakeTipleri) || []).slice();
    var stiffT = ((model && model.stiffTipleri) || []).slice();
    function celikReH(ad) {
      var s = String(ad).toUpperCase();
      if (s.indexOf('40') >= 0) return 390;
      if (s.indexOf('36') >= 0) return 355;
      if (s.indexOf('32') >= 0) return 315;
      return 235;
    }
    function malzemeNo(ad) {
      if (!ad) return malz.length ? (malz[0].id || 1) : malzemeNo('A');
      var v = malz.filter(function (m) { return m.ad === ad; })[0];
      if (!v) { v = { id: malz.length + 1, ad: ad, tur: 'Steel', E: 206000, nu: 0.3, rho: 7850, ReH: celikReH(ad) }; malz.push(v); }
      return v.id;
    }
    function strakeNo(kalinlik) {
      var k = Number(kalinlik) || 0;
      var v = strakeT.filter(function (s) { return Number(s.kalinlik) === k; })[0];
      if (!v) { v = { id: strakeT.length + 1, ad: 'PL' + (+k.toFixed(1)), kalinlik: k }; strakeT.push(v); }
      return v.id;
    }
    function stiffNo(profil) {
      if (!profil) return stiffT.length ? stiffT[0].id : 1;
      var ad = (typeof profil === 'string') ? profil : profil.ad;
      var v = stiffT.filter(function (s) { return s.ad === ad; })[0];
      if (!v) {
        var p = (typeof profil === 'string') ? null : profil;
        // Olculer verilmediyse ADDAN cozulur (HP/L/T/FB); cozulemezse SESSIZ
        // kalmaz - sifir olculu profil MARS'ta kesit ozelligi vermez.
        if (!p || !(p.HW > 0)) {
          var c = marsProfil(ad, (typeof HP_CATALOG !== 'undefined') ? HP_CATALOG : []);
          if (c) p = c;
        }
        if (!p || !(p.HW > 0)) {
          uyarilar.push('Profil "' + ad + '" cozulemedi (beklenen: "HP 200x10", "L 100x75x9", "T 400x12/150x16", "FB 200x12"); StiffProp bos olculerle yazildi.');
          p = { ad: ad, tur: 'F', HW: 0, TW: 0, HF: 0, TF: 0 };
        }
        v = { id: stiffT.length + 1, ad: ad, tur: p.tur || 'F', HW: p.HW || 0, TW: p.TW || 0, HF: p.HF || 0, TF: p.TF || 0,
              uretim: p.uretim, standart: p.standart };
        stiffT.push(v);
      }
      return v.id;
    }
    var propXml = '';
    function propUret() {
      if (malz.length && strakeT.length && stiffT.length) {
      propXml =
        '  <Properties>' + NL +
        '    <Materials>' + NL +
        malz.map(function (m) {
          return '      <Material ' + nitelik({
            ID: m.id, Name: m.ad, MaterialType: m.tur || 'Steel',
            YoungModulus: say(m.E || 206000, 0), PoissonRatio: say(m.nu || 0.3, 2),
            Density: say(m.rho || 7850, 0), YieldStress: say(m.ReH, 0), TenStress: say(m.Rm, 0)
          }) + '/>';
        }).join(NL) + NL +
        '    </Materials>' + NL +
        '    <StrakeProps>' + NL +
        strakeT.map(function (s) {
          return '      <StrakeProp ' + nitelik({ ID: s.id, Name: s.ad, Thickness: say(s.kalinlik, 1) }) + '/>';
        }).join(NL) + NL +
        '    </StrakeProps>' + NL +
        '    <StiffProps>' + NL +
        stiffT.map(function (s) {
          return '      <StiffProp ' + nitelik({
            ID: s.id, Name: s.ad, StiffType: s.tur, StiffManufacturing: s.uretim || 'Rolled',
            Standard: s.standart, HW: say(s.HW, 1), TW: say(s.TW, 1), HF: say(s.HF, 1), TF: say(s.TF, 1)
          }) + '/>';
        }).join(NL) + NL +
        '    </StiffProps>' + NL +
        '  </Properties>';
      } else if (malz.length || strakeT.length || stiffT.length) {
        uyarilar.push('Properties blogu yazilmadi: sema Materials + StrakeProps + StiffProps ucunu birden ister.');
      }
    }

    // ---- Compartments ------------------------------------------------------
    var komp = (model && model.kompartimanlar) || [];
    var kompXml = komp.map(function (c) {
      var hedef = KOMPARTIMAN[c.tur] || 'Other';
      // MARS "Loads" sekmesi: sivi yogunlugu, hava borusu ve test yuku. Midship
      // bunlari zaten kompartiman kaydinda tutuyor (rho / airpipe_mm / testHead_m);
      // onceki surum yazmiyordu ve kullanici hepsini Mars'ta elle dolduruyordu.
      // Sema hava borusunu IKIYE bolmus: AirPipeDeckFromBL (borunun ciktigi guverte)
      // + TopOfAirPipeFromDeck (o guverteden yukarisi). Midship tek deger tutuyor
      // (BL'den yukseklik), bu yuzden guverte = tank tavani kabul edilir.
      // Ikisi de positivefloat: sifir/negatif yazilamaz, o durumda ALAN ATLANIR
      // ve uyari birakilir - sessiz sifir gitmez.
      var L = Math.abs((c.xSon || 0) - (c.xBas || 0));
      var B = Math.abs((c.yMax || 0) - (c.yMin || 0));
      var H = Math.abs((c.zMax || 0) - (c.zMin || 0));
      var sivi = /^(ballast|fuel|fuelHeated|freshwater|liquidCargo|liquidCargoHeated|lngMembrane|lngIndependent)$/.test(c.tur);
      var ad = c.ad || c.id;
      var yogunluk = say(c.yogunluk, 3);
      if (sivi && yogunluk === null) uyarilar.push('Kompartiman "' + ad + '": sivi yogunlugu verilmedi, LiquidDensity yazilmadi.');
      var apGuverte = null, apUst = null;
      var apZ = say(c.havaBorusuZ);                       // BL'den, m
      if (apZ !== null && +apZ > (c.zMax || 0)) { apGuverte = say(c.zMax); apUst = say(+apZ - (c.zMax || 0)); }
      else if (sivi) uyarilar.push('Kompartiman "' + ad + '": hava borusu tepesi ' +
        (apZ === null ? 'verilmedi' : 'tank tavaninin (' + say(c.zMax) + ' m) altinda') + ', hava borusu alanlari yazilmadi.');
      // Mars ekraninda "Load test height" m/BL olarak gosteriliyor; Midship ise
      // tank tavanindan YUKSEKLIK tutuyor (IACS 2.4 m gibi), o yuzden BL'ye tasinir.
      var testSeviyesi = (c.testYuku === null || c.testYuku === undefined || c.testYuku === '')
        ? null : say((c.zMax || 0) + Number(c.testYuku));
      if (sivi && testSeviyesi === null) uyarilar.push('Kompartiman "' + ad + '": test yuku verilmedi, LoadTestHeight yazilmadi.');
      return '    <Compartment ' + nitelik({
        ID: c.id, Name: c.ad || c.id, MainDestination: hedef,
        Length: say(L), Breadth: say(B), Height: say(H),
        XG: say(((c.xBas || 0) + (c.xSon || 0)) / 2), YG: say(((c.yMin || 0) + (c.yMax || 0)) / 2),
        ZG: say(((c.zMin || 0) + (c.zMax || 0)) / 2),
        XStartFromFr0: say(c.xBas), XEndFromFr0: say(c.xSon),
        ZTopFromBL: say(c.zMax), ZMinFromBL: say(c.zMin),
        VTot: say(c.hacim !== undefined ? c.hacim : L * B * H),
        LiquidDensity: yogunluk, AirPipeDeckFromBL: apGuverte, TopOfAirPipeFromDeck: apUst,
        LoadTestHeight: testSeviyesi
      }) + '/>';
    }).join(NL);

    // ---- CrossSection ------------------------------------------------------
    // Kesit verilmezse blok hic yazilmaz (sema opsiyonel tutuyor).
    var kesitXml = '';
    var ks = model && model.kesit;
    if (ks && ks.dugumler && ks.dugumler.length && ks.paneller && ks.paneller.length) {
      var dugumNo = {};                                  // 'N12' -> 12 (sema tamsayi ister)
      ks.dugumler.forEach(function (d, i) { dugumNo[d.id] = i + 1; });
      var eksikDugum = [];

      var dugumXml = ks.dugumler.map(function (d, i) {
        return '          <Node ' + nitelik({ ID: i + 1, Y: metre(d.y), Z: metre(d.z) }) + '/>';
      }).join(NL);

      var panelXml = ks.paneller.map(function (p, pi) {
        var segXml = (p.segmanlar || []).map(function (s) {
          var pk = POZISYON[s.pozisyon];
          if (!pk) {
            uyarilar.push('Panel ' + (p.ad || (pi + 1)) + ': "' + (s.pozisyon || '-') + '" pozisyonu eslenemedi, Undefined yazildi.');
            pk = 'Undefined';
          }
          if (dugumNo[s.bitisDugum] === undefined) eksikDugum.push(String(s.bitisDugum));
          return '              <Segment ' + nitelik({
            EndNodeID: dugumNo[s.bitisDugum], SegmentType: (s.tur === 'Arc' ? 'Arc' : 'Line'),
            Radius: metre(s.tur === 'Arc' ? (s.r || 0) : 0), PositionCode: pk
          }) + '/>';
        }).join(NL);

        // Strake: SEnd = zincir basindan EGRI APSISI (semanin kendi notu:
        // "Curvilinear abscissa of end of strake"), yani len'lerin toplami.
        var apsis = 0;
        var strakeXml = (p.strakeler || []).map(function (s, si) {
          apsis += Number(s.uzunluk) || 0;
          return '              <Strake ' + nitelik({
            STID: s.id || ('S' + (pi + 1) + '_' + (si + 1)), SEnd: metre(apsis),
            MaterialID: malzemeNo(s.malzeme), StrakePropertyID: strakeNo(s.kalinlik),
            SHoleStart: metre(s.delikBas || 0), SHoleEnd: metre(s.delikSon || 0)
          }) + '/>';
        }).join(NL);

        var stiffXml = (p.stiffenerlar || []).map(function (s, si) {
          return '              <Stiffener ' + nitelik({
            STID: s.id || ('T' + (pi + 1) + '_' + (si + 1)), UserLabel: s.etiket, S: metre(s.s),
            // Midship kesidi bir ORTA KESIT: uzerindeki takviyeler boyunadir,
            // yani kesit duzlemine DIK (Perpendicular). Enine cerceveler bu
            // modelde yok; gelirse yon alani modelden gelir.
            Direction: s.yon || 'Perpendicular', Side: s.taraf || 'Left',
            FlangeDirection: s.flansYonu, MaterialID: malzemeNo(s.malzeme), StiffPropertyID: stiffNo(s.profil)
          }) + '/>';
        }).join(NL);

        return '          <Panel ' + nitelik({
          ID: pi + 1, Name: p.ad || ('P' + (pi + 1)),
          // PrimaryStructureSpacing: gruptaki EN AZ emin olunan alan. .xma'da dogrudan
          // karsiligi yok; panelin tasiyici araligi SuppAftX/SuppForeX farkindan
          // (36.7 -> 38.1 = 1.4) yani METRE olarak cikiyor, o kabul edildi.
          StartNodeID: dugumNo[p.baslangicDugum], PrimaryStructureSpacing: metre(p.psAralik), Beff: p.beff
        }) + '>' + NL +
          '            <Segments>' + NL + segXml + NL + '            </Segments>' + NL +
          (strakeXml ? ('            <Strakes>' + NL + strakeXml + NL + '            </Strakes>' + NL) : '') +
          (stiffXml ? ('            <Stiffeners>' + NL + stiffXml + NL + '            </Stiffeners>' + NL) : '') +
          '          </Panel>';
      }).join(NL);

      if (eksikDugum.length) {
        eksikler.push({ alan: 'CrossSection/Node', aciklama: 'segman bitis dugumu listede yok: ' + eksikDugum.slice(0, 3).join(', ') });
      }
      if (say(ks.yerelDerinlik) === null || say(ks.yerelGenislik) === null) {
        eksikler.push({ alan: 'CrossSection/LocalDepth-LocalBreadth', aciklama: 'kesit yerel derinlik / genislik verilmedi' });
      }

      kesitXml =
        '  <CrossSections>' + NL +
        '    <CrossSection ' + nitelik({
          ID: ks.id || 1, Name: ks.ad, XFromFr0: say(ks.xFr0), LocalDepth: say(ks.yerelDerinlik),
          LocalDepthTopContMember: say(ks.yerelDerinlikUst), LocalBreadth: say(ks.yerelGenislik)
        }) + '>' + NL +
        '        <Nodes>' + NL + dugumXml + NL + '        </Nodes>' + NL +
        '        <Panels>' + NL + panelXml + NL + '        </Panels>' + NL +
        '    </CrossSection>' + NL +
        '  </CrossSections>';
    }

    propUret();   // kesit gezildikten SONRA: otomatik uretilen malzeme/kalinlik/profil de listeye girsin

    // ---- birlestir ---------------------------------------------------------
    var xml =
      '<?xml version="1.0" encoding="utf-8"?>' + NL +
      '<MarineSoftwareImport MajorVersion="1" MinorVersion="9">' + NL +
      '  <MainProjectData>' + NL +
      '    <MainParticulars ' + nitelik(ana) + '/>' + NL +
      (bmXml ? bmXml + NL : '') +
      (frameXml ? frameXml + NL : '') +
      '  </MainProjectData>' + NL +
      (propXml ? propXml + NL : '') +
      (komp.length ? ('  <Compartments>' + NL + kompXml + NL + '  </Compartments>' + NL) : ('  <Compartments/>' + NL)) +
      (kesitXml ? kesitXml + NL : '') +
      '</MarineSoftwareImport>' + NL;

    ((model && model.ekUyarilar) || []).forEach(function (u) { uyarilar.push(u); });
    return { xml: xml, eksikler: eksikler, uyarilar: uyarilar };
  }

  // ------------------------------------------------------------ DOM toplayici
  function v(id) { var e = document.getElementById(id); return e ? e.value : ''; }
  function isaretli(id) { var e = document.getElementById(id); return !!(e && e.checked); }

  // Eksik uc alan icin gizli girdiler: #page-1 icinde durduklari icin proje
  // kaydina (95-project.js formValues) kendiliginden girerler - ayri bir
  // saklama yolu acmak iki kaynak demek olurdu.
  var EK_ALANLAR = [
    { id: 'marsDWT', etiket: 'Deadweight (t)', ipucu: 'MARS zorunlu tutuyor; Midship sayfasinda yok' },
    { id: 'marsTbalAgir', etiket: 'Heavy ballast draught (m)', ipucu: 'agir balast durumu draft' },
    { id: 'marsCbBal', etiket: 'C_b at min ballast draught', ipucu: 'balast draftindaki blok katsayisi' }
  ];
  function ekAlanlariKur() {
    if (document.getElementById('marsDWT')) return;
    var sayfa = document.getElementById('page-1');
    if (!sayfa) return;
    var kutu = document.createElement('div');
    kutu.id = 'marsGizliAlanlar';
    kutu.style.display = 'none';
    EK_ALANLAR.forEach(function (a) {
      var i = document.createElement('input');
      i.type = 'number'; i.id = a.id; i.step = 'any';
      kutu.appendChild(i);
    });
    sayfa.appendChild(kutu);
  }

  // Kesit: Midship'in kendi modelinden (SectionModel). Mars Panel = Midship
  // group (zincir); apsisler zincir boyunca olculur - iki tarafta da ayni.
  var kesitUyarisi = null;
  function kesitTopla() {
    kesitUyarisi = null;
    var S = (window.Draw && Draw.getSection) ? Draw.getSection() : null;
    if (!S || !S.nodes || !S.nodes.length || !S.panels || !S.panels.length) return null;
    if (window.SectionModel && SectionModel.migratePanelData) { try { SectionModel.migratePanelData(S); } catch (e) { } }

    var psAralik = parseFloat(v('transFrameSpacing')) || 0;
    var L = parseFloat(v('L')) || 0;
    var xL = parseFloat(v('sectionXL'));
    var x0 = 0;
    try { var ft = JSON.parse(v('frameTableJson') || 'null'); if (ft && isFinite(parseFloat(ft.x0))) x0 = parseFloat(ft.x0); } catch (e) { }

    var paneller = [];
    var gruplar = Object.keys(S.groups || {});
    if (gruplar.length && window.SectionModel && SectionModel.chainInfo) {
      gruplar.forEach(function (gid) {
        var ci = SectionModel.chainInfo(S, gid);
        if (!ci || !ci.items.length) return;
        var d = SectionModel.panelData(S, gid);
        var segmanlar = ci.items.map(function (it) {
          return {
            bitisDugum: it.fwd ? it.seg.to : it.seg.from,
            tur: (it.seg.curve && it.seg.curve.type === 'arc') ? 'Arc' : 'Line',
            r: it.seg.curve ? it.seg.curve.r : 0,
            pozisyon: it.seg.position
          };
        });
        var strakeler = (d.strakes || []).map(function (st, i) {
          return {
            id: gid + '_S' + (i + 1), uzunluk: st.len, kalinlik: st.t, malzeme: st.grade,
            delikBas: st.hole ? st.hole.start : 0, delikSon: st.hole ? st.hole.end : 0
          };
        });
        var stiffenerlar = [];
        (d.stiffGroups || []).forEach(function (g) {
          var p = SectionModel.groupPositions ? SectionModel.groupPositions(S, gid, g, null) : { placed: [] };
          (p.placed || []).forEach(function (x, i) {
            stiffenerlar.push({
              id: gid + '_' + g.id + '_' + (i + 1), etiket: g.id, s: x,
              profil: g.profile || null, malzeme: g.grade || null,
              // Midship kesidindeki takviyeler boyuna: kesit duzlemine dik
              yon: (g.dir === 'trans') ? 'Vertical' : 'Perpendicular'
            });
          });
        });
        paneller.push({
          ad: (S.groups[gid] || gid), baslangicDugum: ci.startNode, psAralik: psAralik,
          segmanlar: segmanlar, strakeler: strakeler, stiffenerlar: stiffenerlar
        });
      });
    } else {
      // gruplandirma yoksa her parca kendi paneli olur (Mars bunu da kabul eder)
      S.panels.forEach(function (q) {
        paneller.push({
          ad: q.tag || q.position || 'P', baslangicDugum: q.from, psAralik: psAralik,
          segmanlar: [{ bitisDugum: q.to, tur: (q.curve ? 'Arc' : 'Line'), r: q.curve ? q.curve.r : 0, pozisyon: q.position }],
          strakeler: [], stiffenerlar: []
        });
      });
    }

    // Strake / stiffener verisi panelData'dan gelir; kullanici adim 3'e hic
    // ugramadiysa bos olur. Bu durumda XML yine gecerlidir (geometri + pozisyon
    // kodlari gider) ama plaka kalinligi ve takviye tasimaz - SESSIZ kalmasin.
    var strakeSay = 0, stiffSay = 0;
    paneller.forEach(function (p) { strakeSay += p.strakeler.length; stiffSay += p.stiffenerlar.length; });
    if (!strakeSay || !stiffSay) {
      kesitUyarisi = 'Kesitte ' + strakeSay + ' strake ve ' + stiffSay + ' takviye bulundu: ' +
        'panel verisi bos. Midship 3. adimina (levhalar / takviyeler) ugrayip modeli doldurun, ' +
        'yoksa MARS dosyasi yalnizca geometri tasir.';
    }

    return {
      id: 1, ad: 'Midship',
      // Kesit konumu Fr0'a gore: Midship x/L tutuyor, frame tablosu da frame 0'in
      // APden uzakligini. x_Fr0 = x/L * L - x0
      xFr0: (isFinite(xL) && L) ? (xL * L - x0) : null,
      yerelDerinlik: parseFloat(v('D')) || null,
      yerelGenislik: parseFloat(v('B')) || null,
      dugumler: S.nodes.map(function (n) { return { id: n.id, y: n.y, z: n.z }; }),
      paneller: paneller
    };
  }

  function topla() {
    ekAlanlariKur();
    var frame = { f0: 0, x0: 0, rows: [] };
    try { frame = JSON.parse(v('frameTableJson') || 'null') || frame; } catch (e) { }

    return {
      gemi: {
        ad: v('vesselName'), tip: v('shipType'),
        LOA: v('LOA'), Lpp: v('Lpp'), L: v('L'), B: v('B'), D: v('D'), T: v('T'),
        Tbal: v('bvTbal'), Cb: v('Cb'), V: v('serviceSpeed'),
        LL: v('bvLoadLineLength'), Dfb: v('bvDepthFreeboard'), Dbhd: v('bvDepthBulkhead'),
        bilgeKeel: isaretli('bvBilgeKeel'),
        DWT: v('marsDWT'), TbalAgir: v('marsTbalAgir'), CbBal: v('marsCbBal'),
        // AE: kural boyunun kic ucu APdedir; frame 0 APden x0 uzakta oldugu icin
        // AE, frame 0'a gore -x0'dadir.
        AEFr0: (frame && isFinite(parseFloat(frame.x0))) ? (-parseFloat(frame.x0)) : 0
      },
      frame: frame,
      malzemeler: [], strakeTipleri: [], stiffTipleri: [],   // kesitten otomatik uretilir
      kompartimanlar: (window.Compartments && Compartments.read) ? Compartments.read().map(function (c) {
        return {
          id: c.id, ad: c.name || c.id, tur: c.type,
          xBas: c.xStart_m, xSon: c.xEnd_m,
          yMin: (c.y0 || 0) / 1000, yMax: (c.y1 || 0) / 1000,
          zMin: (c.z0 || 0) / 1000, zMax: (c.z1 || 0) / 1000,
          // MARS Loads sekmesi icin: yogunluk t/m3, hava borusu mm -> m, test yuku m
          yogunluk: c.rho, havaBorusuZ: (c.airpipe_mm || c.airpipe_mm === 0) ? c.airpipe_mm / 1000 : null,
          testYuku: c.testHead_m
        };
      }) : [],
      kesit: kesitTopla(),
      ekUyarilar: kesitUyarisi ? [kesitUyarisi] : []
    };
  }

  // ------------------------------------------------------------ pencere
  function pencere(sonuc) {
    ekAlanlariKur();
    var eski = document.getElementById('marsModal');
    if (eski) eski.remove();
    var d = document.createElement('div');
    d.id = 'marsModal';
    d.style.cssText = 'position:fixed;inset:0;z-index:12000;background:rgba(15,23,42,0.45);display:flex;align-items:center;justify-content:center';
    var kutu = document.createElement('div');
    kutu.style.cssText = 'background:#fff;border:1px solid #e2e8f0;border-radius:10px;max-width:560px;width:92%;padding:22px;font-family:Inter,system-ui,sans-serif;box-shadow:0 20px 60px rgba(0,0,0,0.25)';
    var h = document.createElement('div');
    h.style.cssText = 'font-family:"JetBrains Mono",monospace;font-size:0.95rem;font-weight:700;margin-bottom:6px';
    h.textContent = 'Export to MARS (XML)';
    kutu.appendChild(h);
    var p = document.createElement('div');
    p.style.cssText = 'font-size:0.8rem;color:#475569;margin-bottom:14px';
    p.textContent = 'MARS bu alanlari zorunlu tutuyor; Midship sayfasinda karsiligi yok. Bir kez doldur, projede saklanir.';
    kutu.appendChild(p);

    EK_ALANLAR.forEach(function (a) {
      var sat = document.createElement('label');
      sat.style.cssText = 'display:flex;align-items:center;gap:10px;margin-bottom:10px;font-size:0.82rem;color:#0f172a';
      var ad = document.createElement('span'); ad.style.cssText = 'flex:1'; ad.textContent = a.etiket;
      var gir = document.createElement('input');
      gir.type = 'number'; gir.step = 'any';
      gir.style.cssText = 'width:150px;padding:6px 8px;border:1px solid #e2e8f0;border-radius:6px;font-family:"JetBrains Mono",monospace;font-size:0.8rem';
      gir.value = v(a.id);
      gir.oninput = function () { var g = document.getElementById(a.id); if (g) { g.value = gir.value; g.dispatchEvent(new Event('change', { bubbles: true })); } };
      sat.appendChild(ad); sat.appendChild(gir);
      kutu.appendChild(sat);
    });

    var durum = document.createElement('div');
    durum.style.cssText = 'font-size:0.75rem;color:#b45309;margin:10px 0;white-space:pre-line';
    if (sonuc && sonuc.eksikler && sonuc.eksikler.length) {
      durum.textContent = 'Eksik: ' + sonuc.eksikler.map(function (e) { return e.alan; }).join(', ');
    }
    kutu.appendChild(durum);

    var alt = document.createElement('div');
    alt.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;margin-top:8px';
    var iptal = document.createElement('button');
    iptal.textContent = 'Kapat';
    iptal.style.cssText = 'padding:7px 14px;border:1px solid #e2e8f0;background:#f8fafc;border-radius:6px;cursor:pointer;font-size:0.8rem';
    iptal.onclick = function () { d.remove(); };
    var tamam = document.createElement('button');
    tamam.textContent = 'XML indir';
    tamam.style.cssText = 'padding:7px 14px;border:1px solid #2563eb;background:#2563eb;color:#fff;border-radius:6px;cursor:pointer;font-size:0.8rem';
    tamam.onclick = function () {
      var r = indir();
      if (r.eksikler.length) {
        durum.textContent = 'Eksik: ' + r.eksikler.map(function (e) { return e.alan + (e.aciklama ? ' (' + e.aciklama + ')' : ''); }).join(NL);
        return;
      }
      d.remove();
      if (r.uyarilar.length && typeof console !== 'undefined') console.warn('[MARS] ' + r.uyarilar.join(' | '));
    };
    alt.appendChild(iptal); alt.appendChild(tamam);
    kutu.appendChild(alt);
    d.appendChild(kutu);
    document.body.appendChild(d);
  }

  // Dugmenin cagirdigi: eksik yoksa dogrudan indir, varsa pencereyi ac.
  function calistir() {
    var r = indir();
    if (r.eksikler.length) pencere(r);
    else if (r.uyarilar.length && typeof console !== 'undefined') console.warn('[MARS] ' + r.uyarilar.join(' | '));
    return r;
  }

  function indir() {
    var r = uret(topla());
    if (r.eksikler.length) return r;                      // cagiran pencereyi acar
    var ad = (v('vesselName') || 'midship').replace(/[^A-Za-z0-9_-]+/g, '_') + '_mars.xml';
    var blob = new Blob([r.xml], { type: 'application/xml' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = ad;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1500);
    return r;
  }

  var API = { uret: uret, topla: topla, indir: indir, calistir: calistir, pencere: pencere, marsProfil: marsProfil, metre: metre,
              POZISYON: null, NOTASYON: null, KOMPARTIMAN: null };
  // esleme tablolari disa da acilir (test ve arayuz etiketleri icin)
  try { API.POZISYON = POZISYON; API.NOTASYON = NOTASYON; API.KOMPARTIMAN = KOMPARTIMAN; } catch (e) { /* esleme henuz yazilmadi */ }

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else { kok.MarsExport = API; kok.exportMars = calistir; }
}(typeof window !== 'undefined' ? window : this));
