/* ============================================================================
   Exports. The PDF is a calculation report — the full derivation chain, not a
   screenshot of the summary — and the workbook export carries one sheet per
   rule article plus the batch, so the result can be filed or checked outside
   the app.
   ============================================================================ */

window.EXPORT = (function () {
  'use strict';

  function fmt(v, dp) { return UI.fmt(v, dp); }

  /* ---------------------------------------------------------------- PDF */
  function pdf(S) {
    if (!window.jspdf || !window.jspdf.jsPDF) { UI.toast('PDF library not loaded'); return; }
    var R = S.res, I = S.inp;
    var doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4' });
    var W = 210, M = 14, y = 0, page = 0;

    function newPage() {
      if (page) doc.addPage();
      page++;
      doc.setFillColor(15, 23, 42); doc.rect(0, 0, W, 16, 'F');
      doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
      doc.text('NR615 Buckling Assessment', M, 10);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
      doc.text(I.vessel || '', W - M, 10, { align: 'right' });
      doc.setTextColor(0);
      y = 24;
    }
    function room(need) { if (y + need > 280) newPage(); }
    function title(t) {
      room(14); doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
      doc.setTextColor(37, 99, 235); doc.text(t, M, y); doc.setTextColor(0);
      doc.setDrawColor(210); doc.line(M, y + 1.5, W - M, y + 1.5);
      y += 7; doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
    }
    function sub(t) {
      room(10); doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5);
      doc.text(t, M, y); y += 5; doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
    }
    function kv(k, v, u, ref) {
      room(5);
      doc.text(String(k), M, y);
      doc.text(String(v), M + 68, y, { align: 'right' });
      if (u) doc.text(String(u), M + 71, y);
      if (ref) { doc.setTextColor(110); doc.text(String(ref), M + 95, y); doc.setTextColor(0); }
      y += 4.2;
    }
    function para(t) {
      doc.setFontSize(7.5); doc.setTextColor(90);
      var lines = doc.splitTextToSize(t, W - 2 * M);
      room(lines.length * 3.6 + 2);
      doc.text(lines, M, y); y += lines.length * 3.6 + 2;
      doc.setTextColor(0); doc.setFontSize(8);
    }
    function tableRow(cols, widths, bold, fill) {
      room(5.4);
      if (fill) { doc.setFillColor(fill[0], fill[1], fill[2]); doc.rect(M, y - 3.4, W - 2 * M, 5, 'F'); }
      doc.setFont('helvetica', bold ? 'bold' : 'normal');
      var x = M;
      cols.forEach(function (c, i) {
        var align = i === 0 ? 'left' : 'right';
        doc.text(String(c), align === 'left' ? x : x + widths[i] - 2, y, { align: align });
        x += widths[i];
      });
      doc.setFont('helvetica', 'normal');
      y += 5;
    }

    newPage();
    title('Project');
    kv('Vessel / structure', I.vessel || '—');
    kv('Applicable Rules', I.rules || '—');
    kv('Prepared by', I.preparedBy || '—');
    kv('Revision', I.revision || '—');
    kv('Date', new Date().toISOString().slice(0, 10));
    kv('Rule note', 'BV NR615 R07 (07/2026)');
    y += 2;

    title('Assessment');
    var E = S.env;
    var many = S.cases.length > 1;
    tableRow(['Quantity', 'Value', 'Reference'], [70, 40, 68], true, [235, 240, 248]);
    tableRow(['Design load sets assessed', String(S.cases.length), 'Sec 3 [1.1.3]'], [70, 40, 68]);
    tableRow(['Worst utilisation eta_act', fmt(E.worst, 4), 'Sec 1 [2.2.2]'], [70, 40, 68]);
    tableRow(['Allowable eta_all', fmt(E.etaAll, 3), 'Sec 1 [2.3.1] — from the applicable Rules'], [70, 40, 68]);
    tableRow(['Governing mode', E.governing, 'Sec 1 [2.1.1]'], [70, 40, 68]);
    if (many) tableRow(['Governing load set', E.governingCase || '—', 'Sec 3 [1.1.3]'], [70, 40, 68]);
    tableRow(['Slenderness · Sec 2', E.slenStatus + (E.slenFails ? ' (' + E.slenFails + ' fail)' : ''),
      'Sec 2 [1.1.1] — separate criterion'], [70, 40, 68]);
    tableRow(['OVERALL ASSESSMENT', E.overall, ''], [70, 40, 68], true,
      E.overall === 'PASS' ? [223, 246, 230] : [252, 228, 228]);
    y += 3;

    title('Utilisation by buckling mode' + (many ? ' — worst over all load sets' : ''));
    tableRow(['Buckling check', 'eta_act', 'eta_all', many ? 'Status / governing load set' : 'Status'],
      [86, 24, 24, 44], true, [235, 240, 248]);
    E.rows.forEach(function (r) {
      var detail = r.status === 'na' ? 'n/a'
        : r.status.toUpperCase() + ' — ' + (many && r.caseName ? r.caseName : (r.mode || ''));
      tableRow([r.name, typeof r.eta === 'number' ? fmt(r.eta, 4) : (r.status === 'na' ? 'n/a' : 'CHECK'),
        fmt(E.etaAll, 2), detail], [86, 24, 24, 44]);
    });
    y += 3;
    para('n/a means the check does not apply to this configuration and is left out of the envelope. CHECK means a '
      + 'Sec 5 [2.3.3] precondition failed: gamma_GEB at or below gamma, or sigma_ET at or below gamma sigma_a.');

    if (many) {
      title('By design load set · Sec 3 [1.1.3]');
      var lw = [46, 20, 20, 20, 20, 22, 22, 12];
      tableRow(['Load set', 'sig_x', 'sig_y', 'tau', 'P', 'Worst eta', 'Governing', ''], lw, true, [235, 240, 248]);
      S.cases.forEach(function (c, i) {
        var Rc = S.caseRes[i];
        if (!Rc) return;
        tableRow([c.name, fmt(c.sx, 1), fmt(c.sy, 1), fmt(c.tau, 1), fmt(c.P, 1),
          fmt(Rc.env.worst, 4), Rc.env.governing, Rc.env.overall], lw, false,
          Rc.env.overall === 'PASS' ? null : [252, 228, 228]);
      });
      y += 3;
      para('The derivations that follow are for "' + (S.cases[S.active] ? S.cases[S.active].name : '')
        + '", the load set selected when this report was produced.');
    }

    /* ---- inputs ---- */
    newPage();
    title('Input data');
    sub('Analysis control · Sec 1');
    kv('Method', I.method, '', 'App 2 Tab 1');
    kv('Analysis', I.analysis, '', 'Sec 3 or Sec 4');
    kv('Stiffener profile', I.profile, '', 'Sec 5 Fig 1');
    kv('Edge fixity', I.edgeFixity, '', 'Sec 5 Tab 3');
    kv('Stiffener end continuity', I.stiffEnds, '', 'Sec 5 [2.3.3]');
    kv('Stiffener end restraint', I.endRestraint, '', 'Sec 5 [2.3.4]');
    kv('Pressure side', I.pressureSide, '', 'Sec 5 [2.3.3]');
    kv('Stiffening arrangement', I.stiffArr, '', 'Sec 3 [2.1.1]');
    kv('Panel location', I.panelLocation, '', 'Sec 5 [2.1.2]');
    kv('Tab 4 cases', I.caseX + ' / ' + I.caseY + ' / ' + I.caseT, '', 'Sec 5 [2.2.3]');
    kv('S — partial safety factor', fmt(I.S, 2));
    y += 2;
    sub('Material');
    kv('E', fmt(I.E, 0), 'N/mm2'); kv('nu', fmt(I.nu, 2), '—');
    kv('ReH_P', fmt(I.ReHP, 0), 'N/mm2'); kv('ReH_S', fmt(I.ReHS, 0), 'N/mm2');
    y += 2;
    sub('Geometry — as entered (' + (R.net.gross ? 'GROSS, corrosion deducted below' : 'NET') + ')');
    kv('a', fmt(I.a, 1), 'mm'); kv('b', fmt(I.b, 1), 'mm');
    kv('tp', fmt(I.tp, 2), 'mm', 'net ' + fmt(R.net.tp, 2));
    kv('s', fmt(I.s, 1), 'mm'); kv('l', fmt(I.l, 1), 'mm');
    kv('hw x tw', fmt(I.hw, 1) + ' x ' + fmt(I.tw, 2), 'mm', 'net tw ' + fmt(R.net.tw, 2));
    kv('bf x tf', fmt(I.bf, 1) + ' x ' + fmt(I.tf, 2), 'mm', 'net tf ' + fmt(R.net.tf, 2));
    y += 2;
    sub('Applied stresses — compression and shear positive, tension negative · Sec 1 [1.2.3]');
    kv('sigma_x', fmt(I.sx, 2), 'N/mm2'); kv('sigma_y', fmt(I.sy, 2), 'N/mm2');
    kv('tau', fmt(I.tau, 2), 'N/mm2');
    kv('psi_x', fmt(I.psix, 3), '—'); kv('psi_y', fmt(I.psiy, 3), '—');
    kv('P', fmt(I.P, 2), 'kN/m2'); kv('MCL', fmt(I.MCL, 2), 'kN.m'); kv('Ftran', fmt(I.Ftran, 3), '—');

    /* ---- derivations ---- */
    var traces = [
      ['Elementary plate panel · Sec 5 [2.2]', 'plate'],
      ['Overall stiffened panel · Sec 5 [2.1]', 'panel'],
      ['Stiffener — stiffener induced (SI) · Sec 5 [2.3]', 'stiffSI'],
      ['Stiffener — plate induced (PI) · Sec 5 [2.3]', 'stiffPI']
    ];
    if (R.pillar.active) traces.push(['Struts, pillars and cross ties · Sec 5 [3.1]', 'pillar']);
    if (R.corr.active) traces.push(['Corrugated bulkhead — local buckling · Sec 5 [3.2.1]', 'corrLocal']);
    if (R.corr.colActive) traces.push(['Corrugation unit as a column · Sec 4 [3.3.2]', 'corrCol']);
    if (R.utype.active) traces.push(['U-type stiffener — local plate buckling · Sec 5 [2.5.1]', 'utype']);
    if (R.curved.active) traces.push(['Curved plate panel · Sec 5 [2.2.6]', 'curved']);
    if (R.openings.active) traces.push(['PSM web plates in way of openings · Sec 5 [2.4]', 'opening']);

    newPage();
    title('Derivations');
    traces.forEach(function (t) {
      room(20); sub(t[0]);
      var rowsOut = parseTrace(RESULTS.TRACERS[t[1]](R));
      rowsOut.forEach(function (r) {
        if (r.head) { room(7); y += 1.5; sub(r.head); }
        else kv(r.sym, r.val, r.unit === '—' ? '' : r.unit, r.ref);
      });
      y += 3;
    });

    /* ---- slenderness ---- */
    newPage();
    title('Slenderness · Sec 2');
    tableRow(['Check', 'Required', 'Actual', 'Unit', 'Status'], [64, 28, 28, 16, 42], true, [235, 240, 248]);
    R.slen.rows.forEach(function (r) {
      tableRow([r.name, r.req === null ? 'n/a' : fmt(r.req, 3), r.act === null ? 'n/a' : fmt(r.act, 3),
        r.unit || '', r.status === 'na' ? 'n/a' : r.status], [64, 28, 28, 16, 42]);
    });
    y += 3;
    para('Slenderness is a separate acceptance criterion from the buckling utilisation, Sec 2 [1.1.1]: a member may '
      + 'satisfy eta_act <= eta_all and still fail here.');

    /* ---- batch ---- */
    if (S.batch && S.batch.length) {
      newPage();
      title('Panel batch — ' + S.batch.length + ' panel' + (S.batch.length === 1 ? '' : 's'));
      para('Every row below was run through the same full Sec 5 chain as the single panel above, including the exact '
        + 'Sec 5 [2.3.3] stiffener bisection for both failure modes.');
      var w = [40, 22, 22, 22, 22, 22, 32];
      tableRow(['Panel', 'eta plate', 'eta panel', 'eta SI', 'eta PI', 'eta max', 'Governing'], w, true, [235, 240, 248]);
      var out = BATCH.solveAll(S);
      S.batch.forEach(function (row, i) {
        var o = out[i];
        function f(v) { return v === null ? 'CHECK' : fmt(v, 3); }
        tableRow([row.name, f(o.modes[0].eta), f(o.modes[1].eta), f(o.modes[2].eta), f(o.modes[3].eta),
          o.check ? '—' : fmt(o.worst, 3), o.gov], w, false,
          o.status === 'fail' ? [252, 228, 228] : null);
      });
    }

    /* ---- footer on every page ---- */
    var total = doc.internal.getNumberOfPages();
    for (var p = 1; p <= total; p++) {
      doc.setPage(p);
      doc.setFontSize(7); doc.setTextColor(130);
      doc.text('BV NR615 R07 (07/2026) · net scantlings, Sec 1 [1.2.2] · not BV-approved, verify against the current rule text',
        M, 289);
      doc.text(p + ' / ' + total, W - M, 289, { align: 'right' });
    }
    doc.save((I.vessel || 'NR615').replace(/[^\w.-]+/g, '_') + '_buckling.pdf');
    UI.toast('PDF exported');
  }

  /* The traces are already written once, as HTML, for the Results page. Rather
     than keep a second copy for the PDF, read them back out of that markup. */
  function parseTrace(htmlStr) {
    var box = document.createElement('div');
    box.innerHTML = htmlStr;
    var out = [];
    Array.prototype.forEach.call(box.querySelectorAll('tr'), function (tr) {
      if (tr.classList.contains('head')) { out.push({ head: tr.textContent.trim() }); return; }
      var td = tr.querySelectorAll('td');
      if (td.length < 4) return;
      out.push({
        sym: td[0].textContent.trim(), val: td[1].textContent.trim(),
        unit: td[2].textContent.trim(), ref: td[3].textContent.trim()
      });
    });
    return out;
  }

  /* -------------------------------------------------------------- Excel */
  function excel(S) {
    if (!window.XLSX) { UI.toast('Excel library not loaded'); return; }
    var R = S.res, I = S.inp;
    var wb = XLSX.utils.book_new();

    function sheet(name, aoa) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), name.slice(0, 31));
    }
    function traceAOA(key) {
      return [['Symbol', 'Value', 'Unit', 'Reference']].concat(
        parseTrace(RESULTS.TRACERS[key](R)).map(function (r) {
          return r.head ? [r.head, '', '', ''] : [r.sym, r.val, r.unit, r.ref];
        }));
    }

    var inputs = [['NR615 Buckling — inputs'], [], ['Key', 'Value']];
    Object.keys(I).forEach(function (k) { inputs.push([k, I[k]]); });
    sheet('Inputs', inputs);

    var E = S.env;
    sheet('Envelope', [['Buckling check', 'eta_act', 'eta_all', 'Status', 'Governing load set', 'Mode', 'Reference']]
      .concat(E.rows.map(function (r) {
        return [r.name, typeof r.eta === 'number' ? r.eta : (r.status === 'na' ? 'n/a' : 'CHECK'),
          E.etaAll, r.status === 'na' ? 'n/a' : r.status.toUpperCase(), r.caseName || '', r.mode, r.ref];
      }))
      .concat([[], ['Worst utilisation', E.worst], ['Governing mode', E.governing],
      ['Governing load set', E.governingCase || ''],
      ['Design load sets assessed', S.cases.length],
      ['Slenderness · Sec 2', E.slenStatus], ['OVERALL', E.overall]]));

    sheet('Load sets', [['Load set', 'sig_x', 'sig_y', 'tau', 'psi_x', 'psi_y', 'P', 'MCL',
      'eta plate', 'eta panel', 'eta SI', 'eta PI', 'Worst eta', 'Governing', 'Status']]
      .concat(S.cases.map(function (c, i) {
        var Rc = S.caseRes[i];
        if (!Rc) return [c.name];
        return [c.name, c.sx, c.sy, c.tau, c.psix, c.psiy, c.P, c.MCL,
          Rc.plate.eta, Rc.panel.eta,
          Rc.stiff.SI.na ? 'CHECK' : Rc.stiff.SI.eta, Rc.stiff.PI.na ? 'CHECK' : Rc.stiff.PI.eta,
          Rc.env.worst, Rc.env.governing, Rc.env.overall];
      })));

    sheet('Plate', traceAOA('plate'));
    sheet('Overall Panel', traceAOA('panel'));
    sheet('Stiffener SI', traceAOA('stiffSI'));
    sheet('Stiffener PI', traceAOA('stiffPI'));
    if (R.pillar.active) sheet('Pillar', traceAOA('pillar'));
    if (R.corr.active) sheet('Corrugation', traceAOA('corrLocal'));
    if (R.corr.colActive) sheet('Corrugation Column', traceAOA('corrCol'));
    if (R.utype.active) sheet('U-type', traceAOA('utype'));
    if (R.curved.active) sheet('Curved', traceAOA('curved'));
    if (R.openings.active) sheet('Openings', traceAOA('opening'));

    sheet('Slenderness', [['Check', 'Required', 'Actual', 'Unit', 'Status', 'Rule']]
      .concat(R.slen.rows.map(function (r) {
        return [r.name, r.req === null ? 'n/a' : r.req, r.act === null ? 'n/a' : r.act, r.unit, r.status, r.ref];
      })));

    if (S.batch && S.batch.length) {
      var out = BATCH.solveAll(S);
      var hdr = NRIN.BATCH_FIELDS.map(function (f) { return f.label + (f.unit ? ' [' + f.unit + ']' : ''); })
        .concat(['alpha', 'Cx', 'Cy', 'C_tau', 'eta plate', 'eta panel', 'eta SI', 'eta PI', 'eta max', 'Governing', 'Status']);
      var body = S.batch.map(function (row, i) {
        var o = out[i];
        function f(v) { return v === null ? 'CHECK' : v; }
        return NRIN.BATCH_FIELDS.map(function (fl) { return row[fl.k]; })
          .concat([o.R.coef.alpha, o.R.plate.Cx, o.R.plate.Cy, o.R.plate.Ctau,
            f(o.modes[0].eta), f(o.modes[1].eta), f(o.modes[2].eta), f(o.modes[3].eta),
            o.check ? 'CHECK' : o.worst, o.gov, o.status.toUpperCase()]);
      });
      sheet('Batch', [hdr].concat(body));
    }

    XLSX.writeFile(wb, (I.vessel || 'NR615').replace(/[^\w.-]+/g, '_') + '_buckling.xlsx');
    UI.toast('Workbook exported');
  }

  return { pdf: pdf, excel: excel };
})();
