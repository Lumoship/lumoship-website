        // ============== DXF EXPORT ==============
        // Uygulama DXF okuyabiliyordu ama yazamiyordu; model CAD'e geri gonderilemiyordu.
        //
        // Bicim: DXF R12 ASCII - kucuk, her CAD tarafindan okunur ve bu uygulamanin kendi
        // ice aktarmasi tarafindan geri okunabilir. Her kiris bir LINE, katman adi kesit
        // adidir (ice aktarma profili katman adindan cozer). Koordinatlar mm.

        // Katman adlari DXF'te sinirli bir karakter kumesi kullanir; profil adindaki '/'
        // gecerli degil. Ice aktarma T profillerinde '/' ve '+' ikisini de kabul ettigi
        // icin '+' guvenli karsilik.
        function dxfLayerName(section) {
            return String(section || 'BEAM')
                .replace(/\//g, '+')
                .replace(/[<>\/\\":;?*|=`,]/g, '_')
                .trim() || 'BEAM';
        }

        function buildDxfString() {
            const nodes = model.nodes || {};
            const elements = model.elements || {};
            if (Object.keys(elements).length === 0) return null;

            const out = [];
            const g = (code, value) => { out.push(String(code)); out.push(String(value)); };

            const katmanlar = [...new Set(Object.values(elements)
                .map(el => dxfLayerName(el.section)))];

            // --- HEADER: birim milimetre ---
            g(0, 'SECTION'); g(2, 'HEADER');
            g(9, '$INSUNITS'); g(70, 4);          // 4 = millimeters
            g(9, '$EXTMIN'); g(10, 0); g(20, 0); g(30, 0);
            g(9, '$EXTMAX'); g(10, 1000); g(20, 1000); g(30, 0);
            g(0, 'ENDSEC');

            // --- TABLES: katmanlar ---
            g(0, 'SECTION'); g(2, 'TABLES');
            g(0, 'TABLE'); g(2, 'LAYER'); g(70, katmanlar.length);
            katmanlar.forEach((ad, i) => {
                g(0, 'LAYER');
                g(2, ad);
                g(70, 0);
                g(62, (i % 7) + 1);              // her katmana farkli renk
                g(6, 'CONTINUOUS');
            });
            g(0, 'ENDTAB');
            g(0, 'ENDSEC');

            // --- ENTITIES: her kiris bir LINE ---
            g(0, 'SECTION'); g(2, 'ENTITIES');
            let yazilan = 0;
            Object.values(elements).forEach(el => {
                const n1 = nodes[el.n1], n2 = nodes[el.n2];
                if (!n1 || !n2) return;
                g(0, 'LINE');
                g(8, dxfLayerName(el.section));
                g(10, (n1.x * 1000).toFixed(3));
                g(20, (n1.y * 1000).toFixed(3));
                g(30, ((n1.z || 0) * 1000).toFixed(3));
                g(11, (n2.x * 1000).toFixed(3));
                g(21, (n2.y * 1000).toFixed(3));
                g(31, ((n2.z || 0) * 1000).toFixed(3));
                yazilan++;
            });
            g(0, 'ENDSEC');
            g(0, 'EOF');

            return yazilan > 0 ? out.join('\r\n') + '\r\n' : null;
        }

        function exportDXF() {
            const dxf = buildDxfString();
            if (!dxf) {
                showToast('No beams to export', 'warning');
                return;
            }
            const blob = new Blob([dxf], { type: 'application/dxf' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'grillage_model.dxf';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            const n = (dxf.match(/\r\nLINE\r\n/g) || []).length;
            showToast('Exported ' + n + ' beams to DXF');
        }
