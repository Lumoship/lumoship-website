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

        // Bulb flat: govde + bulb. Bulb, esit alanli bir daire olarak modelleniyor -
        // katalogdaki genislikle (c) tutarli cikan, savunulabilir bir yaklasim.
        // HP200x10 icin Iz = 4.03 cm4 verir; yayinlanmis deger 3.2-4 cm4 araligindadir.
        function bulbFlatProperties(bMM, tMM) {
            const B = bMM / 10, T = tMM / 10;                     // cm
            const cat = (typeof HP_CATALOG !== 'undefined')
                ? HP_CATALOG.find(hp => hp.b === bMM && hp.t === tMM) : null;

            const A = cat ? cat.A : B * T * 1.2;                  // cm2
            const Iy = cat ? cat.Ixx : T * Math.pow(B, 3) / 12 * 1.3;
            const centroidY = cat ? cat.dx : B / 2;               // cm, bulb ucundan
            const Aweb = B * T;                                   // duz govde

            let d = Math.sqrt(Math.max(A - Aweb, 0) * 4 / Math.PI);   // esdeger bulb capi
            if (!(d > T)) d = T;                                      // bulbsuz/dejenere hal

            const webW = Math.max(B - d, 0);
            const Iz = webW * Math.pow(T, 3) / 12 + Math.PI * Math.pow(d, 4) / 64;

            const yTop = centroidY, yBot = Math.max(B - centroidY, 1e-9);
            return {
                type: 'HP', A: A, Aweb: Aweb, Iy: Iy, Iz: Iz,
                J: openJ([[webW, T]]) + Math.PI * Math.pow(d, 4) / 32,
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
                type: 'FB', A: A, Aweb: A, Iy: Iy, Iz: Iz, J: openJ([[H, T]]),
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
                type: 'T', A: A, Aweb: Aw, Iy: Iy, Iz: Iz, J: openJ([[BF, TF], [H, TW]]),
                Wy: Iy / Math.max(yTop, yBot), WyTop: Iy / yTop, WyBot: Iy / yBot,
                Wz: Iz / (BF / 2),                     // en genis boyutun yarisi
                height: total, tw: TW, centroidY: c
            };
        }

        // Kose: dusey kol a, yatay kol b, kalinlik t.
        function angleProperties(aMM, bMM, tMM) {
            const A_ = aMM / 10, B_ = bMM / 10, T = tMM / 10;
            const A1 = A_ * T, A2 = Math.max(B_ - T, 0) * T;
            const A = A1 + A2;

            const y1 = A_ / 2, y2 = T / 2;
            const cy = (A1 * y1 + A2 * y2) / A;
            const Iy = T * Math.pow(A_, 3) / 12 + A1 * Math.pow(y1 - cy, 2) +
                       Math.max(B_ - T, 0) * Math.pow(T, 3) / 12 + A2 * Math.pow(y2 - cy, 2);

            const x1 = T / 2, x2 = T + Math.max(B_ - T, 0) / 2;
            const cx = (A1 * x1 + A2 * x2) / A;
            const Iz = A_ * Math.pow(T, 3) / 12 + A1 * Math.pow(x1 - cx, 2) +
                       T * Math.pow(Math.max(B_ - T, 0), 3) / 12 + A2 * Math.pow(x2 - cx, 2);

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
                type: 'L', A: A, Aweb: A1, Iy: Iy, Iz: Iz,
                Ixy: Ixy,
                principalAngle: principalAngle,
                note: Math.abs(principalAngle) > 1
                    ? 'Geometric axes; principal axes rotated ' +
                      Math.abs(principalAngle).toFixed(1) + ' deg'
                    : null,
                J: openJ([[A_, T], [Math.max(B_ - T, 0), T]]),
                Wy: Iy / Math.max(yTop, yBot), WyTop: Iy / yTop, WyBot: Iy / yBot,
                Wz: Iz / Math.max(cx, B_ - cx),
                height: A_, tw: T, centroidY: cy
            };
        }

        // Ortak giris. dims mm cinsinden.
        function profileProperties(type, dims) {
            switch (String(type).toUpperCase()) {
                case 'HP': return bulbFlatProperties(dims.b, dims.t);
                case 'FB': return flatBarProperties(dims.h, dims.t);
                case 'T':  return teeProperties(dims.h, dims.tw, dims.bf, dims.tf);
                case 'L':  return angleProperties(dims.a, dims.b, dims.t);
                default:   return null;
            }
        }

        // cm tabanli sonucu cozucunun bekledigi SI birimlerine cevirir.
        function profilePropertiesSI(props) {
            if (!props) return null;
            return {
                A: props.A * 1e-4,          // cm2 -> m2
                Aweb: props.Aweb * 1e-4,
                Iy: props.Iy * 1e-8,        // cm4 -> m4
                Iz: props.Iz * 1e-8,
                J: props.J * 1e-8,
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
