        // ============== YARDIM: ISARET KURALLARI VE KOMUT SOZDIZIMI ==============
        //
        // Isaret kurallari koddan OLCULEREK yazildi (tests/verify-isaret.js her
        // cumleyi cozucuye karsi sinar; kod degisirse test kirilir, belge
        // sessizce eskimez). Yardim penceresi (?) ve Settings > Units bu
        // metni buradan alir - ikinci kopya yok.

        const ISARET_KURALLARI = [
            { baslik: 'Global axes', satir: [
                ['X, Y', 'horizontal (plan); Z up. Coordinates entered in mm, stored in m.'],
                ['Beam local x', 'from start node n1 to end node n2.'],
                ['Beam local z', 'up (+Z) for a horizontal beam; local y = z × x (for a beam along +X, y = +Y).'],
                ['Column (along +Z)', 'local x = +Z, local y = +Y, local z = −X.']
            ] },
            { baslik: 'Loads', satir: [
                ['Node load Fx, Fy, Fz', 'components along the global axes: Fz negative = downward.'],
                ['Node moment Mx, My, Mz', 'right-hand rule about the global axes (+My on a cantilever tip along +X bends the tip down).'],
                ['Line load q', 'positive = downward (global −Z); "Local" direction: positive along the beam’s local +z (up for a horizontal beam).'],
                ['Beam point load P', 'positive = downward; position x measured from n1.'],
                ['Pressure p', 'positive = downward, converted to line loads by tributary width.'],
                ['Self weight', 'always downward, always load case D.']
            ] },
            { baslik: 'Results', satir: [
                ['Displacements', 'Uz negative = downward; rotations in rad, right-hand rule.'],
                ['Reactions', 'Fz positive = upward (a downward load gives a positive reaction); moments right-hand rule.'],
                ['Beam moment M', 'positive = sagging (plate/top in compression, flange/bottom in tension) at mid, ends and Mmax; hogging negative.'],
                ['Beam shear V', 'reported as absolute maximum; diagrams keep the sign.'],
                ['Axial N', 'tension positive, compression negative.'],
                ['Stresses σ', 'tension positive; σ_top = plate/top fibre, σ_bot = flange/bottom fibre; τ = Q / A_shr (rule shear area).'],
                ['Deflection δ', 'negative = downward, mm, absolute (includes node movement).']
            ] }
        ];

        const KOMUT_SOZDIZIMI = [
            ['LINE', 'click points; or type <b>a,b</b> (active plane axes, mm), <b>a,b,c</b>, <b>@dx,dy[,dz]</b> (relative), <b>3000</b> (length in the current direction); <b>X</b>/<b>Y</b>/<b>Z</b> toggles an axis lock; Enter ends.'],
            ['COPY / MOVE', 'select, base point, then click or type <b>a,b</b> (plane axes), <b>a,b,c</b>, <b>d&lt;angle</b> or a distance.'],
            ['STRETCH', 'box-select nodes, base point, displacement: only those nodes move, connected beams stretch. <b>Ctrl+drag</b> a node does the same with the mouse (in the active plane).'],
            ['ROTATE', 'select, centre, angle in degrees (about the active plane normal); <b>C</b> first keeps the original.'],
            ['MIRROR', 'select, two points of the mirror line (in the active plane); Y removes the original.'],
            ['SPLIT', 'hover a beam: <b>50%</b>, <b>R0.3</b> (ratio), <b>D1500</b> (mm from start), <b>P3</b> (equal parts); or <b>X1500</b> / <b>Y2000</b> / <b>Z3000</b> splits every beam crossing that coordinate.'],
            ['OFFSET', 'select a beam, side, distance in mm (parallel copy with loads and properties).'],
            ['ARRAY', 'select beams, then <b>3@2000,0</b> (3 copies stepped 2000 mm in X), <b>3,2@2000,1500</b> (3 × 2 grid), <b>2@0,0,3000</b> (two decks up); Enter with no text opens the dialog.'],
            ['EXTEND / TRIM', 'click the beam end / the part to remove; the boundary is another beam.'],
            ['JOIN', 'two collinear beams sharing a node → one beam (loads re-spanned).'],
            ['PURGE', 'merge coincident nodes (3D), drop duplicate and zero-length beams.'],
            ['PLANE', 'new work plane at an offset (XY / XZ / YZ); drawing snaps to the active plane.']
        ];

        // Kontroller ve yukler: kural tabanlari, uye kontrolleri, sehim, yuk
        // durumlari. Katsayilar koddaki tablolarla ayni (sinirlar.js,
        // burkulma.js); metin kodu tekrar etmez, nereye bakilacagini soyler.
        const KONTROL_YARDIMI = [
            { baslik: 'Load cases and combinations', satir: [
                ['Cases', 'D = dead (self weight always in D), L = live by default; imported DNV/Steel files bring C1, C2, … Every load carries a case (Case column in the Loads tab).'],
                ['Combinations', 'LC1 = 1D + 1L, LC2 = 1.2D + 1.5L, LC3 = 1D by default; edit factors in Loads › Edit…. A load whose case is not defined gets factor 0 — the solver warns before solving.'],
                ['ENV', 'Envelope = worst of all combinations per beam/node; needs 2+ combinations. Tables show the governing combination (LC column).']
            ] },
            { baslik: 'Stress limits (Settings › Stress Limits)', satir: [
                ['Yield', 'σ ≤ σy, τ ≤ σy/√3 — utilisation is von Mises / σ limit.'],
                ['DNV RU-SHIP Pt.3 Ch.6 Sec.6', 'AC-I (static) β 0.85 / Cs-max 0.70 / Ct 0.70; AC-II/III (static + dynamic) 0.95 / 0.85 / 0.85. Member carrying hull-girder stress: Cs = β − |σhg|/ReH.'],
                ['BV NR467 Pt.B Ch.7 Sec.6 [5.1.4]', 'Grillage analysis: σeq ≤ χ·Kcorr·Ccomb·ReH, τ ≤ χ·Kcorr·Ct·τeH. Tab 2: AC-1 harbour 0.70, AC-2 seagoing 0.85, AC-3 tank test / flooded 0.90. χ: intact 1.00, accidental watertight boundary 1.15 (Ch.7 Sec.4); Kcorr: 1.0, tank testing at construction 1.2.'],
                ['Manual', 'enter σ and τ limits directly.']
            ] },
            { baslik: 'Member checks (Results › Tables › Buckling, EN 1993-1-1)', satir: [
                ['Member', 'same-named collinear beams between vertically supported nodes form one member (as in the deflection check); L = member length, buckling length = K·L. Set Ky, Kz, KLT in the beam panel (1.0 pinned-pinned, 0.7 fixed-pinned, 0.5 fixed-fixed, 2.0 cantilever).'],
                ['6.3.1 flexural', 'Ncr = π²EI/(KL)², λ̄ = √(A fy/Ncr), curve a (pipe) / c (welded open sections) or your choice, Nb,Rd = χ A fy/γM1; UF N = N/Nb,Rd (compression only; < 0.5 % A·fy ignored).'],
                ['6.3.3 N+M', 'UF = n + kyy·My/My,Rd + kyz·Mz/Mz,Rd and the z-form; Annex B method 2, elastic (class 3), Cm from the member moment distribution (span peak → 1.0).'],
                ['6.3.2 LTB', 'only for open sections whose compression flange is free: Mcr = C1·π²EIz/Lcr²·√(Iw/Iz + Lcr²GIt/(π²EIz)), curve d (welded I with h/b ≤ 2: c), Mb,Rd = χLT·Wy·fy/γM1. Plated sections are treated as restrained; override per beam with <b>Compression flange: free / restrained</b>. Closed sections (pipe, box) are not checked.'],
                ['γM1', 'Settings › material factor (EN 1.0, DNV 1.15).']
            ] },
            { baslik: 'Deflection', satir: [
                ['Spans', 'same-named collinear beams between vertically supported nodes; deflection is measured relative to the span chord (cantilever: relative to the supported end).'],
                ['Limit', 'Settings › Deflection Limit: L/x and/or an absolute value in mm (the stricter governs). Ships commonly use L/250–L/300.']
            ] },
            { baslik: 'Tables and report', satir: [
                ['Show all', 'result and model tables list the first 500 rows (sorted; selected rows always shown) — click <b>Show all</b> for the rest.'],
                ['Report', 'Export › Report opens a printable page: model view, loads, sections, results, Checks (basis, utilisation, plate slenderness, member buckling table, deflection spans), reactions, beam results, diagrams of the critical beams.']
            ] }
        ];
        function kontrolYardimiHtml() {
            return KONTROL_YARDIMI.map(g =>
                '<div style="margin-bottom:8px;"><div style="font-weight:600; color:var(--text); margin-bottom:4px;">' + g.baslik + '</div>' +
                '<table style="width:100%; border-collapse:collapse; font-size:var(--fs-sm);">' +
                g.satir.map(([a, b]) => '<tr><td style="color:var(--accent-info); padding:2px 8px 2px 0; white-space:nowrap; vertical-align:top;">' + a + '</td><td style="color:var(--text-2); padding:2px 0;">' + b + '</td></tr>').join('') +
                '</table></div>').join('');
        }

        function isaretKurallariHtml() {
            return ISARET_KURALLARI.map(g =>
                '<div style="margin-bottom:8px;"><div style="font-weight:600; color:var(--text); margin-bottom:4px;">' + g.baslik + '</div>' +
                '<table style="width:100%; border-collapse:collapse; font-size:var(--fs-sm);">' +
                g.satir.map(([a, b]) => '<tr><td style="color:var(--accent-info); padding:2px 8px 2px 0; white-space:nowrap; vertical-align:top;">' + a + '</td><td style="color:var(--text-2); padding:2px 0;">' + b + '</td></tr>').join('') +
                '</table></div>').join('');
        }
        function komutYardimiHtml() {
            return '<table style="width:100%; border-collapse:collapse; font-size:var(--fs-sm);">' +
                KOMUT_SOZDIZIMI.map(([a, b]) => '<tr><td style="padding:3px 8px 3px 0; white-space:nowrap; vertical-align:top;"><kbd>' + a + '</kbd></td><td style="color:var(--text-2); padding:3px 0;">' + b + '</td></tr>').join('') +
                '</table>';
        }
        // Yardim penceresine eklenen bolumler (showHelp sablonu cagirir)
        function yardimEkBolumleri() {
            return '<div style="margin-top:20px; background:var(--bg-main); padding:16px; border-radius:var(--r-ovl);">' +
                   '<h3 style="color:var(--text-3); margin:0 0 12px 0; font-size:var(--fs-md);">⌨️ Command input syntax</h3>' + komutYardimiHtml() + '</div>' +
                   '<div style="margin-top:20px; background:var(--bg-main); padding:16px; border-radius:var(--r-ovl);">' +
                   '<h3 style="color:var(--text-3); margin:0 0 12px 0; font-size:var(--fs-md);">± Sign conventions</h3>' + isaretKurallariHtml() + '</div>' +
                   '<div style="margin-top:20px; background:var(--bg-main); padding:16px; border-radius:var(--r-ovl);">' +
                   '<h3 style="color:var(--text-3); margin:0 0 12px 0; font-size:var(--fs-md);">✔ Loads, limits and checks</h3>' + kontrolYardimiHtml() + '</div>';
        }
