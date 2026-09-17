        // ============== ELEMAN (PILAR) BURKULMA KONTROLU ==============
        //
        // DNV 3D Beam'de "Code" ve "Pillar buckling" sekmeleri var: burkulma
        // boyu carpanlari, akma, malzeme faktoru, kullanim orani. LumoStruct
        // yalnizca LEVHA narinligini (hw/tw) kontrol ediyor, elemanin kendisinin
        // burkulmasina bakmiyordu; sonuc panelinde "member buckling is NOT
        // checked" yaziyordu. Bu dosya o boslugu kapatir.
        //
        // Yontem: EN 1993-1-1 madde 6.3.1, egilmeli (fleksural) burkulma.
        //   Ncr    = pi^2 E I / Lcr^2           (Lcr = K L, iki eksen icin ayri)
        //   lambda = sqrt(A fy / Ncr)
        //   Phi    = 0.5 [1 + alpha (lambda - 0.2) + lambda^2]
        //   chi    = 1 / (Phi + sqrt(Phi^2 - lambda^2))  <= 1
        //   Nb,Rd  = chi A fy / gammaM1
        //   UF     = |N| / Nb,Rd                 (yalnizca BASINC; cekmede 0)
        // DNV RU-SHIP Pt.3 Ch.8 pilar kontrolu de ayni Euler + egri
        // mantigiyla yurur; kullanici "Pillar" sekmesindeki alanlarin
        // karsiligini burada bulur. Egilme + eksenel etkilesimi (6.3.3)
        // YOK: bu bir pilar/kolon kontrolu, sonuc tablosunda oyle yazar.
        //
        // Kusur katsayisi alpha: kesit turune gore EN 1993-1-1 tablo 6.2.
        //   boru (sicak) a = 0.21; lama/bulb/T/L (kaynakli, kalin) c = 0.49.
        //   Kullanici isterse elemana kendi egrisini verir (elem.burkulmaEgrisi).
        // Burkulma boyu carpanlari elem.kY / elem.kZ (varsayilan 1: iki ucu
        // mafsalli). Malzeme faktoru gammaM1 Settings'ten (varsayilan 1.0;
        // DNV "material factor" 1.15 ister, kullanici secer).

        const BURKULMA_EGRILERI = { a0: 0.13, a: 0.21, b: 0.34, c: 0.49, d: 0.76 };

        function burkulmaEgrisi(elem, sec) {
            if (elem && elem.burkulmaEgrisi && BURKULMA_EGRILERI[elem.burkulmaEgrisi] !== undefined) return elem.burkulmaEgrisi;
            const tur = (typeof kesitTuru === 'function') ? kesitTuru(elem && elem.section) : (sec && sec.type) || 'default';
            return tur === 'PIPE' ? 'a' : 'c';
        }

        function burkulmaKi(lambda, alpha) {
            if (lambda <= 0.2) return 1;
            const Phi = 0.5 * (1 + alpha * (lambda - 0.2) + lambda * lambda);
            const kok = Math.sqrt(Math.max(Phi * Phi - lambda * lambda, 0));
            return Math.min(1, 1 / (Phi + kok));
        }

        // Tek eleman. N_kN: eksenel kuvvet (kN, cekme +). Donus null: kontrol
        // yapilamadi (rijit, kesitsiz, sifir boy).
        function elemanBurkulma(elem, sec, mat, L, N_kN, gammaM1) {
            if (!sec || sec.rigid || !(sec.A > 0) || !(sec.Iy > 0) || !(sec.Iz > 0) || !(L > 0)) return null;
            const E = mat.E, fy = mat.yield;
            const g = (gammaM1 > 0) ? gammaM1 : 1;
            const kY = (elem.kY > 0) ? elem.kY : 1, kZ = (elem.kZ > 0) ? elem.kZ : 1;
            const egri = burkulmaEgrisi(elem, sec);
            const alpha = BURKULMA_EGRILERI[egri];
            const eksen = (I, K) => {
                const Lcr = K * L;
                const Ncr = Math.PI * Math.PI * E * I / (Lcr * Lcr);
                const lambda = Math.sqrt(sec.A * fy / Ncr);
                const chi = burkulmaKi(lambda, alpha);
                return { Lcr: Lcr, Ncr: Ncr, lambda: lambda, chi: chi, NbRd: chi * sec.A * fy / g };
            };
            const y = eksen(sec.Iy, kY), z = eksen(sec.Iz, kZ);
            const kritik = (y.NbRd <= z.NbRd) ? y : z;
            const basinc = Math.max(0, -N_kN) * 1e3;             // N, yalnizca basinc
            const UF = basinc / kritik.NbRd;
            return {
                N: N_kN, basinc: basinc / 1e3,
                kY: kY, kZ: kZ, LcrY: y.Lcr, LcrZ: z.Lcr,
                lambdaY: y.lambda, lambdaZ: z.lambda, chiY: y.chi, chiZ: z.chi,
                NcrY: y.Ncr / 1e3, NcrZ: z.Ncr / 1e3,
                NbRd: kritik.NbRd / 1e3, eksenKritik: (kritik === y) ? 'y' : 'z',
                egri: egri, alpha: alpha, gammaM1: g, UF: UF,
                durum: basinc === 0 ? 'tension/none' : (UF > 1 ? 'FAIL' : (UF > 0.9 ? 'check' : 'ok'))
            };
        }

        // Butun model. results.elementResults[id].N okunur (kN, cekme +).
        function modelBurkulma(results) {
            const out = {};
            if (!results || !results.elementResults) return out;
            const grade = document.getElementById('steelGrade') ? document.getElementById('steelGrade').value : 'AH36';
            const genelMat = MATERIALS[grade] || MATERIALS['AH36'];
            const gEl = document.getElementById('gammaM1');
            const gammaM1 = gEl ? (parseFloat(gEl.value) || 1) : 1;
            Object.entries(model.elements).forEach(([id, elem]) => {
                const r = results.elementResults[id];
                if (!r) return;
                const n1 = model.nodes[elem.n1], n2 = model.nodes[elem.n2];
                if (!n1 || !n2) return;
                const L = Math.sqrt((n2.x - n1.x) ** 2 + (n2.y - n1.y) ** 2 + ((n2.z || 0) - (n1.z || 0)) ** 2);
                const sec = (typeof kesitBul === 'function') ? kesitBul(elem.section) : SECTIONS[elem.section];
                const mat = (typeof elemanMalzemesi === 'function') ? elemanMalzemesi(elem, genelMat) : genelMat;
                const b = elemanBurkulma(elem, sec, mat, L, r.N || 0, gammaM1);
                if (b) out[id] = b;
            });
            return out;
        }
