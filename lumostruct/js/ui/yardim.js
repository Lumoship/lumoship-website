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

        function isaretKurallariHtml() {
            return ISARET_KURALLARI.map(g =>
                '<div style="margin-bottom:10px;"><div style="font-weight:600; color:var(--text); margin-bottom:4px;">' + g.baslik + '</div>' +
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
                   '<h3 style="color:var(--text-3); margin:0 0 12px 0; font-size:var(--fs-md);">± Sign conventions</h3>' + isaretKurallariHtml() + '</div>';
        }
