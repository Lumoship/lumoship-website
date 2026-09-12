/* ============================================================================
   Report export.

   The app computes everything on screen, but a scantling check has to leave
   the screen: a spreadsheet someone can re-check a number in, and a PDF that
   can go in a file.

   Both come from ONE description of the report — `build()` returns a list of
   sections, each either a key/value block or a table — so the two exports
   cannot drift apart. Adding a row to the report means adding it once.

   Two things are carried into every export deliberately:

     - The utilisations here are required/selected. A value above 1,00 is a
       shortfall in the selected scantling, not a stress ratio, and the legend
       on every sheet says so.
     - Where this app knowingly departs from the source workbooks, the export
       says where and why. A reader who cross-checks against the old
       spreadsheets will find those numbers different, and finding out why from
       the report is better than finding out by argument.
   ============================================================================ */

window.NR467REPORT = (function () {
  'use strict';

  function n(v) { return (v === null || v === undefined || !isFinite(v)) ? null : v; }
  function f(v, dp) {
    if (v === null || v === undefined) return '—';
    if (typeof v === 'string') return v;
    if (!isFinite(v)) return '—';
    return v.toFixed(dp === undefined ? 3 : dp);
  }
  function uc(v) { return v === null || v === undefined ? '—' : v.toFixed(3); }
  function verdict(v) { return v === null || v === undefined ? '—' : (v <= 1 ? 'PASS' : 'FAIL'); }

  var UC_LEGEND = 'UC = required / selected. Above 1,00 the selected scantling is '
    + 'below the rule requirement — a shortfall, not a stress ratio.';

  /* ------------------------------------------------------------ sections -- */

  function shipSection(I) {
    var S = I.ship;
    return {
      title: 'Ship particulars', kind: 'kv', rows: [
        ['Vessel', I.vessel], ['Rules', I.rules],
        ['Prepared by', I.preparedBy || '—'], ['Revision', I.revision],
        ['L (rule length)', f(S.L, 2) + ' m'],
        ['LLL (load line length)', (n(S.LLL) > 0 ? f(S.LLL, 2) : f(S.L, 2) + ' (LLL blank, L used)') + ' m'],
        ['B', f(S.B, 2) + ' m'], ['D', f(S.D, 2) + ' m'],
        ['TSC', f(S.TSC, 2) + ' m'], ['TLC', f(S.TLC, 2) + ' m'],
        ['TF', f(S.TF, 2) + ' m'], ['TBAL', f(S.TBAL, 2) + ' m'],
        ['V', f(S.V, 1) + ' kn'],
        ['CB / CB-LC', f(S.CB, 3) + ' / ' + f(S.CB_LC, 3)],
        ['CW-LC', f(S.CW_LC, 3)],
        ['Navigation notation', S.navigation],
        ['Design load scenario', S.scenario],
        ['Assessment type', S.assessment],
        ['Bilge keel', S.bilgeKeel],
        ['Reserve thickness t_res', f(S.t_res, 2) + ' mm']
      ]
    };
  }

  function loadsSection(res, point) {
    if (!res) return null;
    var rows = res.cases.map(function (c) {
      return [c.name, f(c.Ps, 2), f(c.Pw, 2), f(c.Pex, 2),
        c.name === res.governing ? 'governing' : ''];
    });
    return {
      title: 'External pressure · Ch 5 Sec 5 [1.1]',
      note: 'Load point x = ' + f(point.x, 0) + ' mm, y = ' + f(point.y, 3)
        + ' m, z = ' + f(point.z, 3) + ' m · x/L = ' + f(res.xL, 4)
        + ' · envelope ' + f(res.PexMax, 2) + ' kN/m2 on ' + res.governing + '.',
      kind: 'table',
      head: ['Load case', 'Ps [kN/m2]', 'Pw [kN/m2]', 'Pex [kN/m2]', ''],
      rows: rows
    };
  }

  function machinerySection(res) {
    if (!res) return null;
    var rows = [];
    res.groups.forEach(function (g) {
      rows.push([g.name + (g.used ? '' : ' (not used)'), g.ref,
        uc(g.worst), verdict(g.worst)]);
    });
    return {
      title: 'Machinery space · Ch 11 Sec 2',
      note: 'Worst utilisation by group. Overall ' + res.overall + '. ' + UC_LEGEND,
      kind: 'table',
      head: ['Group', 'Rule', 'Worst UC', 'Status'],
      rows: rows
    };
  }

  function deckhouseSections(res) {
    if (!res) return [];
    var out = [];
    var st = res.structure;
    out.push({
      title: 'Deckhouse · classification', kind: 'kv', rows: [
        ['Declared type', st.declared],
        ['Rule classification', st.ruled],
        ['Agreement', st.agreement],
        ['Inboard offset per side', f(st.inboardOffset, 3) + ' m'],
        ['Limit 0,04 B', f(st.limit, 3) + ' m'],
        ['Side rule in force', st.ruled === 'superstructure'
          ? 'Ch 5 Sec 5 [5.3] — the [5.4] side rows are excluded'
          : 'Ch 5 Sec 5 [5.4] — the [5.3] rows are reference only'],
        ['hw (wave band)', f(res.hw, 3) + ' m']
      ]
    });
    out.push({
      title: 'Deckhouse · bulkhead elements and decks',
      note: 'Rows are the set the classification puts in force. ' + UC_LEGEND,
      kind: 'table',
      head: ['Element', 'Kind', 'P plate', 'P stiff', 't req', 't sel', 'UC t',
        'Z req', 'Z sel', 'UC Z', 'Status'],
      rows: res.results.rows.map(function (r) {
        var src = null;
        res.elements.concat(res.decks, res.superSides).forEach(function (e) {
          if (e.name === r.name) src = e;
        });
        return [r.name, r.kind,
          src ? f(src.Pplate !== undefined ? src.Pplate : src.Pd, 2) : '—',
          src ? f(src.Pstiff !== undefined ? src.Pstiff : src.Pd, 2) : '—',
          src ? f(src.tReq, 3) : '—',
          src ? f(src.tGross !== undefined && src.tGross ? src.tGross : src.tSel, 1) : '—',
          uc(r.UCt), src ? f(src.Zreq, 1) : '—', src ? f(src.Zsel, 1) : '—',
          uc(r.UCz), r.status];
      })
    });
    if (res.psm.length) {
      out.push({
        title: 'Deckhouse · primary supporting members',
        note: 'The attached plating is the effective breadth b_eff, not the stiffener spacing.',
        kind: 'table',
        head: ['Member', 'Model', 'S [m]', 'span [m]', 'P', 'Z req', 'Ashr req',
          'b eff [m]', 'Z eff', 'UC Z'],
        rows: res.psm.map(function (p) {
          return [p.name, p.model, f(p.S, 2), f(p.span, 2), f(p.Pcalc, 2),
            f(p.Zreq, 1), f(p.AshrReq, 2), f(p.beff, 3), f(p.Zeff, 1), uc(p.UCz)];
        })
      });
    }
    return out;
  }

  function foreSections(res) {
    if (!res) return [];
    var d = res.d, out = [];
    out.push({
      title: 'Fore part · impact loads', kind: 'kv', rows: [
        ['Bottom slamming required', d.slammingRequired
          ? 'yes (TF ' + f(d.TF, 2) + ' m < 0,04 L = ' + f(0.04 * d.L, 2) + ' m)'
          : 'no (TF ' + f(d.TF, 2) + ' m is not below 0,04 L = ' + f(0.04 * d.L, 2) + ' m)'],
        ['H · bottom slamming', f(d.Hslam, 4) + ' m (alpha ' + f(d.slamAlpha, 4) + ')'],
        ['H · bow flare', f(d.Hflare, 4) + ' m (alpha ' + f(d.flareAlpha, 4) + ')'],
        ['T_RZ', f(d.TRZ, 4) + ' s (1,2 L^0,4)'],
        ['Max P_SLI', d.slammingRequired ? f(res.maxPSLI, 2) + ' kN/m2 · ' + res.slamGoverning
          : 'not applicable'],
        ['Max P_FI', f(res.maxPFI, 2) + ' kN/m2 · ' + res.flareGoverning],
        ['P_FI for primary members', f(res.PFIforPSM, 2) + ' kN/m2'],
        ['Acceptance', 'AC-4 · Ca ' + f(res.AC.Ca, 2) + ', Cs ' + f(res.AC.Cs, 2)
          + ', Ct ' + f(res.AC.Ct, 2)]
      ]
    });
    out.push({
      title: 'Fore part · minimum scantlings',
      note: 'Ch 11 Sec 1 Tab 1 / 4 / 5. ' + UC_LEGEND,
      kind: 'table',
      head: ['Element', 'Form', 's [mm]', 'ReH', 't min', 't sel', 'UC', 'Status'],
      rows: res.plating.map(function (r) {
        return [r.name, r.kind, f(r.s, 0), f(r.ReH, 0), f(r.tMin, 3), f(r.tSel, 1),
          uc(r.UC), verdict(r.UC)];
      }).concat(res.stiffeners.map(function (r) {
        return [r.name, 'stiffener web', '—', f(r.ReH, 0), f(r.tMin, 3), f(r.twSel, 1),
          uc(r.UC), verdict(r.UC)];
      }))
    });
    var panels = res.slamPanels.concat(res.bowPanels);
    if (panels.length) {
      out.push({
        title: 'Fore part · impact panels',
        note: 'Cd divides the pressure form — it is a dynamic-load coefficient, not a safety factor.',
        kind: 'table',
        head: ['Element', 'Location', 'P', 'Cd', 'fbdg', 't req', 't sel', 'UC t',
          'Stiffener', 'Z req', 'Z sel', 'UC Z'],
        rows: panels.map(function (r) {
          return [r.name, r.location, f(r.P, 1), f(r.Cd, 2), f(r.fbdg, 0),
            f(r.tReq, 3), f(r.tSel, 1), uc(r.UCt), r.stiffener,
            f(r.Zreq, 1), f(r.Zsel, 1), uc(r.UCz)];
        })
      });
    }
    out.push({
      title: 'Fore part · floors, girders and stem',
      note: 'Dimensional rules only — no stress, bending or shear check is made on these members.',
      kind: 'table',
      head: ['Item', 'Required', 'Selected', 'Unit', 'UC', 'Status', 'Rule'],
      rows: res.floorsGirders.requirements
        .concat(res.stem.plate, res.stem.bar, res.stem.bulb)
        .map(function (r) {
          return [r.name, f(r.required, 3), f(r.selected, 3), r.unit, uc(r.UC), r.status, r.ref];
        })
    });
    out.push({
      title: 'Fore part · spacing limits',
      note: 'These are maxima, so the ratio runs the other way: actual over limit.',
      kind: 'table',
      head: ['Item', 'Limit', 'Actual', 'Unit', 'Status', 'Rule'],
      rows: res.floorsGirders.spacing.concat(res.stem.plateSpacing, res.stem.bulbSpacing)
        .map(function (r) {
          return [r.name, r.limit === null ? '—' : f(r.limit, 3), f(r.actual, 3),
            r.unit, r.status, r.ref];
        })
    });
    return out;
  }

  function aftSections(res) {
    if (!res) return [];
    var d = res.d, out = [];
    out.push({
      title: 'Aft part · stern slamming', kind: 'kv', rows: [
        ['Stern slamming applies', d.sternSlammingRequired
          ? 'yes (L ' + f(d.L, 1) + ' m is at or above 150 m)'
          : 'no (L ' + f(d.L, 1) + ' m is below 150 m) — the rule does not reach, '
            + 'which is a scope limit and not a pass'],
        ['H', f(d.Hslam, 4) + ' m (alpha fixed at ' + f(d.slamAlpha, 3) + ')'],
        ['T_RZ', f(d.TRZ, 4) + ' s (3 L^0,26 — not the fore part 1,2 L^0,4)'],
        ['Max P_SLI', d.sternSlammingRequired ? f(res.maxPSLI, 2) + ' kN/m2 · ' + res.slamGoverning
          : 'not applicable'],
        ['x/L convention', 'measured from the AFT END; h_SL is largest at the aft '
          + 'perpendicular and zero beyond x/L = 0,2'],
        ['Impact height datum', 'measured from TLC, not TF']
      ]
    });
    out.push({
      title: 'Aft part · minimum scantlings',
      note: 'Ch 11 Sec 3 Tab 1 / Tab 2. The inner bottom, deck and platform forms take the '
        + 'plate breadth b, not the stiffener spacing. ' + UC_LEGEND,
      kind: 'table',
      head: ['Element', 'Form', 's or b [mm]', 'ReH', 't min', 't sel', 'UC', 'Status'],
      rows: res.plating.map(function (r) {
        return [r.name, r.kind, f(r.s, 0), f(r.ReH, 0), f(r.tMin, 3), f(r.tSel, 1),
          uc(r.UC), verdict(r.UC)];
      }).concat(res.stiffeners.map(function (r) {
        return [r.name, 'stiffener web', '—', f(r.ReH, 0), f(r.tMin, 3), f(r.twSel, 1),
          uc(r.UC), verdict(r.UC)];
      })).concat(res.machineryPlatform ? [[res.machineryPlatform.name, 'machinery platform',
        '—', '—', f(res.machineryPlatform.required, 3), f(res.machineryPlatform.selected, 1),
        uc(res.machineryPlatform.UC), res.machineryPlatform.status]] : [])
    });
    if (res.panels.length) {
      out.push({
        title: 'Aft part · stern impact panels',
        kind: 'table',
        head: ['Element', 'Location', 'P', 'Cd', 'fbdg', 't req', 't sel', 'UC t',
          'Stiffener', 'Z req', 'Z sel', 'UC Z'],
        rows: res.panels.map(function (r) {
          return [r.name, r.location, f(r.P, 1), f(r.Cd, 2), f(r.fbdg, 0),
            f(r.tReq, 3), f(r.tSel, 1), uc(r.UCt), r.stiffener,
            f(r.Zreq, 1), f(r.Zsel, 1), uc(r.UCz)];
        })
      });
    }
    out.push({
      title: 'Aft part · peak and stern frame',
      note: 'Dimensional and arrangement rules only. The propeller post block is wired for a '
        + 'fabricated, single-screw post (Tab 3); cast and twin-screw posts use different '
        + 'coefficients.',
      kind: 'table',
      head: ['Item', 'Required', 'Selected', 'Unit', 'UC', 'Status', 'Rule'],
      rows: res.aftPeak.requirements
        .concat(res.sternFrame.shell, res.sternFrame.post, res.sternFrame.connections)
        .map(function (r) {
          return [r.name, f(r.required, 3), f(r.selected, 3), r.unit, uc(r.UC), r.status, r.ref];
        })
    });
    out.push({
      title: 'Aft part · arrangement limits',
      note: 'The side-transverse limits are in frame spacings, not metres.',
      kind: 'table',
      head: ['Item', 'Limit', 'Actual', 'Unit', 'Status', 'Rule'],
      rows: res.aftPeak.triggers.map(function (t) {
        return [t.name, '—', '—', '—', t.status, t.ref];
      }).concat(res.aftPeak.spacing.map(function (r) {
        return [r.name, r.limit === null ? '—' : f(r.limit, 3), f(r.actual, 3),
          r.unit, r.status, r.ref];
      }))
    });
    return out;
  }

  /* Everywhere this app knowingly departs from the source workbooks. A reader
     cross-checking against the old spreadsheets will hit these; better they
     read it here than discover it in a meeting. */
  function divergenceSection(S) {
    var rows = [
      ['Selected section modulus',
        'Both the fore and aft workbooks read Z_sel from a column tabulated for 740 mm x 8 mm '
        + 'attached plating, while the panels carry other spacings and plates. The combined '
        + 'modulus changes with both, so this app recomputes it for the actual panel. The effect '
        + 'is 3 to 8 per cent, always reducing the utilisation.'],
      ['Aft peak stiffener height',
        'The aft workbook computes hstf from =80*MIN(C9,5) where C9 holds label text, so Excel '
        + 'drops it and the formula always returns 5 m regardless of the length entered. This app '
        + 'uses the entered length, capped at 5 m by the rule.'],
      ['Aft peak bracket triggers',
        'The same sheet tests the bracket thresholds against a text cell, which Excel orders above '
        + 'any number, so both read REQUIRED unconditionally. This app tests the entered total '
        + 'length.'],
      ['Blank load line length',
        'A blank LLL falls through to L. Read as zero it puts the green sea deck pressure into the '
        + 'short-ship branch and understates it.'],
      ['Corrosion additions',
        'Ch 4 Sec 3 Tab 1 is read once from the rule and shared by every module. The five source '
        + 'workbooks each abridged it differently and the fore and aft ones disagreed with the '
        + 'printed table on four entries: cargo, fuel and lube oil tank, fresh water tank and '
        + 'cofferdam or void space were all 0,70 mm against the rule 0,50 mm, and a "weather deck '
        + 'exposed" entry at 1,70 mm has no counterpart in the rule at all - a weather deck is '
        + '"exposed to atmosphere" at 1,00 mm on its upper face. The deckhouse table agreed with '
        + 'the rule on all seventeen of its entries.'],
      ['Spacing rows with no numeric limit',
        'Reported as having no numeric limit rather than compared against a dash, which Excel '
        + 'always passes.']
    ];
    return {
      title: 'Where this report departs from the source workbooks',
      note: 'Each of these was verified against the workbook first: the regression harnesses '
        + 'confirm the workbook value is exactly what its own mistake produces before reporting '
        + 'the corrected one.',
      kind: 'table',
      head: ['Item', 'What differs and why'],
      rows: rows,
      wide: true
    };
  }

  function summarySection(S) {
    var rows = [];
    var m = S.res.mach;
    if (m) rows.push(['Machinery space', uc(m.governing), m.overall]);
    if (S.res.dh) rows.push(['Deckhouse',
      uc(Math.max(S.res.dh.results.worstUCt, S.res.dh.results.worstUCz)),
      S.res.dh.results.overall]);
    if (S.res.fore) rows.push(['Fore part',
      uc(Math.max(S.res.fore.results.worstPlating, S.res.fore.results.worstStiffener)),
      S.res.fore.results.overall]);
    if (S.res.aft) rows.push(['Aft part',
      uc(Math.max(S.res.aft.results.worstPlating, S.res.aft.results.worstStiffener)),
      S.res.aft.results.overall]);
    return {
      title: 'Summary', kind: 'table',
      note: UC_LEGEND,
      head: ['Module', 'Worst UC', 'Status'], rows: rows
    };
  }

  /* ---------------------------------------------------------- build ------- */
  function build(S) {
    var out = [summarySection(S), shipSection(S.inp)];
    var l = loadsSection(S.res.loads, S.point);
    if (l) out.push(l);
    var m = machinerySection(S.res.mach);
    if (m) out.push(m);
    out = out.concat(deckhouseSections(S.res.dh), foreSections(S.res.fore),
      aftSections(S.res.aft));
    out.push(divergenceSection(S));
    return out;
  }

  function stamp() {
    var d = new Date();
    function p(x) { return String(x).padStart(2, '0'); }
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate())
      + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }
  function fileBase(S) {
    var v = String(S.inp.vessel || 'NR467').replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-|-$/g, '');
    return (v || 'NR467') + '-' + String(S.inp.revision || 'Rev00');
  }

  /* ------------------------------------------------------------ XLSX ------ */
  function toXLSX(S) {
    if (typeof XLSX === 'undefined') throw new Error('the spreadsheet library did not load');
    var wb = XLSX.utils.book_new();
    var used = {};
    build(S).forEach(function (sec) {
      var aoa = [[sec.title]];
      if (sec.note) aoa.push([sec.note]);
      aoa.push([]);
      if (sec.kind === 'kv') {
        sec.rows.forEach(function (r) { aoa.push([r[0], r[1]]); });
      } else {
        aoa.push(sec.head);
        sec.rows.forEach(function (r) { aoa.push(r); });
      }
      var ws = XLSX.utils.aoa_to_sheet(aoa);
      /* Excel caps a sheet name at 31 characters and forbids a handful of
         punctuation; collisions are resolved rather than silently dropped. */
      var name = sec.title.replace(/[\\\/\?\*\[\]:]/g, ' ').slice(0, 28).trim();
      var base = name, i = 2;
      while (used[name]) { name = (base + ' ' + i).slice(0, 31); i++; }
      used[name] = true;
      XLSX.utils.book_append_sheet(wb, ws, name);
    });
    XLSX.writeFile(wb, fileBase(S) + '.xlsx');
  }

  /* ------------------------------------------------------------- PDF ------
     jsPDF's built-in fonts encode a limited character set, and anything
     outside it is dropped SILENTLY — an em dash simply vanishes and the
     sentence closes up around the gap, which is worse than an obvious box
     because nothing looks wrong. The middle dot survives; these do not, so
     they are folded to ASCII on the way into the PDF only. The spreadsheet
     keeps the real characters. */
  var PDF_SUBS = [
    [/—/g, '-'], [/–/g, '-'],          // em and en dash
    [/[‘’]/g, "'"], [/[“”]/g, '"'],
    [/≤/g, '<='], [/≥/g, '>='],
    [/²/g, '2'], [/³/g, '3'],
    [/→/g, '->'], [/°/g, ' deg'],
    [/…/g, '...']
  ];
  function pdfSafe(s) {
    var out = String(s === null || s === undefined ? '' : s);
    PDF_SUBS.forEach(function (r) { out = out.replace(r[0], r[1]); });
    return out;
  }

  function toPDF(S) {
    var ctor = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;
    if (!ctor) throw new Error('the PDF library did not load');
    var doc = new ctor({ unit: 'pt', format: 'a4', orientation: 'landscape' });
    var W = doc.internal.pageSize.getWidth();
    var H = doc.internal.pageSize.getHeight();
    var M = 36, y = 0, page = 0;
    var when = stamp();

    function footer() {
      doc.setFontSize(7).setTextColor(120);
      doc.text(pdfSafe('BV NR467 Pt B (07/2026) · not BV-approved — verify against the current rule '
        + 'text before any class submission.'), M, H - 18);
      doc.text('page ' + page, W - M, H - 18, { align: 'right' });
      doc.setTextColor(0);
    }
    function newPage() {
      if (page) footer();
      doc.addPage(); page++; y = M;
    }
    function ensure(h) { if (y + h > H - 34) newPage(); }

    /* cover */
    page = 1; y = M;
    doc.setFontSize(20).text('NR467 Local Scantlings', M, y + 10);
    doc.setFontSize(10).setTextColor(90);
    doc.text(pdfSafe(S.inp.vessel || ''), M, y + 30);
    doc.text(pdfSafe(String(S.inp.rules || '') + '  ·  ' + String(S.inp.revision || '')
      + '  ·  generated ' + when), M, y + 46);
    doc.setTextColor(0);
    y += 70;

    function heading(sec) {
      ensure(46);
      doc.setFontSize(12).text(pdfSafe(sec.title), M, y); y += 14;
      if (sec.note) {
        doc.setFontSize(8).setTextColor(90);
        var lines = doc.splitTextToSize(pdfSafe(sec.note), W - 2 * M);
        ensure(lines.length * 10 + 8);
        doc.text(lines, M, y); y += lines.length * 10 + 4;
        doc.setTextColor(0);
      }
    }

    function kv(sec) {
      heading(sec);
      doc.setFontSize(9);
      sec.rows.forEach(function (r) {
        var val = doc.splitTextToSize(pdfSafe(r[1]), W - 2 * M - 170);
        ensure(val.length * 11 + 2);
        doc.setTextColor(90).text(pdfSafe(r[0]), M, y);
        doc.setTextColor(0).text(val, M + 170, y);
        y += val.length * 11;
      });
      y += 10;
    }

    function table(sec) {
      heading(sec);
      var cols = sec.head.length;
      var avail = W - 2 * M;
      /* A two-column explanatory table wants the second column wide; anything
         else gets a first column with room for a name and equal shares after. */
      var widths;
      if (sec.wide && cols === 2) widths = [avail * 0.22, avail * 0.78];
      else {
        var first = Math.min(avail * 0.24, 150);
        var rest = (avail - first) / (cols - 1);
        widths = [first];
        for (var i = 1; i < cols; i++) widths.push(rest);
      }
      function row(cells, bold) {
        var wrapped = cells.map(function (c, i) {
          return doc.splitTextToSize(pdfSafe(c), widths[i] - 6);
        });
        var lines = Math.max.apply(null, wrapped.map(function (w) { return w.length; }));
        ensure(lines * 10 + 4);
        var x = M;
        doc.setFontSize(bold ? 8 : 8);
        if (bold) doc.setTextColor(90); else doc.setTextColor(0);
        wrapped.forEach(function (w, i) { doc.text(w, x, y); x += widths[i]; });
        doc.setTextColor(0);
        y += lines * 10 + 2;
        if (bold) {
          doc.setDrawColor(190).line(M, y - 6, W - M, y - 6);
        }
      }
      row(sec.head, true);
      sec.rows.forEach(function (r) { row(r); });
      y += 12;
    }

    build(S).forEach(function (sec) {
      if (sec.kind === 'kv') kv(sec); else table(sec);
    });
    footer();
    doc.save(fileBase(S) + '.pdf');
  }

  return { build: build, toPDF: toPDF, toXLSX: toXLSX, fileBase: fileBase };
})();
