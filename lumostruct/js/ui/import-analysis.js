/* ==========================================================================
   ANALIZ MODELI ICE AKTARMA  (.steel  ve  DNV 3D Beam .xml)
   --------------------------------------------------------------------------
   Eski "Steel File (geometry only)" yolu yalnizca dugumlerin x,y'sini ve
   baglantiyi okuyordu: kesit yok, yuk yok, mesnet yok. Yani ice aktardiktan
   sonra modeli bastan kurmak gerekiyordu.
   Burasi TAM modeli getiriyor - geometri, kesitler, korozyon, mesnetler
   (zorlanmis yer degistirmeler dahil) ve yukler - ve kullanici dogrudan
   Solve'a basabilecek durumda kaliyor.

   Okuyucular cekirdekte:  js/core/steelfile.js   js/core/dnvfile.js
   Burasi yalnizca arayuz: bicim algilama, secim penceresi, modele yazma.
   ========================================================================== */

// Bicim, kok etiketten anlasilir - uzantiya guvenmiyoruz, ikisi de .xml
// olabiliyor.
function analizBicimi(metin) {
    const bas = metin.slice(0, 4000);
    if (/<DNV_structure_concept_protocol/i.test(bas)) return 'dnv';
    if (/<project[\s>]/i.test(bas) && /program\s*=\s*"/i.test(bas)) return 'steel';
    if (/<beamProperties/i.test(metin)) return 'steel';
    return null;
}

let analizVeri = null;      // okunmus dosya
let analizTur = null;       // 'steel' | 'dnv'
let analizDosyaAdi = null;

function analizDosyasiSec(event) {
    const file = event.target.files[0];
    if (!file) return;
    event.target.value = '';
    const reader = new FileReader();
    reader.onerror = () => showToast('File could not be read', 'error');
    reader.onload = e => {
        try { analizDosyasiIsle(e.target.result, file.name); }
        catch (err) {
            debugError('analysis import:', err);
            showToast('Import failed: ' + err.message, 'error');
        }
    };
    reader.readAsText(file);
}

function analizDosyasiIsle(metin, ad) {
    const tur = analizBicimi(metin);
    if (!tur) { showToast('Not a Steel or DNV 3D Beam file', 'error'); return; }
    analizTur = tur;
    analizDosyaAdi = ad;
    analizVeri = (tur === 'steel') ? steelDosyasiOku(metin) : dnvDosyasiOku(metin);

    if (tur === 'dnv') {
        if (!analizVeri.kirisler.length) {
            // Sonuc dosyasi da ayni koke sahip; model yerine cikti tasiyor.
            showToast('This DNV file holds results, not a model', 'error');
            return;
        }
        analizSeciciAc();
        return;
    }
    if (!analizVeri.modeller.length) { showToast('No models in file', 'error'); return; }
    analizSeciciAc();
}

// --------------------------------------------------------------- secici
function analizSeciciAc() {
    const eski = document.getElementById('analizIceAktarModal');
    if (eski) eski.remove();

    let govde = '';
    if (analizTur === 'steel') {
        const ms = analizVeri.modeller;
        govde += satirSecim('analizModelSec', 'Model', ms.map((m, i) =>
            ({ v: m.id, t: m.id + '. ' + (m.ad || '') + '  (' + Object.keys(m.dugumler).length +
                 ' nodes, ' + Object.keys(m.kirisler).length + ' beams)' })));
        govde += '<div id="analizAnalizKutu"></div>';
    } else {
        const lc = analizVeri.yukDurumlari;
        govde += '<div style="color:var(--text-2); font-size:var(--fs-md); margin-bottom:10px;">' +
                 (analizVeri.kirisler.length + ' beams, ' + analizVeri.mesnetler.length +
                  ' supports, ' + Object.keys(analizVeri.kesitler).length + ' sections') + '</div>';
        if (lc.length) govde += satirSecim('analizYukSec', 'Load case', lc.map(l =>
            ({ v: l.ad, t: (l.aciklama || l.ad) })));
    }

    const modal = document.createElement('div');
    modal.id = 'analizIceAktarModal';
    modal.innerHTML =
        '<div style="position:fixed; inset:0; background:rgba(0,0,0,0.7); z-index:10000; display:flex; align-items:center; justify-content:center;"' +
        ' onclick="if(event.target===this)this.parentElement.remove()">' +
        '  <div style="background:var(--bg-elev); border-radius:var(--r-ovl); width:90%; max-width:560px; overflow:hidden;">' +
        '    <div style="display:flex; justify-content:space-between; align-items:center; padding:16px; border-bottom:1px solid var(--border);">' +
        '      <h3 style="margin:0; color:var(--text);">Import ' + (analizTur === 'dnv' ? 'DNV 3D Beam' : 'Steel') + ' model</h3>' +
        '      <button onclick="document.getElementById(\'analizIceAktarModal\').remove()" style="background:none; border:none; color:var(--text-2); cursor:pointer; font-size:var(--fs-lg);">&times;</button>' +
        '    </div>' +
        '    <div style="padding:16px;">' +
        '      <div style="color:var(--text-3); font-size:var(--fs-sm); margin-bottom:12px;">' + analizDosyaAdi + '</div>' +
        govde +
        '      <div id="analizOnizleme" style="margin-top:12px; color:var(--text-2); font-size:var(--fs-sm); white-space:pre-line;"></div>' +
        '    </div>' +
        '    <div style="padding:12px 16px; border-top:1px solid var(--border); display:flex; gap:8px; justify-content:flex-end;">' +
        '      <button class="btn-secondary" onclick="document.getElementById(\'analizIceAktarModal\').remove()">Cancel</button>' +
        '      <button class="btn-primary" onclick="analizIceAktarOnayla()">Import</button>' +
        '    </div>' +
        '  </div>' +
        '</div>';
    document.body.appendChild(modal);
    if (analizTur === 'steel') analizModelDegisti();
    analizOnizlemeTazele();
}

function satirSecim(id, etiket, secenekler) {
    return '<div class="form-group" style="margin-bottom:10px;">' +
        '<label style="color:var(--text-2);">' + etiket + '</label>' +
        '<select id="' + id + '" onchange="' +
        (id === 'analizModelSec' ? 'analizModelDegisti()' : 'analizOnizlemeTazele()') + '">' +
        secenekler.map(o => '<option value="' + o.v + '">' + o.t + '</option>').join('') +
        '</select></div>';
}

// Steel dosyasinda her modelin kendi analiz listesi var (yuk durumu + mesnet
// durumu cifti), o yuzden model degisince yeniden kurulur.
function analizModelDegisti() {
    const kutu = document.getElementById('analizAnalizKutu');
    if (!kutu) return;
    const mid = document.getElementById('analizModelSec').value;
    const m = analizVeri.modeller.find(x => String(x.id) === String(mid));
    if (!m) return;
    kutu.innerHTML = m.analizler.length
        ? satirSecim('analizAnalizSec', 'Analysis (load case + supports)',
            m.analizler.map(a => ({ v: a.id, t: a.id + '. ' + a.ad })))
        : '<div style="color:var(--warning); font-size:var(--fs-sm);">No analysis defined - first load case will be used.</div>';
    analizOnizlemeTazele();
}

function analizOnizlemeTazele() {
    const el = document.getElementById('analizOnizleme');
    if (!el) return;
    try {
        const k = analizKurulumHazirla();
        const n = Object.keys(k.nodes).length, b = Object.keys(k.elements).length;
        let t = n + ' nodes, ' + b + ' beams, ' + Object.keys(k.sections).length + ' sections\n' +
                Object.keys(k.constraints).length + ' supported nodes, ' + k.loads.length + ' point loads';
        let yayili = 0;
        Object.values(k.elements).forEach(e => { yayili += (e.lineLoads || []).length; });
        t += ', ' + yayili + ' line loads';
        if (k.uyarilar.length) {
            t += '\n\nWarnings (' + k.uyarilar.length + '):\n  ' +
                 [...new Set(k.uyarilar)].slice(0, 4).join('\n  ');
        }
        el.textContent = t;
        el.style.color = k.uyarilar.length ? 'var(--warning)' : 'var(--text-2)';
    } catch (err) {
        el.textContent = 'Cannot build: ' + err.message;
        el.style.color = 'var(--danger-text)';
    }
}

function analizKurulumHazirla() {
    if (analizTur === 'dnv') {
        const ls = document.getElementById('analizYukSec');
        return dnvModeliKur(analizVeri, { lc: ls ? ls.value : undefined });
    }
    const mid = document.getElementById('analizModelSec').value;
    const as = document.getElementById('analizAnalizSec');
    return steelModeliKur(analizVeri, mid, as ? { analiz: as.value } : {});
}

function analizIceAktarOnayla() {
    let k;
    try { k = analizKurulumHazirla(); }
    catch (err) { showToast('Import failed: ' + err.message, 'error'); return; }

    const modal = document.getElementById('analizIceAktarModal');
    if (modal) modal.remove();
    showLoading('Importing model...');

    setTimeout(() => {
        try {
            analizModeliYukle(k);
            hideLoading();
        } catch (err) {
            hideLoading();
            debugError('analysis import apply:', err);
            showToast('Import failed: ' + err.message, 'error');
        }
    }, 10);
}

// Modeli uygulamaya yaz. ID'ler dosyadan OLDUGU GIBI korunur: kullanici
// ciktiyi kaynak programla karsilastiracak, dugum numaralari tutmazsa
// karsilastirma imkansiz hale gelir.
function analizModeliYukle(k) {
    Object.keys(k.sections).forEach(ad => { SECTIONS[ad] = k.sections[ad]; });

    model.nodes = {};
    Object.keys(k.nodes).forEach(id => {
        model.nodes[id] = { id: isNaN(+id) ? id : +id, x: k.nodes[id].x, y: k.nodes[id].y, z: k.nodes[id].z || 0 };
    });
    model.elements = {};
    Object.keys(k.elements).forEach(id => {
        const e = k.elements[id];
        model.elements[id] = Object.assign({ id: isNaN(+id) ? id : +id }, e);
        if (!model.elements[id].lineLoads) model.elements[id].lineLoads = [];
    });
    model.constraints = k.constraints || {};
    model.loads = k.loads || [];
    model.pressure = [];

    // Yeni eleman/dugum eklenirse cakismasin.
    const enBuyuk = o => Object.keys(o).reduce((m, x) => Math.max(m, parseInt(x, 10) || 0), 0);
    if (typeof nextNodeId !== 'undefined') nextNodeId = enBuyuk(model.nodes) + 1;
    if (typeof nextElementId !== 'undefined') nextElementId = enBuyuk(model.elements) + 1;

    // Malzeme: dosyadaki degerler secili celik sinifina yazilir. Sessizce
    // kendi varsayilanimizi kullanmak, ithal edilen modeli baska bir malzemeyle
    // cozmek olurdu.
    const malzemeNotu = analizMalzemeUygula();

    results = null;
    if (typeof clearSelection === 'function') clearSelection();
    if (typeof updateModelSummary === 'function') updateModelSummary();
    if (typeof updateSectionDropdowns === 'function') updateSectionDropdowns();
    if (typeof updateSectionTable === 'function') updateSectionTable();
    if (typeof altTabloCiz === 'function') altTabloCiz();
    if (typeof fitView === 'function') fitView();
    if (typeof update3DScene === 'function' && currentViewMode === '3d') update3DScene();
    else if (typeof draw === 'function') draw();
    if (typeof saveState === 'function') saveState();

    const n = Object.keys(model.nodes).length, b = Object.keys(model.elements).length;
    let yayili = 0;
    Object.values(model.elements).forEach(e => { yayili += (e.lineLoads || []).length; });
    showToast('Imported ' + n + ' nodes, ' + b + ' beams, ' + model.loads.length +
              ' point loads, ' + yayili + ' line loads - ready to solve', 'success', 6000);

    if (k.uyarilar && k.uyarilar.length) {
        const tekil = [...new Set(k.uyarilar)];
        debugWarn('Import warnings:', tekil);
        showToast(tekil.length + ' import warning(s) - see Output tab', 'warning', 7000);
    }
    if (malzemeNotu) showToast(malzemeNotu, 'info', 6000);
}

// Dosyadaki malzemeyi secili celik sinifina uygular. Birden fazla malzeme
// varsa EN COK KULLANILANI alinir ve bu acikca bildirilir - cozucumuz simdilik
// model basina tek malzeme calisiyor.
function analizMalzemeUygula() {
    let mal = null, not = null;
    if (analizTur === 'dnv') {
        const say = {};
        analizVeri.kirisler.forEach(b => { say[b.malzeme] = (say[b.malzeme] || 0) + 1; });
        const enCok = Object.keys(say).sort((a, b) => say[b] - say[a])[0];
        mal = analizVeri.malzemeler[enCok];
        if (Object.keys(say).length > 1) not = 'File has ' + Object.keys(say).length +
            ' materials; used the most common (' + (mal ? mal.aciklama || mal.ad : enCok) + ')';
    } else {
        const hepsi = Object.values(analizVeri.malzemeler || {});
        mal = hepsi[0] || null;
        if (hepsi.length > 1) not = 'File defines ' + hepsi.length +
            ' materials; used "' + (mal ? mal.ad : '?') + '" for all members';
    }
    if (!mal || !(mal.E > 0)) return not;
    const secici = document.getElementById('steelGrade');
    const sinif = secici ? secici.value : 'A';
    if (typeof MATERIALS !== 'undefined' && MATERIALS[sinif]) {
        MATERIALS[sinif].E = mal.E;
        MATERIALS[sinif].G = mal.E / (2 * (1 + (mal.nu > 0 ? mal.nu : 0.3)));
        if (mal.akma > 0) MATERIALS[sinif].yield = mal.akma;
    }
    return not;
}
