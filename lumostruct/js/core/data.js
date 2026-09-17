        // ============== DATA ==============

        // HP (bulb flat) katalogu - EN 10067
        //
        // 2026-09-14'te BUTUNUYLE YENILENDI. Onceki sutunlar tek bir kaynaktan
        // kopyalanmisti ve o kaynak yanlisti; uc olcut birden bunu gosterdi:
        //
        //   1) ALAN. EN 10067'nin kendi kutle sutunu alani belirler
        //      (A = kg/m / 0,785). Iki bagimsiz EN tablosu - Islas Global
        //      (Vigo) mill katalogu ve build-your-vision.eu - butun satirlarda
        //      birbiriyle ve kutleyle birebir uyusuyor. Eski sutun 36 satirin
        //      34'unde bunlardan sapiyordu, sapma boyla birlikte buyuyerek
        //      HP430x15'te %8,8'e ciriyordu.
        //
        //   2) ARTIS YASASI. Bir aile icinde bulb geometrisi (c, d, r) SABIT.
        //      Govde kalinligi t -> t+dt olunca eklenen malzeme tam olarak
        //      b x dt'lik bir serittir ve agirlik merkezi b/2'dedir. Bulbun
        //      sekli hic bilinmeden dogru olan bir bagintidir:
        //          A2 = A1 + b*dt
        //          dx2 = (A1*dx1 + b*dt*b/2) / A2
        //          I2  = I1 + A1*(dx1-dx2)^2 + dt*b^3/12 + b*dt*(b/2-dx2)^2
        //      EN alanlari bunu SON HANESINE kadar sagliyor. Eski dx sutunu
        //      saglamiyordu: eklenen malzemeyi b/2'ye degil 0,64-0,69 b'ye
        //      koyuyordu - fiziken imkansiz.
        //
        //   3) UCUNCU KAYNAK. SkyCiv/beamdimensions kesit veritabani (160..430)
        //      ayni yasayi dx'te 0,003 cm, Ixx'te %0,05 icinde sagliyor ve EN
        //      alanlariyla 45/45 uyusuyor. 160 altindaki aileler icin bulb
        //      modeli bu veriye uyduruldu; ELDE TUTMA sinamasinda (200..430'a
        //      uydurup 160 ve 180'i tahmin ederek) hata dx'te 0,018 cm,
        //      Ixx'te %0,16 cikti. Kucuk boyutlar ayrica bagimsiz bir dorduncu
        //      tabloyla dogrulandi (HP120x8: 164,7 vs yayimlanan 165;
        //      W = 164,7/6,99 = 23,6 cm3, yayimlanan 23,6).
        //
        // SONUC: Ixx butun katalogda %13-27 ARTTI. Yani bu tarihe kadar HP
        //   kesitler oldugundan esnek hesaplanmis. Kesit ozelligi degisen bir
        //   duzeltme oldugu icin eski modellerin sonuclari degisir.
        //
        // HP120x8 notu: bir onceki oturumda bu satiri "aile egilimini kiriyor"
        //   diye turetilmis degerlerle degistirmistim. Yanlismis - satir
        //   dogruydu, KOMSULARI yanlisti. Kendi turettigim referans, duzeltmeye
        //   calistigim tablonun kor noktasini tasiyordu.
        //
        // HP60 ailesi EN 10067'de YOK (en kucuk EN olcusu HP80x5); tek kaynakli.
        //
        // Dogrulama: tests/verify-hp-katalog.js
        const HP_CATALOG = [
            { name: "HP60x4", b: 60, t: 4, c: 13, r: 3.5, A: 3.58, dx: 3.48, Ixx: 13.2 },
            { name: "HP60x5", b: 60, t: 5, c: 13, r: 3.5, A: 4.18, dx: 3.41, Ixx: 15.12 },
            { name: "HP80x5", b: 80, t: 5, c: 14, r: 4, A: 5.41, dx: 4.96, Ixx: 33.36 },
            { name: "HP80x6", b: 80, t: 6, c: 14, r: 4, A: 6.21, dx: 4.84, Ixx: 38.27 },
            { name: "HP80x7", b: 80, t: 7, c: 14, r: 4, A: 7.01, dx: 4.74, Ixx: 43.04 },   // EN 10067'de yok; EN'li HP80x6'dan artis yasasiyla (bagimsiz tablo: 7.00 / 4.69 / 43.3)
            { name: "HP100x6", b: 100, t: 6, c: 15.5, r: 4.5, A: 7.74, dx: 6.03, Ixx: 75.87 },
            { name: "HP100x7", b: 100, t: 7, c: 15.5, r: 4.5, A: 8.74, dx: 5.91, Ixx: 85.14 },
            { name: "HP100x8", b: 100, t: 8, c: 15.5, r: 4.5, A: 9.74, dx: 5.82, Ixx: 94.22 },
            { name: "HP120x6", b: 120, t: 6, c: 17, r: 5, A: 9.32, dx: 7.25, Ixx: 132.9 },
            { name: "HP120x7", b: 120, t: 7, c: 17, r: 5, A: 10.52, dx: 7.11, Ixx: 149 },
            { name: "HP120x8", b: 120, t: 8, c: 17, r: 5, A: 11.72, dx: 6.99, Ixx: 164.7 },
            { name: "HP140x7", b: 140, t: 7, c: 19, r: 5.5, A: 12.43, dx: 8.35, Ixx: 241.2 },
            { name: "HP140x8", b: 140, t: 8, c: 19, r: 5.5, A: 13.83, dx: 8.21, Ixx: 266.3 },
            { name: "HP140x9", b: 140, t: 9, c: 19, r: 5.5, A: 15.2, dx: 8.09, Ixx: 290.3 },
            { name: "HP140x10", b: 140, t: 10, c: 19, r: 5.5, A: 16.63, dx: 8.01, Ixx: 315.5 },
            { name: "HP160x7", b: 160, t: 7, c: 22, r: 6, A: 14.6, dx: 9.67, Ixx: 371.1 },
            { name: "HP160x8", b: 160, t: 8, c: 22, r: 6, A: 16.2, dx: 9.51, Ixx: 409.3 },
            { name: "HP160x9", b: 160, t: 9, c: 22, r: 6, A: 17.8, dx: 9.37, Ixx: 446.7 },
            { name: "HP160x10", b: 160, t: 10, c: 22, r: 6, A: 19.34, dx: 9.26, Ixx: 481.3 },
            { name: "HP160x11", b: 160, t: 11, c: 22, r: 6, A: 21, dx: 9.17, Ixx: 517.8 },
            { name: "HP160x11.5", b: 160, t: 11.5, c: 22, r: 6, A: 21.74, dx: 9.13, Ixx: 535.9 },
            { name: "HP180x8", b: 180, t: 8, c: 25, r: 7, A: 18.86, dx: 10.9, Ixx: 606.6 },
            { name: "HP180x9", b: 180, t: 9, c: 25, r: 7, A: 20.66, dx: 10.74, Ixx: 661.1 },
            { name: "HP180x10", b: 180, t: 10, c: 25, r: 7, A: 22.46, dx: 10.6, Ixx: 711.7 },
            { name: "HP180x11", b: 180, t: 11, c: 25, r: 7, A: 24.26, dx: 10.48, Ixx: 764.6 },
            { name: "HP180x11.5", b: 180, t: 11.5, c: 25, r: 7, A: 25.1, dx: 10.43, Ixx: 790.8 },
            { name: "HP200x8.5", b: 200, t: 8.5, c: 28, r: 8, A: 22.63, dx: 12.22, Ixx: 901.1 },
            { name: "HP200x9", b: 200, t: 9, c: 28, r: 8, A: 23.66, dx: 12.13, Ixx: 939.1 },
            { name: "HP200x10", b: 200, t: 10, c: 28, r: 8, A: 25.66, dx: 11.97, Ixx: 1010 },
            { name: "HP200x11", b: 200, t: 11, c: 28, r: 8, A: 27.66, dx: 11.83, Ixx: 1084 },
            { name: "HP200x11.5", b: 200, t: 11.5, c: 28, r: 8, A: 28.6, dx: 11.76, Ixx: 1121 },
            { name: "HP200x12", b: 200, t: 12, c: 28, r: 8, A: 29.66, dx: 11.7, Ixx: 1157 },
            { name: "HP220x9", b: 220, t: 9, c: 31, r: 9, A: 26.78, dx: 13.55, Ixx: 1290 },
            { name: "HP220x10", b: 220, t: 10, c: 31, r: 9, A: 29, dx: 13.37, Ixx: 1388 },
            { name: "HP220x11", b: 220, t: 11, c: 31, r: 9, A: 31.2, dx: 13.2, Ixx: 1488 },
            { name: "HP220x11.5", b: 220, t: 11.5, c: 31, r: 9, A: 32.24, dx: 13.12, Ixx: 1538 },
            { name: "HP220x12", b: 220, t: 12, c: 31, r: 9, A: 33.4, dx: 13.05, Ixx: 1587 },
            { name: "HP240x9.5", b: 240, t: 9.5, c: 34, r: 10, A: 31.23, dx: 14.89, Ixx: 1787 },
            { name: "HP240x10", b: 240, t: 10, c: 34, r: 10, A: 32.49, dx: 14.79, Ixx: 1855 },
            { name: "HP240x10.5", b: 240, t: 10.5, c: 34, r: 10, A: 33.63, dx: 14.69, Ixx: 1921 },
            { name: "HP240x11", b: 240, t: 11, c: 34, r: 10, A: 34.89, dx: 14.59, Ixx: 1987 },
            { name: "HP240x11.5", b: 240, t: 11.5, c: 34, r: 10, A: 36.03, dx: 14.51, Ixx: 2053 },
            { name: "HP240x12", b: 240, t: 12, c: 34, r: 10, A: 37.29, dx: 14.43, Ixx: 2118 },
            { name: "HP260x10", b: 260, t: 10, c: 37, r: 11, A: 36.11, dx: 16.23, Ixx: 2422 },
            { name: "HP260x11", b: 260, t: 11, c: 37, r: 11, A: 38.71, dx: 16.01, Ixx: 2593 },
            { name: "HP260x12", b: 260, t: 12, c: 37, r: 11, A: 41.31, dx: 15.82, Ixx: 2762 },
            { name: "HP260x13", b: 260, t: 13, c: 37, r: 11, A: 43.85, dx: 15.65, Ixx: 2928 },
            { name: "HP280x10.5", b: 280, t: 10.5, c: 40, r: 12, A: 41.22, dx: 17.57, Ixx: 3210 },
            { name: "HP280x11", b: 280, t: 11, c: 40, r: 12, A: 42.68, dx: 17.45, Ixx: 3319 },
            { name: "HP280x12", b: 280, t: 12, c: 40, r: 12, A: 45.48, dx: 17.24, Ixx: 3533 },
            { name: "HP280x13", b: 280, t: 13, c: 40, r: 12, A: 48.28, dx: 17.05, Ixx: 3744 },
            { name: "HP300x11", b: 300, t: 11, c: 43, r: 13, A: 46.75, dx: 18.91, Ixx: 4175 },
            { name: "HP300x12", b: 300, t: 12, c: 43, r: 13, A: 49.79, dx: 18.67, Ixx: 4443 },
            { name: "HP300x13", b: 300, t: 13, c: 43, r: 13, A: 52.79, dx: 18.46, Ixx: 4707 },
            { name: "HP320x11.5", b: 320, t: 11.5, c: 46, r: 14, A: 52.59, dx: 20.25, Ixx: 5342 },
            { name: "HP320x12", b: 320, t: 12, c: 46, r: 14, A: 54.25, dx: 20.13, Ixx: 5507 },
            { name: "HP320x12.5", b: 320, t: 12.5, c: 46, r: 14, A: 55.79, dx: 20.01, Ixx: 5670 },
            { name: "HP320x13", b: 320, t: 13, c: 46, r: 14, A: 57.45, dx: 19.9, Ixx: 5831 },
            { name: "HP320x13.5", b: 320, t: 13.5, c: 46, r: 14, A: 58.94, dx: 19.8, Ixx: 5978 },
            { name: "HP320x14", b: 320, t: 14, c: 46, r: 14, A: 60.64, dx: 19.7, Ixx: 6137 },
            { name: "HP340x12", b: 340, t: 12, c: 49, r: 15, A: 58.84, dx: 21.6, Ixx: 6736 },
            { name: "HP340x12.5", b: 340, t: 12.5, c: 49, r: 15, A: 60.48, dx: 21.47, Ixx: 6935 },
            { name: "HP340x13", b: 340, t: 13, c: 49, r: 15, A: 62.24, dx: 21.35, Ixx: 7132 },
            { name: "HP340x14", b: 340, t: 14, c: 49, r: 15, A: 65.61, dx: 21.13, Ixx: 7504 },
            { name: "HP340x15", b: 340, t: 15, c: 49, r: 15, A: 68.94, dx: 20.92, Ixx: 7887 },
            { name: "HP370x12.5", b: 370, t: 12.5, c: 53.5, r: 16.5, A: 67.79, dx: 23.69, Ixx: 9185 },
            { name: "HP370x13", b: 370, t: 13, c: 53.5, r: 16.5, A: 69.7, dx: 23.55, Ixx: 9444 },
            { name: "HP370x14", b: 370, t: 14, c: 53.5, r: 16.5, A: 73.4, dx: 23.3, Ixx: 9937 },
            { name: "HP370x15", b: 370, t: 15, c: 53.5, r: 16.5, A: 77.07, dx: 23.07, Ixx: 10440 },
            { name: "HP370x16", b: 370, t: 16, c: 53.5, r: 16.5, A: 80.7, dx: 22.86, Ixx: 10936 },
            { name: "HP400x13", b: 400, t: 13, c: 58, r: 18, A: 77.43, dx: 25.79, Ixx: 12235 },
            { name: "HP400x14", b: 400, t: 14, c: 58, r: 18, A: 81.48, dx: 25.51, Ixx: 12873 },
            { name: "HP400x15", b: 400, t: 15, c: 58, r: 18, A: 85.48, dx: 25.25, Ixx: 13522 },
            { name: "HP400x16", b: 400, t: 16, c: 58, r: 18, A: 89.43, dx: 25.02, Ixx: 14161 },
            { name: "HP430x14", b: 430, t: 14, c: 62.5, r: 19.5, A: 89.94, dx: 27.75, Ixx: 16367 },
            { name: "HP430x15", b: 430, t: 15, c: 62.5, r: 19.5, A: 94.14, dx: 27.46, Ixx: 17189 },
            { name: "HP430x17", b: 430, t: 17, c: 62.5, r: 19.5, A: 102.79, dx: 26.96, Ixx: 18794 },
            { name: "HP430x18", b: 430, t: 18, c: 62.5, r: 19.5, A: 106.98, dx: 26.74, Ixx: 19580 },
            { name: "HP430x19", b: 430, t: 19, c: 62.5, r: 19.5, A: 111.34, dx: 26.54, Ixx: 20356 },
            { name: "HP430x20", b: 430, t: 20, c: 62.5, r: 19.5, A: 115.67, dx: 26.35, Ixx: 21124 },
        ];
        
        // L-Angle Catalog (Equal Angles) - EN 10056
        const L_CATALOG = [
            { name: "L50x50x5", a: 50, b: 50, t: 5, A: 4.80, Ixx: 11.0 },
            { name: "L50x50x6", a: 50, b: 50, t: 6, A: 5.69, Ixx: 12.8 },
            { name: "L60x60x6", a: 60, b: 60, t: 6, A: 6.91, Ixx: 22.8 },
            { name: "L60x60x8", a: 60, b: 60, t: 8, A: 9.03, Ixx: 28.9 },
            { name: "L70x70x7", a: 70, b: 70, t: 7, A: 9.40, Ixx: 42.3 },
            { name: "L75x75x8", a: 75, b: 75, t: 8, A: 11.5, Ixx: 58.9 },
            { name: "L80x80x8", a: 80, b: 80, t: 8, A: 12.3, Ixx: 72.2 },
            { name: "L80x80x10", a: 80, b: 80, t: 10, A: 15.1, Ixx: 87.5 },
            { name: "L90x90x9", a: 90, b: 90, t: 9, A: 15.5, Ixx: 110 },
            { name: "L100x100x10", a: 100, b: 100, t: 10, A: 19.2, Ixx: 168 },
            { name: "L100x100x12", a: 100, b: 100, t: 12, A: 22.7, Ixx: 196 },
            { name: "L120x120x10", a: 120, b: 120, t: 10, A: 23.2, Ixx: 298 },
            { name: "L120x120x12", a: 120, b: 120, t: 12, A: 27.5, Ixx: 350 },
            { name: "L150x150x12", a: 150, b: 150, t: 12, A: 34.8, Ixx: 705 },
            { name: "L150x150x15", a: 150, b: 150, t: 15, A: 43.0, Ixx: 860 }
        ];
        
        // T-Section Catalog (Welded T)
        const T_CATALOG = [
            { name: "T80x80x8x8", h: 80, bf: 80, tw: 8, tf: 8, A: 12.2, Ixx: 46.0 },
            { name: "T100x100x10x10", h: 100, bf: 100, tw: 10, tf: 10, A: 19.0, Ixx: 113 },
            { name: "T120x100x10x10", h: 120, bf: 100, tw: 10, tf: 10, A: 21.0, Ixx: 185 },
            { name: "T120x120x10x12", h: 120, bf: 120, tw: 10, tf: 12, A: 26.4, Ixx: 220 },
            { name: "T150x100x10x12", h: 150, bf: 100, tw: 10, tf: 12, A: 26.2, Ixx: 428 },
            { name: "T150x150x10x12", h: 150, bf: 150, tw: 10, tf: 12, A: 31.8, Ixx: 511 },
            { name: "T180x100x10x12", h: 180, bf: 100, tw: 10, tf: 12, A: 29.2, Ixx: 728 },
            { name: "T200x100x10x12", h: 200, bf: 100, tw: 10, tf: 12, A: 31.2, Ixx: 987 },
            { name: "T200x150x12x15", h: 200, bf: 150, tw: 12, tf: 15, A: 44.7, Ixx: 1280 },
            { name: "T250x150x12x15", h: 250, bf: 150, tw: 12, tf: 15, A: 50.7, Ixx: 2250 }
        ];
        
        // Flat Bar Catalog - Common Sizes
        const FB_CATALOG = [
            { name: "FB50x6", h: 50, t: 6 },
            { name: "FB60x6", h: 60, t: 6 },
            { name: "FB60x8", h: 60, t: 8 },
            { name: "FB75x8", h: 75, t: 8 },
            { name: "FB80x8", h: 80, t: 8 },
            { name: "FB80x10", h: 80, t: 10 },
            { name: "FB100x8", h: 100, t: 8 },
            { name: "FB100x10", h: 100, t: 10 },
            { name: "FB100x12", h: 100, t: 12 },
            { name: "FB120x10", h: 120, t: 10 },
            { name: "FB120x12", h: 120, t: 12 },
            { name: "FB150x10", h: 150, t: 10 },
            { name: "FB150x12", h: 150, t: 12 },
            { name: "FB150x15", h: 150, t: 15 },
            { name: "FB200x12", h: 200, t: 12 },
            { name: "FB200x15", h: 200, t: 15 },
            { name: "FB200x20", h: 200, t: 20 },
            { name: "FB250x15", h: 250, t: 15 },
            { name: "FB250x20", h: 250, t: 20 }
        ];
        
        // Boru (CHS) katalogu - EN 10220 yaygin dis cap x et kalinligi (mm).
        // Boruya ekli plaka OLMAZ: kullanicinin sozu ("pipe attached plate
        // olmaz"); arayuz de PIPE secilince plakayi kapatir.
        const PIPE_CATALOG = [
            { name: 'PIPE48.3x3.2',  d: 48.3,  t: 3.2 },
            { name: 'PIPE60.3x3.6',  d: 60.3,  t: 3.6 },
            { name: 'PIPE76.1x3.6',  d: 76.1,  t: 3.6 },
            { name: 'PIPE88.9x4',    d: 88.9,  t: 4 },
            { name: 'PIPE114.3x4.5', d: 114.3, t: 4.5 },
            { name: 'PIPE139.7x5',   d: 139.7, t: 5 },
            { name: 'PIPE168.3x5.6', d: 168.3, t: 5.6 },
            { name: 'PIPE219.1x6.3', d: 219.1, t: 6.3 },
            { name: 'PIPE273x6.3',   d: 273,   t: 6.3 },
            { name: 'PIPE323.9x8',   d: 323.9, t: 8 },
            { name: 'PIPE355.6x8',   d: 355.6, t: 8 },
            { name: 'PIPE406.4x10',  d: 406.4, t: 10 },
            { name: 'PIPE457x10',    d: 457,   t: 10 },
            { name: 'PIPE508x12.5',  d: 508,   t: 12.5 },
            { name: 'PIPE610x12.5',  d: 610,   t: 12.5 }
        ];

        // Created Sections (starts empty, user adds profiles)
        const SECTIONS = {};

        // ---- RIJIT kesit ----
        // Profil secilmemis kiris rijit sayilir; kullanici isterse acikca
        // 'RIGID' de secer. SECTIONS'a KONMAZ: kutuphane sayaci, profil
        // listesi, agirlik ve oz agirlik onu saymamali. Cozucu kesidi
        // kesitBul() ile alir; SECTIONS'ta yoksa ve ad bos ya da RIGID ise
        // bu nesne doner.
        //
        // Buyukluk: tipik HP kirisinin (Iy ~1e-5..1e-4 m4, A ~2e-3..1e-2)
        // 1000-5000 kati. Daha buyugu rijitlik matrisinin kosulunu bozup
        // sayisal gurultu uretir, daha kucugu "rijit" olmaz. Gerilme
        // hesaplanmaz (rigid: true; fem.js sifir yazar), kutle yok.
        const RIGID_KESIT_ADI = 'RIGID';
        const RIGID_KESIT = Object.freeze({
            rigid: true, profileName: RIGID_KESIT_ADI, type: 'RIGID',
            A: 0.5, Iy: 0.05, Iz: 0.05, J: 0.1,
            Wy: 1, Wz: 1, Aweb: 0.5, Aflange: 0.5, h: 0.2, tw: 0.05
        });
        function kesitRijitMi(ad) {
            return !ad || ad === RIGID_KESIT_ADI;
        }
        function kesitBul(ad) {
            if (ad && SECTIONS[ad]) return SECTIONS[ad];
            if (kesitRijitMi(ad)) return RIGID_KESIT;
            return null;
        }
        // Kesit turu: HP / FB / T / L / RIGID / default. Renk ve simge bundan.
        function kesitTuru(ad) {
            if (kesitRijitMi(ad)) return 'RIGID';
            const s = SECTIONS[ad];
            if (s && s.type && /^(HP|FB|T|L|PIPE)$/.test(s.type)) return s.type;
            const m = String(ad).match(/^(HP|FB|PIPE|T|L)(?=[\d_x×\s]|$)/i);
            return m ? m[1].toUpperCase() : 'default';
        }
        
        // Current profile type being edited
        let currentProfileType = 'HP';
        
        // Safe DOM access helpers
        const $ = (id) => document.getElementById(id);
        const setStyle = (id, prop, val) => { const el = $(id); if (el) el.style[prop] = val; };
        const setText = (id, val) => { const el = $(id); if (el) el.textContent = val; };
        const setHtml = (id, val) => { const el = $(id); if (el) el.innerHTML = val; };
        const setChecked = (id, val) => { const el = $(id); if (el) el.checked = val; };
        const setValue = (id, val) => { const el = $(id); if (el) el.value = val; };
        const getChecked = (id) => { const el = $(id); return el ? el.checked : false; };
        
        // Kayma modulu ELLE YAZILMAZ. Izotrop malzemede G = E / (2(1+v)) ve
        // celik icin v = 0,3 -> 80,769 GPa. Eskiden dort satirin dordunde de
        // 80.77e9 yaziliydi; E'yi degistiren biri G'yi degistirmeyi unutunca
        // model sessizce tutarsiz bir malzemeye gecerdi (ve sonuc "makul"
        // gorunecegi icin kimse fark etmezdi - bu dosyada bunun bir ornegi
        // zaten yasandi, bkz. HP katalogu).
        function celik(E, akma, v) {
            const nu = (typeof v === 'number') ? v : 0.3;
            return { E: E, nu: nu, G: E / (2 * (1 + nu)), yield: akma };
        }

        const MATERIALS = {
            'A':    celik(210e9, 235e6),
            'AH32': celik(210e9, 315e6),
            'AH36': celik(210e9, 355e6),
            'DH36': celik(210e9, 355e6)
        };

        // Bir elemanin malzemesi. Kirise ayri bir sinif atanmissa O gecerli;
        // yoksa modelin genel secimi.
        //
        // Arayuz kiris basina sinif atamaya izin veriyor (sag panel) ve atanan
        // sinifi gosteriyordu, ama cozucu onu OKUMUYORDU: her eleman genel
        // acilir listenin sinifiyla cozuluyordu. Bugun dort sinifin da E ve G
        // degeri ayni oldugu icin rijitlik degismiyor - ama akma gerilmesi
        // degisiyor, ve farkli E'li bir malzeme eklendigi gun sessizce yanlis
        // olurdu. Atanan girdi ya okunur ya da hic sorulmaz.
        function elemanMalzemesi(elem, genel) {
            const m = (elem && elem.grade) ? MATERIALS[elem.grade] : null;
            return m || genel;
        }

        // Modelde kac farkli celik sinifi var? Genel ayarlar (akma sinirlari,
        // gerilme lejandi) model geneli oldugu icin, karisik modelde bunu
        // soylemek gerekiyor.
        function kullanilanSiniflar(genelSinif) {
            const k = new Set();
            if (typeof model !== 'undefined' && model.elements) {
                Object.values(model.elements).forEach(e => k.add(e.grade || genelSinif));
            }
            k.delete(undefined);
            return [...k];
        }
        
        // ============== DEBUG FLAG ==============
        const DEBUG = false; // Set to true for development logging
        
        function debugLog(...args) {
            if (DEBUG) console.log(...args);
        }
        function debugWarn(...args) {
            if (DEBUG) console.warn(...args);
        }
        function debugError(...args) {
            if (DEBUG) console.error(...args);
        }
        
        // ============== DOM ELEMENT CACHE ==============
        // Cache frequently accessed DOM elements for better performance
        const DOM = {
            // Will be populated on init
        };
        
        function initDOMCache() {
            DOM.canvas = document.getElementById('canvas');
            DOM.canvas3d = document.getElementById('canvas3d');
            DOM.modelSummary = document.getElementById('modelSummary');
            DOM.nodeCount = document.getElementById('nodeCount');
            DOM.elementCount = document.getElementById('elementCount');
            DOM.constraintCount = document.getElementById('constraintCount');
            DOM.loadCount = document.getElementById('loadCount');
            DOM.resultsPanel = document.getElementById('resultsPanel');
            DOM.noResults = document.getElementById('noResults');
            DOM.stressLegend = document.getElementById('stressLegend');
            DOM.entityInfoPanel = document.getElementById('entityInfoPanel');
            DOM.entityInfoEmpty = document.getElementById('entityInfoEmpty');
            DOM.entityInfoNode = document.getElementById('entityInfoNode');
            DOM.entityInfoBeam = document.getElementById('entityInfoBeam');
            DOM.entityInfoMulti = document.getElementById('entityInfoMulti');
            DOM.commandLine = document.getElementById('commandLine');
            DOM.confirmModal = document.getElementById('confirmModal');
            DOM.contextMenu = document.getElementById('contextMenu');
            DOM.coordDisplay = document.getElementById('coordDisplay');
            DOM.sigmaLimit = document.getElementById('sigmaLimit');
        }
        
        // ============== EVENT LISTENER MANAGER ==============
        // Track event listeners for proper cleanup
        const eventListeners = [];
        
        function addManagedEventListener(element, event, handler, options) {
            if (!element) return;
            element.addEventListener(event, handler, options);
            eventListeners.push({ element, event, handler, options });
        }
        
        function removeAllManagedEventListeners() {
            eventListeners.forEach(({ element, event, handler, options }) => {
                if (element) {
                    element.removeEventListener(event, handler, options);
                }
            });
            eventListeners.length = 0;
        }
        
        // ============== MEMORY MANAGEMENT ==============
        // Clean up Three.js objects to prevent memory leaks
        function disposeThreeObject(obj) {
            if (!obj) return;
            
            if (obj.geometry) {
                obj.geometry.dispose();
            }
            if (obj.material) {
                if (Array.isArray(obj.material)) {
                    obj.material.forEach(m => {
                        if (m.map) m.map.dispose();
                        m.dispose();
                    });
                } else {
                    if (obj.material.map) obj.material.map.dispose();
                    obj.material.dispose();
                }
            }
            if (obj.children) {
                obj.children.forEach(child => disposeThreeObject(child));
            }
        }
        
        function clearThreeScene() {
            if (!threeScene) return;
            
            // Dispose all objects except lights and camera
            const toRemove = [];
            threeScene.traverse(obj => {
                if (obj.userData && obj.userData.isModelObject) {
                    toRemove.push(obj);
                }
            });
            
            toRemove.forEach(obj => {
                disposeThreeObject(obj);
                threeScene.remove(obj);
            });
        }
        
        // ============== UTILITY FUNCTIONS ==============
        
        // Safe JSON parse with fallback
        function safeJsonParse(str, fallback = null) {
            try {
                return JSON.parse(str);
            } catch (e) {
                debugError('JSON parse error:', e);
                return fallback;
            }
        }
        
        // Safe toFixed that handles NaN/Infinity
        function safeToFixed(num, decimals = 2) {
            if (num === null || num === undefined || isNaN(num) || !isFinite(num)) {
                return '0';
            }
            return Number(num).toFixed(decimals);
        }
        
        // Safe number parsing with default
        function safeParseFloat(str, defaultVal = 0) {
            const num = parseFloat(str);
            return isNaN(num) ? defaultVal : num;
        }
        
        function safeParseInt(str, defaultVal = 0) {
            const num = parseInt(str, 10);
            return isNaN(num) ? defaultVal : num;
        }
        
        // Safe array access
        function safeArrayGet(arr, index, defaultVal = null) {
            if (!Array.isArray(arr) || index < 0 || index >= arr.length) {
                return defaultVal;
            }
            return arr[index];
        }
        
        // Safe object property access
        function safeGet(obj, path, defaultVal = null) {
            if (!obj) return defaultVal;
            const keys = path.split('.');
            let result = obj;
            for (const key of keys) {
                if (result === null || result === undefined) return defaultVal;
                result = result[key];
            }
            return result !== undefined ? result : defaultVal;
        }
        
        // Clamp number to range
        function clamp(num, min, max) {
            return Math.max(min, Math.min(max, num));
        }
        
        // Safe division (prevents NaN/Infinity)
        function safeDivide(a, b, defaultVal = 0) {
            if (b === 0 || isNaN(b) || !isFinite(b)) return defaultVal;
            const result = a / b;
            return isNaN(result) || !isFinite(result) ? defaultVal : result;
        }
        
        // Validate model structure
        // Yuklenen/geri alinan bir modelin SEKLI dogru mu. Adi eskiden validateModel'di
        // ve solver.js'teki ayni adli muhendislik kontrolu tarafindan eziliyordu:
        // ayni global kapsam, sonra yuklenen kazanir. Sonucta dosya dogrulamasi hep
        // truthy bir nesne alip her JSON'u kabul ediyordu.
        function isValidModelData(m) {
            if (!m) return false;
            if (!m.nodes || typeof m.nodes !== 'object') return false;
            if (!m.elements || typeof m.elements !== 'object') return false;
            if (!m.constraints || typeof m.constraints !== 'object') return false;
            if (!Array.isArray(m.loads)) return false;
            return true;
        }
        
        let model = {
            nodes: {},
            elements: {},
            constraints: {},
            loads: [],
            pressure: []
        };
        
