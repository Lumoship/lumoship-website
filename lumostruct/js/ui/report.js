        // ============== CALCULATION REPORT ==============
        // Yazdirilabilir hesap raporu. Disa aktarma secenekleri JSON, CSV ve diyagram
        // goruntusuyle sinirliydi; bir muhendisin gozetmene teslim ettigi sey ise model
        // ozeti + kesitler + yukler + sonuclar + kontroller iceren tek bir belgedir.
        //
        // Yeni bir sekmede acilir ve tarayicinin yazdirma penceresi cagrilir (PDF'e
        // yazdirilabilir). Uygulama statik kaldigi icin sunucu tarafi gerekmez.

        function reportData() {
            const nodes = model.nodes || {};
            const elements = model.elements || {};
            const nodeIds = Object.keys(nodes);
            const elemList = Object.values(elements);

            let totalLength = 0, mass = 0;
            const profiles = new Map();
            elemList.forEach(el => {
                const n1 = nodes[el.n1], n2 = nodes[el.n2];
                if (!n1 || !n2) return;
                const L = Math.sqrt(Math.pow(n2.x - n1.x, 2) + Math.pow(n2.y - n1.y, 2) +
                                    Math.pow((n2.z || 0) - (n1.z || 0), 2));
                totalLength += L;
                const sec = SECTIONS[el.section];
                if (sec && sec.A > 0) mass += sec.A * L * 7850;
                if (el.section) {
                    const p = profiles.get(el.section) || { count: 0, length: 0 };
                    p.count++; p.length += L;
                    profiles.set(el.section, p);
                }
            });

            const xs = nodeIds.map(id => nodes[id].x), ys = nodeIds.map(id => nodes[id].y);
            const grade = document.getElementById('steelGrade')?.value || '-';
            const mat = (typeof MATERIALS !== 'undefined' && MATERIALS[grade]) ? MATERIALS[grade] : null;
            const lc = { value: (typeof etkinKombinasyonEtiketi === 'function') ? etkinKombinasyonEtiketi() : (document.getElementById('loadCombSelect') || {}).value };

            return {
                tarih: new Date().toLocaleString(),
                nodeCount: nodeIds.length,
                elemCount: elemList.length,
                supportCount: Object.keys(model.constraints || {}).length,
                totalLength: totalLength,
                mass: mass,
                extents: nodeIds.length
                    ? (Math.max(...xs) - Math.min(...xs)).toFixed(2) + ' x ' +
                      (Math.max(...ys) - Math.min(...ys)).toFixed(2) + ' m'
                    : '-',
                grade: grade,
                fy: mat ? (mat.yield / 1e6) : null,
                E: mat ? (mat.E / 1e6) : null,
                sigmaLimit: document.getElementById('sigmaLimit')?.value || '-',
                tauLimit: document.getElementById('tauLimit')?.value || '-',
                combination: (lc && lc.value) ? lc.value : '-',
                selfWeight: !!document.getElementById('includeSelfWeight')?.checked,
                profiles: profiles
            };
        }

        // HTML uretimi acmaktan ayri: boylece icerik pencere acmadan ve yazdirma
        // penceresini tetiklemeden test edilebiliyor.
        function buildReportHtml() {
            if (!results) return null;
            const d = reportData();
            const esc = (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const num = (v, n) => (v === null || v === undefined || isNaN(v)) ? '-' : Number(v).toFixed(n);

            const rows = (typeof beamTableRows === 'function') ? beamTableRows() : [];
            const worst = rows.slice().sort((a, b) => b.util - a.util);

            const profileRows = [...d.profiles.entries()].map(([name, p]) => {
                const s = SECTIONS[name] || {};
                return `<tr><td>${esc(name)}</td><td>${p.count}</td><td>${num(p.length, 2)}</td>
                    <td>${num((s.A || 0) * 1e4, 1)}</td><td>${num((s.Iy || 0) * 1e8, 0)}</td>
                    <td>${num((s.Wy || 0) * 1e6, 1)}</td><td>${num((s.Iz || 0) * 1e8, 1)}</td>
                    <td>${num((s.Wz || 0) * 1e6, 1)}</td>
                    <td style="text-align:left; color:#8a5a00;">${s.note ? esc(s.note) : ''}</td></tr>`;
            }).join('');

            const reactionRows = Object.entries(results.reactions || {})
                .map(([id, r]) => `<tr><td>${esc(id)}</td><td>${num(r.Fz, 2)}</td>
                    <td>${num(r.Mx, 3)}</td><td>${num(r.My, 3)}</td></tr>`).join('');

            const zarf = (typeof sonucZarfMi === 'function') && sonucZarfMi(results);
            const beamRows = worst.map(b => `<tr class="${b.util > 100 ? 'fail' : (b.util > 80 ? 'warn' : '')}">
                <td>${esc((typeof kirisEtiketi === 'function') ? kirisEtiketi(b.id) : b.id)}</td><td>${esc(b.section)}${zarf && results.elementResults[b.id] && results.elementResults[b.id].lc ? ' <span style="color:#666;">[' + esc(results.elementResults[b.id].lc) + ']</span>' : ''}</td><td>${num(b.length, 3)}</td>
                <td>${num(b.sigmaMax, 1)}</td><td>${num(b.sigmaMin, 1)}</td><td>${num(b.tauMax, 1)}</td>
                <td>${num(b.vmMax, 1)}</td><td>${num(b.mMax, 2)}</td><td>${num(b.vMax, 2)}</td>
                <td><strong>${num(b.util, 1)}</strong></td></tr>`).join('');

            const eq = results.equilibrium;
            const eqRow = eq
                ? `<tr><td>Equilibrium</td><td>${eq.ok ? 'BALANCED' : 'OFF BY ' + num(eq.error * 100, 2) + '%'}</td>
                   <td>Applied ${num(eq.appliedFz, 2)} kN, reactions ${num(eq.reactionFz, 2)} kN</td></tr>`
                : '';
            const utilMax = worst.length ? worst[0].util : 0;

            const html = `<!doctype html><html><head><meta charset="utf-8">
<title>LumoStruct - Calculation Report</title>
<style>
  body { font: 12px/1.5 -apple-system, "Segoe UI", Arial, sans-serif; color:#111; margin:28px; }
  h1 { font-size:20px; margin:0 0 2px; }
  h2 { font-size:14px; margin:24px 0 8px; border-bottom:1px solid #ccc; padding-bottom:4px; }
  .sub { color:#666; margin-bottom:16px; }
  table { border-collapse:collapse; width:100%; margin-bottom:8px; }
  th, td { border:1px solid #ccc; padding:4px 8px; text-align:right; }
  th { background:#f2f4f7; text-align:left; font-weight:600; }
  td:first-child, th:first-child, td:nth-child(2) { text-align:left; }
  .kv td:first-child { width:38%; color:#555; }
  tr.warn { background:#fff7e6; }
  tr.fail { background:#ffe9e9; font-weight:600; }
  .big { font-size:15px; font-weight:700; }
  @media print { body { margin:12mm; } h2 { page-break-after:avoid; } tr { page-break-inside:avoid; } }
</style></head><body>
<h1>Calculation Report${(typeof projeBilgisi === 'function' && projeBilgisi().ad) ? ' — ' + esc(projeBilgisi().ad) : ''}</h1>
<div class="sub">LumoStruct &middot; ${esc(d.tarih)}${(typeof projeBilgisi === 'function' && projeBilgisi().revizyon) ? ' &middot; Rev ' + esc(projeBilgisi().revizyon) : ''}</div>
${(typeof raporProjeBolumu === 'function') ? raporProjeBolumu(esc) : ''}

<h2>Model</h2>
<table class="kv">
  <tr><td>Nodes / beams</td><td>${d.nodeCount} / ${d.elemCount}</td></tr>
  <tr><td>Supported nodes</td><td>${d.supportCount}</td></tr>
  <tr><td>Total beam length</td><td>${num(d.totalLength, 2)} m</td></tr>
  <tr><td>Steel weight</td><td>${d.mass >= 1000 ? num(d.mass / 1000, 2) + ' t' : num(d.mass, 0) + ' kg'}</td></tr>
  <tr><td>Extents</td><td>${esc(d.extents)}</td></tr>
</table>
${(typeof raporGorunumBolumu === 'function') ? raporGorunumBolumu() : ''}

<h2>Material and limits</h2>
<table class="kv">
  <tr><td>Steel grade</td><td>${esc(d.grade)}${d.fy ? ' (f<sub>y</sub> = ' + num(d.fy, 0) + ' MPa)' : ''}</td></tr>
  <tr><td>Young's modulus</td><td>${num(d.E, 0)} MPa</td></tr>
  <tr><td>Normal stress limit</td><td>${esc(d.sigmaLimit)} MPa</td></tr>
  <tr><td>Shear stress limit</td><td>${esc(d.tauLimit)} MPa</td></tr>
  <tr><td>Load combination</td><td>${esc(d.combination)}</td></tr>
  <tr><td>Self weight</td><td>${d.selfWeight ? 'included' : 'not included'}</td></tr>
</table>
${(typeof raporYuklerBolumu === 'function') ? raporYuklerBolumu(esc, num) : ''}

<h2>Sections used</h2>
${(typeof hpAktifAile === 'function' && hpAktifAile().kod !== 'EN')
    ? '<p style="font-size:11px; color:#666;">Bulb profile standard: ' + esc(hpAktifAile().ad) + '</p>' : ''}
<table><thead><tr><th>Profile</th><th>Beams</th><th>Length (m)</th><th>A (cm&sup2;)</th>
  <th>I<sub>y</sub> (cm&#8308;)</th><th>W<sub>y</sub> (cm&sup3;)</th>
  <th>I<sub>z</sub> (cm&#8308;)</th><th>W<sub>z</sub> (cm&sup3;)</th><th>Note</th></tr></thead>
<tbody>${profileRows || '<tr><td colspan="9">-</td></tr>'}</tbody></table>

<h2>Summary of results</h2>
<table class="kv">
  <tr><td>Max deflection</td><td class="big">${num(results.maxDeflection * 1000, 2)} mm</td></tr>
  <tr><td>Max von Mises stress</td><td class="big">${num(results.maxVonMises, 1)} MPa</td></tr>
  <tr><td>Max moment</td><td>${num(Math.abs(results.maxMoment || 0), 2)} kN&middot;m</td></tr>
  <tr><td>Max shear</td><td>${num(Math.abs(results.maxShear || 0), 2)} kN</td></tr>
  <tr><td>Highest utilisation</td><td class="big">${num(utilMax, 1)} %</td></tr>
</table>

${(typeof raporKontrolBolumu === 'function') ? raporKontrolBolumu(esc, num, results, eqRow, utilMax, d) : `<h2>Checks</h2>
<table><thead><tr><th>Check</th><th>Result</th><th>Detail</th></tr></thead><tbody>
  ${eqRow}
  <tr><td>Utilisation</td><td>${utilMax > 100 ? 'EXCEEDED' : 'OK'}</td>
      <td>${num(utilMax, 1)} % of ${esc(d.sigmaLimit)} MPa</td></tr>
  <tr><td>Buckling (web slenderness)</td>
      <td>${esc((document.getElementById('bucklingStatus')?.textContent || '-').trim())}</td>
      <td>${esc(document.getElementById('bucklingDetail')?.textContent || '-')}</td></tr>
  <tr><td>Deflection</td>
      <td>${esc((() => { const s = (typeof sehimOzeti === 'function') ? sehimOzeti(results) : null; return !s || !s.var_ ? 'no limit' : (s.ok ? 'OK' : 'EXCEEDED'); })())}</td>
      <td>${esc((typeof sehimOzeti === 'function') ? sehimOzeti(results).metin : '-')}</td></tr>
  <tr><td>Stress limit basis</td>
      <td colspan="2">${esc((typeof kontrolAyarlari === 'function') ? (GERILME_TABANLARI[kontrolAyarlari().taban].ad + ' — ' + gerilmeSinirlariniHesapla().aciklama) : '-')}</td></tr>
</tbody></table>`}

<h2>Support reactions</h2>
<table><thead><tr><th>Node</th><th>F<sub>z</sub> (kN)</th><th>M<sub>x</sub> (kN&middot;m)</th>
  <th>M<sub>y</sub> (kN&middot;m)</th></tr></thead>
<tbody>${reactionRows || '<tr><td colspan="4">-</td></tr>'}</tbody></table>

<h2>Beam results <span style="font-weight:400; color:#666;">(sorted by utilisation)</span></h2>
<table><thead><tr><th>ID</th><th>Section</th><th>L (m)</th><th>&sigma;<sub>max</sub></th>
  <th>&sigma;<sub>min</sub></th><th>&tau;<sub>max</sub></th><th>&sigma;<sub>vm</sub></th>
  <th>M<sub>max</sub></th><th>V<sub>max</sub></th><th>Util %</th></tr></thead>
<tbody>${beamRows || '<tr><td colspan="10">-</td></tr>'}</tbody></table>
${zarf ? '<div style="color:#666; margin:-4px 0 8px;">Envelope: each beam shows the governing combination in brackets.</div>' : ''}
${(typeof raporIstasyonBolumu === 'function') ? raporIstasyonBolumu(esc, num, results) : ''}
${(typeof raporDiyagramBolumu === 'function') ? raporDiyagramBolumu(esc, num, worst, 8) : ''}

<p style="color:#666; margin-top:24px; font-size:11px;">
  Units: geometry m, deflection mm, forces kN, moments kN&middot;m, stress MPa.
  Reactions are upward positive.
</p>
</body></html>`;

            return html;
        }

        function generateReport() {
            const html = buildReportHtml();
            if (!html) {
                showToast('Solve the model before exporting a report', 'warning');
                return;
            }
            const win = window.open('', '_blank');
            if (!win) {
                showToast('Allow pop-ups to open the report', 'warning');
                return;
            }
            win.document.write(html);
            win.document.close();
            win.focus();
            setTimeout(() => { try { win.print(); } catch (e) { /* kullanici kendi yazdirir */ } }, 350);
            showToast('Report opened in a new tab');
        }
