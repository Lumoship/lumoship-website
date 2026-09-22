        // ============== IZGARA URETICI (Grillage generator) ==============
        //
        // Gemi isinde model cogu zaman "boyuna takviyeler x enine ana
        // tasiyicilar + mesnet kenarlari"dir. Her kirisi elle cizmek yerine:
        // panel olculeri, araliklar, profiller, mesnet kenarlari ve basinc tek
        // pencerede -> tam model (dugumler kesisimlerde, kirisler parcali,
        // mesnetler, yama). Ureten fonksiyon (izgaraUret) arayuzden bagimsiz;
        // tests/verify-izgara.js onu dogrudan sinar.
        //
        // Girdi (mm):
        //   x0, y0, z      : sol alt kose ve kot
        //   L, W           : panel boyu (X) ve genisligi (Y)
        //   sS             : boyuna takviye araligi (Y yonunde), kenarlar dahil mi
        //   sG             : enine tasiyici araligi (X yonunde), kenarlar dahil mi
        //   bolgeS, bolgeG : ARALIK BOLGELERI - [{ sayi, aralik }] (mm). Verilirse
        //                    sS / sG yerine kullanilir. Gemide aralik boy boyunca
        //                    degisir (kic pikte 600, ambarda 700+); tek aralikla
        //                    kurulan izgara gercek cerceve yerlerini tutturamaz.
        //                    Bicim BV MARS'in FramesGroup'u ve LoadPoint'in frame
        //                    tablosu ile ayni: kac aralik x kac mm.
        //   kesitS, kesitG : profil adlari ('' = takviye/tasiyici yok)
        //   kenarMesnet    : { x0, xL, y0, yW } her kenar icin 'pin' | 'fix' | ''
        //   basinc, basincDurum
        //   yon            : 'X' takviyeler X boyunca (varsayilan) | 'Y'
        // Cikti: { nodes, elements, constraints, pressure } modele eklenir.

        function izgaraKonumlari(bas, boy, aralik, kenarlar) {
            const out = [];
            if (!(aralik > 0)) return kenarlar ? [bas, bas + boy] : [];
            const n = Math.floor(boy / aralik + 1e-9);
            for (let i = 0; i <= n; i++) {
                const v = bas + i * aralik;
                if (v > bas + boy + 1e-9) break;
                if (!kenarlar && (Math.abs(v - bas) < 1e-9 || Math.abs(v - (bas + boy)) < 1e-9)) continue;
                out.push(v);
            }
            if (kenarlar) { if (!out.some(v => Math.abs(v - bas) < 1e-9)) out.unshift(bas); if (!out.some(v => Math.abs(v - (bas + boy)) < 1e-9)) out.push(bas + boy); }
            return out.sort((a, b) => a - b);
        }

        // Bolgelerden konum listesi: bas noktasindan baslayip her bolgeyi
        // "sayi kadar aralik" olarak yurur. Panel boyunu ASARSA kirpar ve
        // uyari dondurur - sessizce panel disina kiris koymaz.
        function izgaraBolgeKonumlari(bas, bolgeler, boy, kenarlar) {
            const out = [bas];
            let x = bas, tasma = 0;
            (bolgeler || []).forEach(b => {
                const sayi = Math.max(0, Math.round(b.sayi || 0));
                const ar = (b.aralik || 0) / 1000;
                if (!(ar > 0)) return;
                for (let i = 0; i < sayi; i++) {
                    x += ar;
                    if (x > bas + boy + 1e-9) { tasma++; continue; }
                    out.push(+x.toFixed(6));
                }
            });
            const son = bas + boy;
            if (kenarlar && !out.some(v => Math.abs(v - son) < 1e-9)) out.push(son);
            if (!kenarlar) {
                for (let i = out.length - 1; i >= 0; i--) {
                    if (Math.abs(out[i] - bas) < 1e-9 || Math.abs(out[i] - son) < 1e-9) out.splice(i, 1);
                }
            }
            const benzersiz = [...new Set(out.map(v => +v.toFixed(6)))].sort((a, b) => a - b);
            return { konumlar: benzersiz, tasma: tasma, bitis: x };
        }

        // "20x600, 120x700" -> [{sayi:20, aralik:600}, {sayi:120, aralik:700}]
        // Ayrica "600" (tek aralik, panel boyunca) ve "20*600" kabul edilir.
        function izgaraBolgeCoz(metin) {
            const s = String(metin || '').trim();
            if (!s) return [];
            const out = [];
            s.split(',').forEach(parca => {
                const p = parca.trim();
                if (!p) return;
                const m = /^(\d+(?:\.\d+)?)\s*[x*]\s*(\d+(?:\.\d+)?)$/i.exec(p);
                if (m) { out.push({ sayi: parseFloat(m[1]), aralik: parseFloat(m[2]) }); return; }
                const tek = parseFloat(p);
                if (isFinite(tek) && tek > 0) out.push({ sayi: null, aralik: tek });   // sayi yok: panel boyunca
            });
            return out;
        }
        // Bolge metnini okunur ozete cevirir: "20 x 600 + 120 x 700 = 96.0 m"
        function izgaraBolgeOzet(bolgeler) {
            if (!bolgeler || !bolgeler.length) return '';
            let toplam = 0;
            const p = bolgeler.map(b => {
                if (b.sayi) { toplam += b.sayi * b.aralik; return b.sayi + ' x ' + b.aralik; }
                return b.aralik + ' (uniform)';
            });
            return p.join(' + ') + (toplam ? '  =  ' + (toplam / 1000).toFixed(2) + ' m' : '');
        }

        // Modele YAZMADAN uretir (onizleme ve test icin)
        function izgaraUret(g) {
            const m = v => (v || 0) / 1000;
            const x0 = m(g.x0), y0 = m(g.y0), z = m(g.z), L = m(g.L), W = m(g.W);
            if (!(L > 0) || !(W > 0)) return { hata: 'Panel length and width must be positive' };
            // takviye cizgileri Y'de (X boyunca kirisler), tasiyici cizgileri X'te
            // Takviyeler X boyunca: takviye cizgileri Y'de (aralik sS, genislik W),
            // tasiyicilar X'te (sG, L). Takviyeler Y boyunca: tersi.
            let ys, xs;
            const uyarilar = [];
            // Bolge verildiyse o yonde bolgeler, yoksa tek aralik kullanilir.
            const konum = (bas, boy, bolgeler, aralik, kenarlar, ad) => {
                const b = (bolgeler || []).filter(z => z && z.aralik > 0);
                if (!b.length) return izgaraKonumlari(bas, boy, aralik, kenarlar);
                // "sayi" verilmemis bolge: panel boyunca duzgun aralik
                if (b.length === 1 && !b[0].sayi) return izgaraKonumlari(bas, boy, b[0].aralik / 1000, kenarlar);
                const r = izgaraBolgeKonumlari(bas, b, boy, kenarlar);
                if (r.tasma) uyarilar.push(ad + ': ' + r.tasma + ' line(s) fell outside the panel and were dropped');
                const eksik = (bas + boy) - r.bitis;
                if (eksik > 0.01) uyarilar.push(ad + ': zones cover ' + (r.bitis - bas).toFixed(3) + ' m of ' + boy.toFixed(3) + ' m');
                return r.konumlar;
            };
            if (g.yon === 'Y') {
                xs = konum(x0, L, g.bolgeS, m(g.sS), !!g.kenarS, 'Stiffeners');
                ys = konum(y0, W, g.bolgeG, m(g.sG), !!g.kenarG, 'Girders');
            } else {
                ys = konum(y0, W, g.bolgeS, m(g.sS), !!g.kenarS, 'Stiffeners');
                xs = konum(x0, L, g.bolgeG, m(g.sG), !!g.kenarG, 'Girders');
            }
            // dugum izgarasi: kiris cizgilerinin kesisimleri + panel koseleri/kenar uclari
            const xAll = [...new Set([x0, x0 + L, ...xs].map(v => +v.toFixed(6)))].sort((a, b) => a - b);
            const yAll = [...new Set([y0, y0 + W, ...ys].map(v => +v.toFixed(6)))].sort((a, b) => a - b);
            const nodes = {}, elements = {}, constraints = {};
            let nid = 1, eid = 1;
            const dugum = {};
            const dugumAl = (x, y) => { const k = x.toFixed(6) + '|' + y.toFixed(6); if (dugum[k] === undefined) { dugum[k] = nid; nodes[nid++] = { x, y, z }; } return dugum[k]; };
            const takviyeYon = g.yon === 'Y' ? 'Y' : 'X';
            // takviyeler (X boyunca, y = ys) / tasiyicilar (Y boyunca, x = xs)
            const cizgiler = [];
            if (g.kesitS) (takviyeYon === 'X' ? ys : xs).forEach((c, i) => cizgiler.push({ sabit: c, yon: takviyeYon, kesit: g.kesitS, ad: (g.adS || 'L') + (i + 1) }));
            if (g.kesitG) (takviyeYon === 'X' ? xs : ys).forEach((c, i) => cizgiler.push({ sabit: c, yon: takviyeYon === 'X' ? 'Y' : 'X', kesit: g.kesitG, ad: (g.adG || 'T') + (i + 1) }));
            cizgiler.forEach(c => {
                const dizi = c.yon === 'X' ? xAll : yAll;
                for (let i = 0; i < dizi.length - 1; i++) {
                    const a = c.yon === 'X' ? dugumAl(dizi[i], c.sabit) : dugumAl(c.sabit, dizi[i]);
                    const b = c.yon === 'X' ? dugumAl(dizi[i + 1], c.sabit) : dugumAl(c.sabit, dizi[i + 1]);
                    elements[eid++] = { n1: a, n2: b, section: c.kesit, ad: c.ad, lineLoads: [] };
                }
            });
            // Kenar mesnetleri: o kenar uzerindeki BUTUN dugumler
            const PIN = { Ux: true, Uy: true, Uz: true, Rx: false, Ry: false, Rz: false };
            const FIX = { Ux: true, Uy: true, Uz: true, Rx: true, Ry: true, Rz: true };
            const kenar = g.kenarMesnet || {};
            Object.entries(nodes).forEach(([id, n]) => {
                const kenarda = [];
                if (Math.abs(n.x - x0) < 1e-9) kenarda.push(kenar.x0);
                if (Math.abs(n.x - (x0 + L)) < 1e-9) kenarda.push(kenar.xL);
                if (Math.abs(n.y - y0) < 1e-9) kenarda.push(kenar.y0);
                if (Math.abs(n.y - (y0 + W)) < 1e-9) kenarda.push(kenar.yW);
                const tur = kenarda.includes('fix') ? 'fix' : (kenarda.includes('pin') ? 'pin' : '');
                if (tur) constraints[id] = Object.assign({}, tur === 'fix' ? FIX : PIN);
            });
            const pressure = [];
            if (g.basinc && Math.abs(g.basinc) > 0) pressure.push({ ad: 'P1', x1: x0, y1: y0, x2: x0 + L, y2: y0 + W, z: z, value: +g.basinc, case: g.basincDurum || 'L', tasima: 'auto' });
            return { nodes, elements, constraints, pressure, uyarilar: uyarilar, ozet: { dugum: Object.keys(nodes).length, kiris: Object.keys(elements).length, mesnet: Object.keys(constraints).length, takviye: g.kesitS ? (takviyeYon === 'X' ? ys : xs).length : 0, tasiyici: g.kesitG ? (takviyeYon === 'X' ? xs : ys).length : 0 } };
        }

        // Uretileni modele ekler (ekle / degistir). Mevcut dugumlerle cakisan
        // konumlar birlestirilir (findNodeAtLocation).
        function izgarayiModeleYaz(u, degistir) {
            saveState();
            if (degistir) { model.nodes = {}; model.elements = {}; model.constraints = {}; model.loads = []; model.pressure = []; nextNodeId = 1; nextElementId = 1; }
            // Eslestirme yalnizca MEVCUT dugum/kirislere karsi yapilir (uretici
            // kendi icinde tekrarsiz). Eskiden her dugum icin findNodeAtLocation
            // buyuyen listeyi, her kiris icin Object.values(model.elements) hepsini
            // tariyordu: 1 582 dugum / 2 915 kiriste 9.3 s olculdu.
            const harita = {};
            const mevcutDugumler = Object.entries(model.nodes).map(([id, n]) => ({ id: parseInt(id), x: n.x, y: n.y, z: n.z || 0 }));
            const yakinMevcut = (x, y, z) => { for (const n of mevcutDugumler) { if (Math.abs(n.x - x) < 0.01 && Math.abs(n.y - y) < 0.01 && Math.abs(n.z - z) < 0.01) return n.id; } return null; };
            Object.entries(u.nodes).forEach(([id, n]) => {
                const var_ = yakinMevcut(n.x, n.y, n.z || 0);
                if (var_ !== null) { harita[id] = var_; return; }
                const yeni = nextNodeId++;
                model.nodes[yeni] = { x: n.x, y: n.y, z: n.z };
                harita[id] = yeni;
            });
            const yeniKirisler = [];
            const ciftAnahtar = (a, b) => (a < b ? a + '|' + b : b + '|' + a);
            const mevcutCiftler = new Set(Object.values(model.elements).map(x => ciftAnahtar(x.n1, x.n2)));
            Object.values(u.elements).forEach(e => {
                const a = harita[e.n1], b = harita[e.n2];
                // ayni iki dugum arasinda kiris varsa yeniden acma
                const ak = ciftAnahtar(a, b);
                if (mevcutCiftler.has(ak)) return;
                mevcutCiftler.add(ak);
                const id = nextElementId++;
                model.elements[id] = { n1: a, n2: b, section: e.section, ad: e.ad, lineLoads: [] };
                yeniKirisler.push(id);
            });
            Object.entries(u.constraints).forEach(([id, bc]) => {
                const h = harita[id];
                model.constraints[h] = (typeof mesnetleriTopla === 'function') ? mesnetleriTopla(model.constraints[h], bc) : bc;
            });
            (u.pressure || []).forEach(p => { model.pressure = model.pressure || []; p.ad = 'P' + (model.pressure.length + 1); model.pressure.push(p); });
            results = null;
            if (typeof updateModelSummary === 'function') updateModelSummary();
            if (typeof updateBCLoadsTable === 'function') updateBCLoadsTable();
            if (typeof updateSectionDropdowns === 'function') updateSectionDropdowns();
            if (currentViewMode === '3d') { update3DScene(); if (typeof fit3DView === 'function') fit3DView(); } else { draw(); if (typeof fitView === 'function') fitView(); }
            return yeniKirisler;
        }

        // ---- pencere ----
        function izgaraPenceresiAc() {
            const eski = document.getElementById('izgaraModal'); if (eski) eski.remove();
            const kesitler = Object.keys(SECTIONS);
            const sec = (id, varsayilan) => '<select id="' + id + '" onchange="izgaraOnizle()" style="width:100%; padding:5px; font-size:var(--fs-sm);">' +
                '<option value="">— none —</option><option value="' + RIGID_KESIT_ADI + '">RIGID (no profile)</option>' +
                kesitler.map(k => '<option value="' + k + '"' + (k === varsayilan ? ' selected' : '') + '>' + k + '</option>').join('') + '</select>';
            const txt = (id, v, ipucu) => '<input type="text" id="' + id + '" value="' + v + '" placeholder="' + (ipucu || '') + '" oninput="izgaraOnizle()" style="width:100%; padding:5px; font-size:var(--fs-sm);">';
            const inp = (id, v, ek) => '<input type="number" id="' + id + '" value="' + v + '" ' + (ek || '') + ' oninput="izgaraOnizle()" style="width:100%; padding:5px; font-size:var(--fs-sm);">';
            const kenar = (id, v) => '<select id="' + id + '" onchange="izgaraOnizle()" style="width:100%; padding:5px; font-size:var(--fs-sm);"><option value=""' + (v === '' ? ' selected' : '') + '>free</option><option value="pin"' + (v === 'pin' ? ' selected' : '') + '>pinned</option><option value="fix"' + (v === 'fix' ? ' selected' : '') + '>fixed</option></select>';
            const lab = t => '<small style="color:var(--text-3); font-size:var(--fs-xs); display:block;">' + t + '</small>';
            const modal = document.createElement('div');
            modal.id = 'izgaraModal';
            modal.innerHTML =
                '<div style="position:fixed; inset:0; background:rgba(0,0,0,0.7); z-index:10000; display:flex; align-items:center; justify-content:center;" onclick="if(event.target===this)this.parentElement.remove()">' +
                '<div style="background:var(--bg-elev); border-radius:var(--r-ovl); width:94%; max-width:720px; max-height:90vh; display:flex; flex-direction:column; overflow:hidden;">' +
                '<div style="display:flex; justify-content:space-between; align-items:center; padding:12px 16px; border-bottom:1px solid var(--border);"><h3 style="margin:0; color:var(--text); font-size:var(--fs-md);">Grillage generator</h3>' +
                '<button onclick="document.getElementById(\'izgaraModal\').remove()" style="background:none; border:none; color:var(--text-2); cursor:pointer; font-size:var(--fs-lg);">&times;</button></div>' +
                '<div style="padding:12px 16px; overflow-y:auto;">' +
                '<div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:8px;">' +
                '<div>' + lab('Origin X (mm)') + inp('izgX0', 0) + '</div><div>' + lab('Origin Y (mm)') + inp('izgY0', 0) + '</div><div>' + lab('Level Z (mm)') + inp('izgZ', 0) + '</div><div>' + lab('Stiffeners along') + '<select id="izgYon" onchange="izgaraOnizle()" style="width:100%; padding:5px; font-size:var(--fs-sm);"><option value="X">X</option><option value="Y">Y</option></select></div>' +
                '<div>' + lab('Panel length L (mm, X)') + inp('izgL', 12000, 'step="100"') + '</div><div>' + lab('Panel width W (mm, Y)') + inp('izgW', 6000, 'step="100"') + '</div>' +
                '<div>' + lab('Stiffener spacing (mm)') + inp('izgSS', 600, 'step="50"') + '</div><div>' + lab('Girder spacing (mm)') + inp('izgSG', 3000, 'step="100"') + '</div>' +
                '<div style="grid-column:span 2;">' + lab('Stiffener spacing zones (optional)') + txt('izgBolgeS', '', '20x600, 120x700') + '</div>' +
                '<div style="grid-column:span 2;">' + lab('Girder spacing zones (optional)') + txt('izgBolgeG', '', '4x2400, 6x3000') + '</div>' +
                '<div style="grid-column:span 4; font-size:var(--fs-xs); color:var(--text-3); margin-top:-4px;">Zones override the single spacing: "count x spacing", comma separated - the same shape as a frame table (BV MARS FramesGroup, LoadPoint frame zones).</div>' +
                '<div style="grid-column:span 2;">' + lab('Stiffener profile') + sec('izgKesitS', kesitler[0] || '') + '</div><div style="grid-column:span 2;">' + lab('Girder profile') + sec('izgKesitG', kesitler[1] || kesitler[0] || '') + '</div>' +
                '<div style="grid-column:span 2;"><label style="display:flex; gap:6px; align-items:center; font-size:var(--fs-sm); cursor:pointer;"><input type="checkbox" id="izgKenarS" onchange="izgaraOnizle()"> stiffeners on the panel edges (y = 0, W)</label></div>' +
                '<div style="grid-column:span 2;"><label style="display:flex; gap:6px; align-items:center; font-size:var(--fs-sm); cursor:pointer;"><input type="checkbox" id="izgKenarG" checked onchange="izgaraOnizle()"> girders on the panel edges (x = 0, L)</label></div>' +
                '<div>' + lab('Support edge x = 0') + kenar('izgMx0', 'pin') + '</div><div>' + lab('Edge x = L') + kenar('izgMxL', 'pin') + '</div><div>' + lab('Edge y = 0') + kenar('izgMy0', 'pin') + '</div><div>' + lab('Edge y = W') + kenar('izgMyW', 'pin') + '</div>' +
                '<div style="grid-column:span 2;">' + lab('Pressure on panel (kN/m², + = down, 0 = none)') + inp('izgBasinc', 0, 'step="0.5"') + '</div>' +
                '<div>' + lab('Pressure case') + '<select id="izgBasincDurum" class="yuk-durumu-secici" style="width:100%; padding:5px; font-size:var(--fs-sm);"></select></div>' +
                '<div>' + lab('Existing model') + '<select id="izgDegistir" style="width:100%; padding:5px; font-size:var(--fs-sm);"><option value="ekle">add to it</option><option value="degistir">replace it</option></select></div>' +
                '</div>' +
                '<div id="izgaraOnizleme" style="margin-top:10px; color:var(--text-2); font-size:var(--fs-sm); white-space:pre-line;"></div>' +
                '<div style="font-size:var(--fs-xs); color:var(--text-3); margin-top:6px;">Nodes are created at every stiffener × girder intersection and on the panel edges; beams are split there. Edge supports apply to every node on that edge. Beams are named L1, L2… (stiffeners) and T1, T2… (girders).</div>' +
                '</div>' +
                '<div style="padding:10px 16px; border-top:1px solid var(--border); display:flex; justify-content:flex-end; gap:8px;">' +
                '<button class="btn-secondary" onclick="document.getElementById(\'izgaraModal\').remove()">Cancel</button><button class="btn-primary" onclick="izgaraOnayla()">Generate</button></div>' +
                '</div></div>';
            document.body.appendChild(modal);
            if (typeof yukSecicileriniTazele === 'function') yukSecicileriniTazele();
            izgaraOnizle();
        }
        function izgaraFormOku() {
            const v = id => document.getElementById(id) ? document.getElementById(id).value : '';
            return { x0: +v('izgX0'), y0: +v('izgY0'), z: +v('izgZ'), L: +v('izgL'), W: +v('izgW'), sS: +v('izgSS'), sG: +v('izgSG'),
                     bolgeS: izgaraBolgeCoz(v('izgBolgeS')), bolgeG: izgaraBolgeCoz(v('izgBolgeG')),
                     kesitS: v('izgKesitS'), kesitG: v('izgKesitG'), kenarS: !!document.getElementById('izgKenarS')?.checked, kenarG: !!document.getElementById('izgKenarG')?.checked,
                     kenarMesnet: { x0: v('izgMx0'), xL: v('izgMxL'), y0: v('izgMy0'), yW: v('izgMyW') },
                     basinc: +v('izgBasinc'), basincDurum: v('izgBasincDurum') || 'L', yon: v('izgYon') || 'X' };
        }
        function izgaraOnizle() {
            const o = document.getElementById('izgaraOnizleme'); if (!o) return;
            const u = izgaraUret(izgaraFormOku());
            if (u.hata) { o.textContent = u.hata; return; }
            o.textContent = u.ozet.takviye + ' stiffeners, ' + u.ozet.tasiyici + ' girders → ' + u.ozet.dugum + ' nodes, ' + u.ozet.kiris + ' beams, ' + u.ozet.mesnet + ' supported nodes' + (u.pressure.length ? ', pressure patch ' + u.pressure[0].value + ' kN/m²' : '');
            // Bolge ozeti ve uyarilari: "20 x 600 + 120 x 700 = 96.00 m" ve
            // panel disina tasan satirlar sessiz kalmasin.
            const g = izgaraFormOku();
            const ek = [];
            if (g.bolgeS && g.bolgeS.length) ek.push('Stiffener zones: ' + izgaraBolgeOzet(g.bolgeS));
            if (g.bolgeG && g.bolgeG.length) ek.push('Girder zones: ' + izgaraBolgeOzet(g.bolgeG));
            (u.uyarilar || []).forEach(x => ek.push('! ' + x));
            if (ek.length) o.textContent += String.fromCharCode(10) + ek.join(String.fromCharCode(10));
        }
        function izgaraOnayla() {
            const g = izgaraFormOku();
            const u = izgaraUret(g);
            if (u.hata) { showToast(u.hata, 'warning'); return; }
            if (!u.ozet.kiris) { showToast('Choose at least one profile', 'warning'); return; }
            const degistir = document.getElementById('izgDegistir')?.value === 'degistir';
            const yeni = izgarayiModeleYaz(u, degistir);
            document.getElementById('izgaraModal')?.remove();
            showToast('Grillage: ' + yeni.length + ' beams, ' + u.ozet.mesnet + ' supports' + (u.pressure.length ? ', pressure applied' : ''));
        }
