/* ============================================================================
   Read an existing NR615_Buckling_Assessment.xlsx straight into the app.

   The workbook keeps every input in a known cell, so the mapping below is just
   that address book: sheet, cell, input key. Anything the workbook does not
   carry — the sweep limits, which are new here — keeps its current value.

   Values are validated against the dropdown lists before they are accepted, so
   a workbook that has drifted (a renamed option, a formula where a constant
   belongs) reports what it could not read instead of silently loading a wrong
   setting.
   ============================================================================ */

window.IMPORT = (function () {
  'use strict';

  /* sheet -> [cell, key, kind] where kind is 'num', 'txt' or an OPTIONS name */
  var MAP = {
    Cover: [
      ['C8', 'vessel', 'txt'], ['C11', 'rules', 'txt'],
      ['C12', 'preparedBy', 'txt'], ['C13', 'revision', 'txt']
    ],
    Inputs: [
      ['C9', 'method', 'method'], ['C10', 'analysis', 'analysis'], ['C11', 'profile', 'profile'],
      ['C12', 'edgeFixity', 'edgeFixity'], ['C13', 'stiffEnds', 'stiffEnds'],
      ['C14', 'pressureSide', 'pressureSide'], ['C15', 'etaAll', 'num'], ['C16', 'S', 'num'],
      ['C20', 'E', 'num'], ['C21', 'nu', 'num'], ['C22', 'ReHP', 'num'], ['C23', 'ReHS', 'num'],
      ['C27', 'a', 'num'], ['C28', 'b', 'num'], ['C29', 'thickBasis', 'thickBasis'],
      ['C30', 'tcP', 'num'], ['C31', 'tcS', 'num'], ['C32', 'tp', 'num'],
      ['C33', 's', 'num'], ['C34', 'l', 'num'],
      ['C38', 'hw', 'num'], ['C39', 'tw', 'num'], ['C40', 'bf', 'num'], ['C41', 'tf', 'num'],
      ['C42', 'df', 'num'], ['C43', 'flangeType', 'flangeType'], ['C44', 'bfOutManual', 'num'],
      ['C45', 'b1u', 'num'], ['C46', 'b2u', 'num'],
      ['C50', 'sx', 'num'], ['C51', 'sy', 'num'], ['C52', 'tau', 'num'],
      ['C53', 'psix', 'num'], ['C54', 'psiy', 'num'], ['C55', 'P', 'num'],
      ['C56', 'MCL', 'num'], ['C57', 'Ftran', 'num'],
      ['C79', 'beffB1', 'num'], ['C80', 'beffB2', 'num'],
      ['C84', 'endRestraint', 'endRestraint'], ['C89', 'panelLocation', 'panelLocation'],
      ['C94', 'applyCtCap', 'applyCtCap'], ['C99', 'cUtype', 'num'],
      ['C104', 'stiffArr', 'stiffArr'], ['C109', 'syStiffPlating', 'num'],
      ['C114', 'brackets', 'brackets'], ['C115', 'bracketSpacing', 'num'],
      ['C120', 'caseX', 'caseX'], ['C121', 'caseY', 'caseY'], ['C122', 'caseT', 'caseT'],
      ['C123', 'upModel', 'upModel'], ['C124', 'openDa', 'num'], ['C125', 'openDb', 'num']
    ],
    Slenderness: [
      ['C19', 'lBdg', 'num'], ['C20', 'sPsm', 'num'], ['C23', 'iPsm', 'num'],
      ['C29', 'wsArrangement', 'wsArrangement'], ['C30', 'lWs', 'num'], ['C31', 'sWs', 'num'],
      ['C32', 'twPsm', 'num'], ['C33', 'aEffWs', 'num'], ['C34', 'iWs', 'num'],
      ['F39', 'bracketsApplicable', 'bracketsApplicable'],
      ['C40', 'bfPsm', 'num'], ['C41', 'afPsm', 'num'], ['C42', 'awPsm', 'num'],
      ['C43', 'db', 'num'], ['C44', 'lb', 'num'], ['C45', 'tb', 'num'],
      ['C46', 'sbActual', 'num'], ['C47', 'hwEdge', 'num'],
      ['C48', 'flangeSym', 'flangeSym'], ['C49', 'bracketLocation', 'bracketLocation'],
      ['C50', 'bracketType', 'bracketType'], ['C51', 'edgeStiffFitted', 'edgeStiffFitted']
    ],
    'Pillar-Corr': [
      ['C9', 'pillarA', 'num'], ['C10', 'pillarI', 'num'], ['C11', 'pillarL', 'num'],
      ['C13', 'pillarEnd', 'pillarEnd'], ['C15', 'pillarSigma', 'num'],
      ['C20', 'pillarSigmaET', 'num'], ['C21', 'pillarSigmaETF', 'num'],
      ['C28', 'pillarR', 'num'], ['C29', 'pillarT', 'num'],
      ['C35', 'corrB1', 'num'], ['D35', 'corrB2', 'num'],
      ['C36', 'corrT1', 'num'], ['D36', 'corrT2', 'num'],
      ['C37', 'corrSx1', 'num'], ['D37', 'corrSx2', 'num'],
      ['C38', 'corrSy1', 'num'], ['D38', 'corrSy2', 'num'],
      ['C39', 'corrTau1', 'num'], ['D39', 'corrTau2', 'num'],
      ['C65', 'corrBf', 'num'], ['C66', 'corrBw', 'num'], ['C67', 'corrTf', 'num'],
      ['C68', 'corrTw', 'num'], ['C69', 'corrPhi', 'num'], ['C70', 'corrL', 'num'],
      ['C71', 'corrSigmaAv', 'num'], ['C72', 'corrStool', 'corrStool']
    ],
    Curved: [
      ['C8', 'curvR', 'num'], ['C9', 'curvT', 'num'], ['C10', 'curvD', 'num'],
      ['C11', 'curvSax', 'num'], ['C12', 'curvStg', 'num'], ['C13', 'curvTau', 'num']
    ],
    Openings: [
      ['C9', 'opConfig', 'opConfig'], ['C10', 'opModelled', 'opModelled'],
      ['C11', 'opMethod', 'opMethod'], ['C12', 'opCase17', 'opCase17'],
      ['C15', 'opA1', 'num'], ['D15', 'opA2', 'num'],
      ['C16', 'opB1', 'num'], ['D16', 'opB2', 'num'],
      ['C17', 'opTw1', 'num'], ['D17', 'opTw2', 'num'],
      ['C18', 'opSav1', 'num'], ['D18', 'opSav2', 'num'],
      ['C19', 'opTav1', 'num'], ['D19', 'opTav2', 'num'],
      ['C20', 'opDa', 'num'], ['D20', 'opDb', 'num'],
      ['C21', 'opH', 'num'], ['C22', 'opH0', 'num']
    ]
  };

  /* Panels sheet: rows 8..27, one batch row each. ReH_S has no column there —
     the workbook batch carried only ReH_P — so it falls back to the main set. */
  var PANEL_COLS = [
    ['B', 'name', 'txt'], ['C', 'location', 'txt'],
    ['D', 'a'], ['E', 'b'], ['F', 'tp'], ['G', 's'], ['H', 'l'],
    ['I', 'profile', 'profile'], ['J', 'hw'], ['K', 'tw'], ['L', 'bf'], ['M', 'tf'],
    ['O', 'sx'], ['P', 'sy'], ['Q', 'tau'], ['R', 'psix'], ['S', 'psiy'],
    ['T', 'ReHP'], ['U', 'P']
  ];
  var PANEL_FIRST = 8, PANEL_LAST = 27;

  function cell(ws, addr) {
    if (!ws) return undefined;
    var c = ws[addr];
    if (!c) return undefined;
    /* Prefer the cached value: a cell holding a formula still carries what
       Excel last computed, which is what we want to read. */
    return c.v;
  }

  function read(wb, target, notes) {
    var got = 0;
    Object.keys(MAP).forEach(function (sheetName) {
      var ws = wb.Sheets[sheetName];
      if (!ws) { notes.push('Sheet "' + sheetName + '" is missing — those inputs kept their current values.'); return; }
      MAP[sheetName].forEach(function (m) {
        var addr = m[0], key = m[1], kind = m[2];
        var v = cell(ws, addr);
        if (v === undefined || v === null || v === '') return;
        if (kind === 'num') {
          var num = parseFloat(v);
          if (!isFinite(num)) { notes.push(sheetName + '!' + addr + ' (' + key + ') is not a number: "' + v + '"'); return; }
          target[key] = num; got++;
        } else if (kind === 'txt') {
          target[key] = String(v); got++;
        } else {
          var opts = NRIN.OPTIONS[kind] || [];
          var s = String(v).trim();
          var hit = opts.filter(function (o) { return o === s; })[0];
          if (!hit) {
            /* Tolerate case and spacing drift before giving up on the value. */
            var loose = s.toLowerCase().replace(/\s+/g, ' ');
            hit = opts.filter(function (o) { return o.toLowerCase().replace(/\s+/g, ' ') === loose; })[0];
          }
          if (!hit) { notes.push(sheetName + '!' + addr + ' (' + key + ') is not a known option: "' + s + '"'); return; }
          target[key] = hit; got++;
        }
      });
    });
    return got;
  }

  function readPanels(wb, base, notes) {
    var ws = wb.Sheets.Panels;
    if (!ws) { notes.push('Sheet "Panels" is missing — the batch was left alone.'); return null; }
    var rowsOut = [];
    for (var r = PANEL_FIRST; r <= PANEL_LAST; r++) {
      var row = NRIN.batchRow(rowsOut.length + 1, base);
      var any = false;
      PANEL_COLS.forEach(function (c) {
        var v = cell(ws, c[0] + r);
        if (v === undefined || v === null || v === '') return;
        if (c[2] === 'txt') { row[c[1]] = String(v); if (String(v).trim() && String(v) !== '—') any = true; }
        else if (c[2] === 'profile') {
          var s = String(v).trim();
          if (NRIN.OPTIONS.profile.indexOf(s) >= 0) { row.profile = s; any = true; }
          else notes.push('Panels!' + c[0] + r + ' profile is not a known option: "' + s + '"');
        } else {
          var num = parseFloat(v);
          if (isFinite(num)) { row[c[1]] = num; any = true; }
        }
      });
      /* A row only counts as present when it carries real geometry — the
         workbook left its unused rows populated with placeholder text. */
      if (any && row.a > 0 && row.b > 0 && row.tp > 0) rowsOut.push(row);
    }
    if (!rowsOut.length) { notes.push('No usable rows found on the Panels sheet — the batch was left alone.'); return null; }
    return rowsOut;
  }

  /* Entry point: an ArrayBuffer from the file input. */
  function fromBuffer(buf) {
    if (!window.XLSX) throw new Error('the workbook library did not load');
    var wb = XLSX.read(new Uint8Array(buf), { type: 'array' });
    var notes = [];
    var target = NRIN.defaults();
    var got = read(wb, target, notes);
    if (!got) throw new Error('this does not look like an NR615 assessment workbook');
    var batch = readPanels(wb, target, notes);
    return { inp: target, batch: batch, count: got, notes: notes, sheets: wb.SheetNames };
  }

  function handleFile(ev) {
    var f = ev.target.files && ev.target.files[0];
    if (!f) return;
    var r = new FileReader();
    r.onload = function () {
      var res;
      try { res = fromBuffer(r.result); }
      catch (e) { UI.toast('Could not read that workbook: ' + e.message); ev.target.value = ''; return; }
      UI.applyImport(res, f.name);
      ev.target.value = '';
    };
    r.readAsArrayBuffer(f);
  }

  return { fromBuffer: fromBuffer, handleFile: handleFile, MAP: MAP, PANEL_COLS: PANEL_COLS };
})();
