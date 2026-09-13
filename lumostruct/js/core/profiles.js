        // ============== PROFILE PROPERTIES ==============
        // Tek kaynak. Ayni profilin arayuzden (createProfile) ve DXF katman adindan
        // (layerToSection) uretilmesi ayni sayilari vermek zorunda; eskiden vermiyordu -
        // HP200x10 icin Iz iki yol arasinda 100 kat, Wz 1000 kat farkliydi ve ikisi de
        // "alan x sabit" seklinde, boyutsal olarak atalet momenti bile olmayan degerlerdi.
        //
        // Girdi: mm.  Cikti: cm tabanli muhendislik birimleri (cm2, cm3, cm4, cm),
        // cunku kompozit hesaplari zaten cm ile calisiyor. SI'ya cevirmek cagiranin isi.

        // Acik ince cidarli kesit burulma sabiti: J = (1/3) * toplam(b * t^3)
        function openJ(parts) {
            let J = 0;
            parts.forEach(([b, t]) => { if (b > 0 && t > 0) J += b * Math.pow(t, 3) / 3; });
            return J;
        }

        // Bulb flat icin BV esdeger yigma kesiti.
        //   BV NR467 Part B, Ch 4, Sec 6, [1.4.1]
        // Bulbun kendisi parametrik degildir - yuvarlatilmis, haddelenmis bir
        // sismedir - o yuzden ondan dogrudan kalinlik dusulemez. Kural tam bu
        // sorunu cozmek icin bulbu bir T kesite cevirir: govde + flans.
        // Olculer NET (korozyon dusulmus) bulb olculerinden hesaplanir.
        //
        //   h  = h'w - h'w/9,2 + 2
        //   bf = alfa * (t'w + h'w/6,7 - 2)
        //   tf = h'w/9,2 - 2
        //   tw = t'w
        //   alfa = 1,1 + (120 - h'w)^2 / 3000   (h'w <= 120)   ;  1,0   (h'w > 120)
        function bulbEsdegerOlculer(hwMM, twMM) {
            const alfa = hwMM <= 120 ? 1.1 + Math.pow(120 - hwMM, 2) / 3000 : 1.0;
            return {
                h:  hwMM - hwMM / 9.2 + 2,
                tw: twMM,
                bf: alfa * (twMM + hwMM / 6.7 - 2),
                tf: hwMM / 9.2 - 2
            };
        }

        // Esdeger kesitin alani, ataleti ve agirlik merkezi. Merkez GOVDE
        // DIBINDEN (plakanin oturdugu yuzden) olculur - katalogdaki dx ile ayni
        // referans. mm girer, cm/cm2/cm4 cikar.
        function bulbEsdegerOzellik(e) {
            const Aw = e.h * e.tw, Af = Math.max(e.bf, 0) * Math.max(e.tf, 0);
            const A = Aw + Af;
            if (!(A > 0)) return { A: 0, I: 0, yc: 0 };
            const yw = e.h / 2, yf = e.h + e.tf / 2;
            const yc = (Aw * yw + Af * yf) / A;
            const I = e.tw * Math.pow(e.h, 3) / 12 + Aw * Math.pow(yw - yc, 2)
                    + Math.max(e.bf, 0) * Math.pow(Math.max(e.tf, 0), 3) / 12
                    + Af * Math.pow(yf - yc, 2);
            return { A: A / 100, I: I / 1e4, yc: yc / 10 };
        }

        // Bulb flat: govde + bulb. Bulb, esit alanli bir daire olarak modelleniyor -
        // katalogdaki genislikle (c) tutarli cikan, savunulabilir bir yaklasim.
        // HP200x10 icin Iz = 4.03 cm4 verir; yayinlanmis deger 3.2-4 cm4 araligindadir.
        //
        // KOROZYON (korMM, govde kalinligindan dusulecek pay):
        // Esdeger kesit KATALOGUN YERINE GECMEZ, yalnizca DEGISIMI verir.
        // Olculdu: BV esdegeri gercek geometriye gore plaka lifi mukavemet
        // momentinde ortalama %8, serbest kenarda %14 sapiyor. Onu bruet kesit
        // icin kullanmak her HP profilinde bu hatayi ustlenmek olurdu. Bunun
        // yerine esdeger kesit brut ve net olculerle iki kez kurulur ve ORAN
        // katalog degerlerine uygulanir: korozyon sifirken oran tam olarak 1,
        // yani bugunku sonuc kili kilina korunur.
        function bulbFlatProperties(bMM, tMM, korMM) {
            const B = bMM / 10;                                  // cm
            let T = tMM / 10;
            const cat = (typeof HP_CATALOG !== 'undefined')
                ? HP_CATALOG.find(hp => hp.b === bMM && hp.t === tMM) : null;

            let A = cat ? cat.A : B * T * 1.2;                    // cm2
            let Iy = cat ? cat.Ixx : T * Math.pow(B, 3) / 12 * 1.3;
            // Katalogdaki dx GOVDE DIBINDEN (plakanin oturdugu yuz) olculur:
            // HP200x10 icin 11,54 cm, elle hesapla 11,89 cm - bulb ucundan
            // olcseydi 10 cm'in altinda olurdu. plakaliKesitSI de boyle okuyor.
            let centroidY = cat ? cat.dx : B / 2;                 // cm

            const kor = (typeof korMM === 'number' && isFinite(korMM) && korMM > 0) ? korMM : 0;
            if (kor > 0) {
                const brut = bulbEsdegerOzellik(bulbEsdegerOlculer(bMM, tMM));
                const net  = bulbEsdegerOzellik(bulbEsdegerOlculer(bMM, Math.max(tMM - kor, 0.5)));
                if (brut.A > 0 && brut.I > 0 && brut.yc > 0) {
                    A *= net.A / brut.A;
                    Iy *= net.I / brut.I;
                    centroidY *= net.yc / brut.yc;
                }
                T = Math.max(T - kor / 10, 0.05);
            }

            const Aweb = B * T;                                   // duz govde

            let d = Math.sqrt(Math.max(A - Aweb, 0) * 4 / Math.PI);   // esdeger bulb capi
            if (!(d > T)) d = T;                                      // bulbsuz/dejenere hal

            const webW = Math.max(B - d, 0);
            const Iz = webW * Math.pow(T, 3) / 12 + Math.PI * Math.pow(d, 4) / 64;

            const yTop = centroidY, yBot = Math.max(B - centroidY, 1e-9);
            return {
                // Aflange: ZAYIF eksen kesme alani. Bulb flat aslinda bir levha,
                // yanal kesme butun kesitten gecer - dikdortgen icin 5/6 A.
                type: 'HP', A: A, Aweb: Aweb, Aflange: A * 5 / 6, Iy: Iy, Iz: Iz,
                J: openJ([[webW, T]]) + Math.PI * Math.pow(d, 4) / 32,
                // Burulma kesit modulu: acik kesitte J/t_max (en kalin parcada
                // kayma en buyuktur). Bulbda esdeger cap kalinlik sayilir.
                Wt: (openJ([[webW, T]]) + Math.PI * Math.pow(d, 4) / 32) / Math.max(T, d),
                Wy: Iy / Math.max(yTop, yBot), WyTop: Iy / yTop, WyBot: Iy / yBot,
                Wz: Iz / (d / 2),
                height: B, tw: T, centroidY: centroidY, bulbDia: d, fromCatalog: !!cat
            };
        }

        function flatBarProperties(hMM, tMM) {
            const H = hMM / 10, T = tMM / 10;
            const A = H * T;
            const Iy = T * Math.pow(H, 3) / 12;
            const Iz = H * Math.pow(T, 3) / 12;
            return {
                type: 'FB', A: A, Aweb: A, Aflange: A * 5 / 6, Iy: Iy, Iz: Iz, J: openJ([[H, T]]),
                Wt: openJ([[H, T]]) / T,
                Wy: Iy / (H / 2), WyTop: Iy / (H / 2), WyBot: Iy / (H / 2),
                Wz: Iz / (T / 2),
                height: H, tw: T, centroidY: H / 2
            };
        }

        // Web yuksekligi h, govde kalinligi tw, flans genisligi bf, flans kalinligi tf.
        // Yerel eksende flans altta (mevcut kompozit hesabiyla tutarli).
        function teeProperties(hMM, twMM, bfMM, tfMM) {
            const H = hMM / 10, TW = twMM / 10, BF = bfMM / 10, TF = tfMM / 10;
            const Aw = H * TW, Af = BF * TF, A = Aw + Af;
            const total = H + TF;

            const yf = TF / 2, yw = TF + H / 2;
            const c = (Af * yf + Aw * yw) / A;

            const Iy = BF * Math.pow(TF, 3) / 12 + Af * Math.pow(yf - c, 2) +
                       TW * Math.pow(H, 3) / 12 + Aw * Math.pow(yw - c, 2);
            const Iz = TF * Math.pow(BF, 3) / 12 + H * Math.pow(TW, 3) / 12;

            const yTop = Math.max(total - c, 1e-9), yBot = Math.max(c, 1e-9);
            return {
                // T kesitte yanal kesmeyi FLANS tasir, govde degil.
                type: 'T', A: A, Aweb: Aw, Aflange: Af, Iy: Iy, Iz: Iz, J: openJ([[BF, TF], [H, TW]]),
                Wt: openJ([[BF, TF], [H, TW]]) / Math.max(TF, TW),
                Wy: Iy / Math.max(yTop, yBot), WyTop: Iy / yTop, WyBot: Iy / yBot,
                Wz: Iz / (BF / 2),                     // en genis boyutun yarisi
                height: total, tw: TW, centroidY: c
            };
        }

        // Kose: dusey kol a, yatay kol b, govde kalinligi t, yatay kol
        // kalinligi tf (verilmezse t - esit kalinlikli kosebent).
        //
        // Iki kalinlik gerekiyor cunku gemi cizimlerinde kollari farkli
        // kalinlikta kosebent yaygin (.steel dosyasinda <a h t><flange w t>
        // ikisini ayri veriyor) ve korozyon paylari da govdeye ve flansa ayri
        // dusuyor. Tek kalinlikla zorlamak ikisini birden yanlis yapardi.
        function angleProperties(aMM, bMM, tMM, tfMM) {
            const A_ = aMM / 10, B_ = bMM / 10, T = tMM / 10;
            const TF = (typeof tfMM === 'number' && isFinite(tfMM) && tfMM > 0) ? tfMM / 10 : T;
            const A1 = A_ * T, A2 = Math.max(B_ - T, 0) * TF;
            const A = A1 + A2;

            const y1 = A_ / 2, y2 = TF / 2;
            const cy = (A1 * y1 + A2 * y2) / A;
            const Iy = T * Math.pow(A_, 3) / 12 + A1 * Math.pow(y1 - cy, 2) +
                       Math.max(B_ - T, 0) * Math.pow(TF, 3) / 12 + A2 * Math.pow(y2 - cy, 2);

            const x1 = T / 2, x2 = T + Math.max(B_ - T, 0) / 2;
            const cx = (A1 * x1 + A2 * x2) / A;
            const Iz = A_ * Math.pow(T, 3) / 12 + A1 * Math.pow(x1 - cx, 2) +
                       TF * Math.pow(Math.max(B_ - T, 0), 3) / 12 + A2 * Math.pow(x2 - cx, 2);

            // Kosebentte asal eksenler geometrik eksenlerle CAKISMAZ: carpim atalet
            // momenti Ixy sifir degildir. Izgaraya hizali takviyelerde geometrik eksenlerle
            // hesaplamak yaygin ve kabul edilebilir bir basitlestirmedir, ama sessiz
            // kalmamali - asal eksen acisi hesaplanip kesitle birlikte tasinir.
            const Ixy = A1 * (x1 - cx) * (y1 - cy) + A2 * (x2 - cx) * (y2 - cy);
            const principalAngle = (Math.abs(Iy - Iz) > 1e-12 || Math.abs(Ixy) > 1e-12)
                ? 0.5 * Math.atan2(2 * Ixy, Iy - Iz) * 180 / Math.PI
                : 0;

            const yTop = Math.max(A_ - cy, 1e-9), yBot = Math.max(cy, 1e-9);
            return {
                // Kosebentte yanal kesmeyi yatay kol tasir; dejenere halde
                // (b ~ t) dikdortgen degerine duser.
                type: 'L', A: A, Aweb: A1, Aflange: (A2 > 0 ? A2 : A * 5 / 6), Iy: Iy, Iz: Iz,
                Ixy: Ixy,
                principalAngle: principalAngle,
                note: Math.abs(principalAngle) > 1
                    ? 'Geometric axes; principal axes rotated ' +
                      Math.abs(principalAngle).toFixed(1) + ' deg'
                    : null,
                J: openJ([[A_, T], [Math.max(B_ - T, 0), TF]]),
                Wt: openJ([[A_, T], [Math.max(B_ - T, 0), TF]]) / Math.max(T, TF),
                Wy: Iy / Math.max(yTop, yBot), WyTop: Iy / yTop, WyBot: Iy / yBot,
                Wz: Iz / Math.max(cx, B_ - cx),
                height: A_, tw: T, centroidY: cy
            };
        }

        // ---- KOROZYON PAYLARI ----
        // Gemi kurallarinda korozyon KALINLIKTAN dusulur; yukseklikler ve
        // genislikler degismez.
        //
        // Steel dosyasi uc pay veriyor: web / top / bottom. Bunlar YON degil
        // ROL bildirir - govde, profilin kendi flansi, baglanti plakasi. Steel
        // profili yukari dogru cizer (plaka altta), biz asagi sarkitiriz (plaka
        // ustte); "top" ve "bottom" diye tasimak aynadan gelen karisikligi
        // sonsuza kadar surdururdu. Rolle adlandirmak onu bastan keser.
        //
        //   kor = { web, flange, plate }   mm
        //
        function korozyonPayi(kor, ad) {
            if (!kor) return 0;
            const v = kor[ad];
            return (typeof v === 'number' && isFinite(v) && v > 0) ? v : 0;
        }

        // KAPALI KUTU. Iki dusey govde, ustte ve altta birer plaka.
        //
        // h DIS OLCUDUR (govdeler tam boy, plakalar aralarina oturur) - T
        // profilindeki h govde yuksekligiyken burada oyle degil. Bu, tahmin
        // degil olcum: tests/verify-steel.js ayni okumayla Steel 4.4.7 portal
        // vinc vakasini 34 kontrolde tutturuyor.
        //
        // Burulma BREDT ile: kapali kesitte J acik kesittekinin binlerce kati
        // olabilir, openJ ile hesaplamak kutuyu acik kanal sanmak olurdu.
        function boxProperties(hMM, twMM, ustWMM, ustTMM, altWMM, altTMM) {
            const H = hMM / 10, TW = twMM / 10;
            const UW = ustWMM / 10, UT = ustTMM / 10;
            const AW = (altWMM > 0 ? altWMM : ustWMM) / 10;
            const AT = (altTMM > 0 ? altTMM : ustTMM) / 10;
            const W = Math.max(UW, AW);                  // dis genislik
            const icU = Math.max(UW - 2 * TW, 0), icA = Math.max(AW - 2 * TW, 0);

            // [alan, y(alt yuzden), kendi ataleti]
            const par = [
                [H * TW, H / 2, TW * Math.pow(H, 3) / 12],
                [H * TW, H / 2, TW * Math.pow(H, 3) / 12],
                [icU * UT, H - UT / 2, icU * Math.pow(UT, 3) / 12],
                [icA * AT, AT / 2, icA * Math.pow(AT, 3) / 12]
            ];
            const A = par.reduce((t, q) => t + q[0], 0);
            const yc = par.reduce((t, q) => t + q[0] * q[1], 0) / A;
            const Iy = par.reduce((t, q) => t + q[2] + q[0] * Math.pow(q[1] - yc, 2), 0);
            const Iz = 2 * (H * Math.pow(TW, 3) / 12 + H * TW * Math.pow((W - TW) / 2, 2))
                     + UT * Math.pow(icU, 3) / 12 + AT * Math.pow(icA, 3) / 12;

            // Bredt: orta cizgi cevresi ve kapali alan
            const bOrta = W - TW, hOrta = H - (UT + AT) / 2;
            const Am = Math.max(bOrta * hOrta, 1e-9);
            const cevre = 2 * hOrta / TW + (UT > 0 ? bOrta / UT : 0) + (AT > 0 ? bOrta / AT : 0);
            const J = cevre > 0 ? 4 * Am * Am / cevre : 0;
            const tMin = Math.min(TW, UT > 0 ? UT : TW, AT > 0 ? AT : TW);

            const yUst = Math.max(H - yc, 1e-9), yAlt = Math.max(yc, 1e-9);
            return {
                type: 'BOX', A: A, Aweb: 2 * H * TW, Aflange: icU * UT + icA * AT,
                Iy: Iy, Iz: Iz, J: J,
                Wt: 2 * Am * tMin,
                Wy: Iy / Math.max(yUst, yAlt), WyTop: Iy / yUst, WyBot: Iy / yAlt,
                Wz: Iz / (W / 2),
                // centroidY ALT yuzden olculur; plakaliKesitSI plakayi alt
                // yuze oturtur (o taraf "height - centroidY" kadar uzakta).
                height: H, tw: TW, centroidY: yc, width: W
            };
        }

        // Ortak giris. dims mm cinsinden. kor (istege bagli) mm cinsinden pay.
        function profileProperties(type, dims, kor) {
            const cw = korozyonPayi(kor, 'web');
            const cf = korozyonPayi(kor, 'flange');
            const kalan = (t, c) => Math.max(t - c, 0.5);   // 0,5 mm taban: kesit yok olmasin
            switch (String(type).toUpperCase()) {
                case 'HP': return bulbFlatProperties(dims.b, dims.t, cw);
                case 'FB': return flatBarProperties(dims.h, kalan(dims.t, cw));
                case 'T':  return teeProperties(dims.h, kalan(dims.tw, cw),
                                                dims.bf, kalan(dims.tf, cf));
                case 'L':  return angleProperties(dims.a, dims.b, kalan(dims.t, cw),
                                                  kalan(dims.tf !== undefined ? dims.tf : dims.t, cf));
                // Kutuda uc pay da dogrudan yerini bulur - .steel dosyasindaki
                // web/top/bottom uclusu zaten bu sekli tarif ediyor.
                case 'BOX': return boxProperties(dims.h, kalan(dims.tw, cw),
                                                 dims.ustW, kalan(dims.ustT, cf),
                                                 dims.altW, kalan(dims.altT, korozyonPayi(kor, 'plate')));
                default:   return null;
            }
        }

        // cm tabanli sonucu cozucunun bekledigi SI birimlerine cevirir.
        function profilePropertiesSI(props) {
            if (!props) return null;
            return {
                A: props.A * 1e-4,          // cm2 -> m2
                Aweb: props.Aweb * 1e-4,
                Aflange: (props.Aflange > 0 ? props.Aflange : props.Aweb) * 1e-4,
                Iy: props.Iy * 1e-8,        // cm4 -> m4
                Iz: props.Iz * 1e-8,
                J: props.J * 1e-8,
                Wt: (props.Wt > 0 ? props.Wt : 0) * 1e-6,   // cm3 -> m3
                Wy: props.Wy * 1e-6,        // cm3 -> m3
                WyTop: props.WyTop * 1e-6,
                WyBot: props.WyBot * 1e-6,
                Wz: props.Wz * 1e-6,
                h: props.height / 100,      // cm -> m
                tw: props.tw / 100,
                centroidY: props.centroidY / 100,
                // gosterim birimleri
                A_cm2: props.A, Iy_cm4: props.Iy, Iz_cm4: props.Iz, J_cm4: props.J,
                Wy_cm3: props.Wy, Wz_cm3: props.Wz,
                type: props.type,
                // kosebentlerde asal eksen uyarisi kesitle birlikte tasinir
                principalAngle: props.principalAngle,
                note: props.note
            };
        }

        // ---- Profil + etkin plaka (kompozit kesit) ----
        // Bu hesap yalnizca js/ui/sections.js icinde, DOM alanlarini okuyan bir
        // fonksiyonun ortasinda duruyordu; dogrulama testleri ayni matematigi
        // kopyalamak zorunda kalirdi ve iki kopya zamanla birbirinden ayrilir
        // (bu projede daha once tam olarak bu olmustu). Saf fonksiyon olarak
        // burada: girdisi profileProperties() ciktisi (cm tabanli) ve plaka
        // olculeri (mm), ciktisi cozucunun bekledigi SI kesit nesnesi.
        //
        // Konvansiyon: plaka USTTE, profil altta sarkar. y = 0 plakanin ust
        // yuzeyinde, asagi dogru pozitif.
        // plakaKorozyonMm: baglanti plakasindan dusulecek pay (mm). Profilin
        // kendi paylari profileProperties icinde uygulanir; burada yalnizca
        // plaka kalir - plaka genisligi DEGISMEZ, kurallar payi kalinliktan
        // duser.
        //
        // altPlaka (istege bagli): { w, t, kor } mm. Profilin OTEKI ucuna
        // oturan ikinci plaka. Lama + iki plaka = yigma I kirisi; CCL311
        // modelinde dort kesit grubu boyle kurulmus. Verilmezse hicbir sey
        // degismez - tek plakali hesap oldugu gibi kalir.
        function plakaliKesitSI(props, plakaGenislikMm, plakaKalinlikMm, plakaKorozyonMm, altPlaka) {
            if (!props) return null;
            const plakaPay = (typeof plakaKorozyonMm === 'number' && isFinite(plakaKorozyonMm)
                              && plakaKorozyonMm > 0) ? plakaKorozyonMm : 0;
            const plateWCm = plakaGenislikMm / 10;
            const plateTCm = Math.max(plakaKalinlikMm - plakaPay, 0.5) / 10;
            const plateArea = plateWCm * plateTCm;

            const altVar = !!(altPlaka && altPlaka.w > 0 && altPlaka.t > 0);
            const altWCm = altVar ? altPlaka.w / 10 : 0;
            const altTCm = altVar ? Math.max(altPlaka.t - (altPlaka.kor > 0 ? altPlaka.kor : 0), 0.5) / 10 : 0;
            const altArea = altWCm * altTCm;

            const totalArea = props.A + plateArea + altArea;

            const plateCentroidY = plateTCm / 2;
            // HP'de centroidY zaten USTTEN olculur (katalogdaki dx); diger
            // profillerde alttan.
            const profileCentroidY = (props.type === 'HP')
                ? plateTCm + props.centroidY
                : plateTCm + (props.height - props.centroidY);

            const totalHeight = plateTCm + props.height + altTCm;
            const altCentroidY = plateTCm + props.height + altTCm / 2;

            const combinedCentroidY =
                (plateArea * plateCentroidY + props.A * profileCentroidY
                 + altArea * altCentroidY) / totalArea;

            const d1 = plateCentroidY - combinedCentroidY;
            const d2 = profileCentroidY - combinedCentroidY;
            const d3 = altCentroidY - combinedCentroidY;
            const plateIxx = plateWCm * Math.pow(plateTCm, 3) / 12;
            const altIxx = altWCm * Math.pow(altTCm, 3) / 12;
            const combinedIxx = props.Iy + props.A * d2 * d2 + plateIxx + plateArea * d1 * d1
                              + altIxx + altArea * d3 * d3;

            const plateIyy = plateTCm * Math.pow(plateWCm, 3) / 12;
            const altIyy = altTCm * Math.pow(altWCm, 3) / 12;
            const combinedIyy = props.Iz + plateIyy + altIyy;

            const yTop = combinedCentroidY;                 // plaka ust yuzeyine
            const yBot = totalHeight - combinedCentroidY;   // profil alt ucuna
            const WxxTop = combinedIxx / yTop;
            const WxxBot = combinedIxx / yBot;
            const Wyy = combinedIyy / (Math.max(plateWCm, altWCm) / 2);

            const webThickCm = props.tw || 0;
            const J_cm4 = props.J + openJ([[plateWCm, plateTCm]])
                        + (altVar ? openJ([[altWCm, altTCm]]) : 0);

            return {
                // SI - cozucu icin
                A: totalArea * 1e-4,
                J: J_cm4 * 1e-8,
                Wt: J_cm4 / Math.max(plateTCm, webThickCm || plateTCm) * 1e-6,
                tw: webThickCm / 100,
                Aweb: (props.Aweb || props.A * 0.6) * 1e-4,     // plaka haric govde
                Aflange: plateArea * 1e-4,                      // yanal kesmeyi plaka tasir
                Iy: combinedIxx * 1e-8,
                Iz: combinedIyy * 1e-8,
                Wy: Math.min(WxxTop, WxxBot) * 1e-6,
                WyTop: WxxTop * 1e-6,
                WyBot: WxxBot * 1e-6,
                Wz: Wyy * 1e-6,
                h: totalHeight / 100,
                centroidY: combinedCentroidY / 100,
                // gosterim (cm)
                A_cm2: totalArea,
                Iy_cm4: combinedIxx,
                Iz_cm4: combinedIyy,
                Wy_cm3: Math.min(WxxTop, WxxBot),
                WyTop_cm3: WxxTop,
                WyBot_cm3: WxxBot,
                Wz_cm3: Wyy,
                J_cm4: J_cm4,
                // Disbukeylik yalnizca PLAKALI kesitlerde anlamli: dugumun
                // plaka hizasinda oldugu varsayimi buradan geliyor.
                isComposite: true,
                // Eleman ekseninin dugum cizgisinden otelenmesi.
                //
                // Dugum cizgisi plakanin ORTA duzlemi kabul edilir - takviyeli
                // panel boyle cizilir - ve acik kesitin kayma merkezi de orada
                // durur. Agirlik merkezi ise plaka ustunden combinedCentroidY
                // kadar asagida. Ikisinin farki egilme kolu:
                //   e = combinedCentroidY - plakaKalinligi/2
                // DNV 3D Beam vakasinda olculdu: bu kolla omurga momenti
                // hatasi %0.11, eksenel kuvvet 1967 N (DNV 1917 N).
                axisOffset: Math.max(0, (combinedCentroidY - plateTCm / 2) / 100)
            };
        }
