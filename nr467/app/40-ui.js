/* ============================================================================
   Application shell. Five pages: the ship particulars every module shares, the
   external pressure engine at a chosen load point, the machinery space module,
   the deckhouse module, and a combined results page.

   Fore and Aft are not built yet — see STATUS.md. The wizard grows as they
   land; nothing here assumes how many modules there are.
   ============================================================================ */

window.UI = (function () {
  'use strict';

  var S = {
    inp: NRIN.defaults(),
    point: { x: 61060, y: 7.95, z: 1.3245, Bx: 0 },
    page: 1,
    res: {},
    open: {}
  };

  var PAGES = [
    { n: 1, label: 'Ship' },
    { n: 2, label: 'Loads' },
    { n: 3, label: 'Machinery' },
    { n: 4, label: 'Deckhouse' },
    { n: 5, label: 'Fore part' },
    { n: 6, label: 'Aft part' },
    { n: 7, label: 'Results' }
  ];

  /* ------------------------------------------------------------ helpers */
  function esc(s) {
    return String(s === undefined || s === null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function fmt(v, dp) {
    if (v === null || v === undefined) return '—';
    if (typeof v === 'string') return v;
    if (!isFinite(v)) return '—';
    if (v !== 0 && (Math.abs(v) >= 1e7 || Math.abs(v) < 1e-4)) return v.toExponential(3);
    var d = dp === undefined ? (Math.abs(v) >= 100 ? 2 : Math.abs(v) >= 1 ? 3 : 4) : dp;
    return v.toFixed(d);
  }
  /* These modules check MINIMA, so the utilisation is required/selected and
     1.00 is the limit — the same banding as elsewhere, different meaning. */
  function band(u) {
    if (u === null || u === undefined) return 'na';
    if (u > 1) return 'over';
    if (u > 0.9) return 'near';
    return 'ok';
  }
  function toast(msg) {
    var t = document.getElementById('toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(t._h); t._h = setTimeout(function () { t.classList.remove('show'); }, 2200);
  }

  /* ---------------------------------------------------- generated forms */
  function field(path, label, unit, help, opts, step) {
    var v = get(path);
    var h = '<div class="ea-field"><label class="ea-label"' + (help ? ' title="' + esc(help) + '"' : '') + '>'
      + esc(label) + (unit ? ' <span style="color:var(--text-muted);text-transform:none">[' + esc(unit) + ']</span>' : '')
      + '</label>';
    if (opts) {
      h += '<select class="ea-select" data-path="' + path + '">'
        + opts.map(function (o) {
          return '<option value="' + esc(o) + '"' + (String(o) === String(v) ? ' selected' : '') + '>' + esc(o) + '</option>';
        }).join('') + '</select>';
    } else if (typeof v === 'string' && isNaN(parseFloat(v))) {
      h += '<input type="text" class="ea-input" data-path="' + path + '" value="' + esc(v) + '">';
    } else {
      h += '<input type="number" step="' + (step || 'any') + '" class="ea-input" data-path="' + path
        + '" value="' + esc(v) + '">';
    }
    return h + '</div>';
  }
  function get(path) {
    return path.split('.').reduce(function (o, k) { return o == null ? undefined : o[k]; }, S);
  }
  function set(path, val) {
    var parts = path.split('.'), last = parts.pop();
    var o = parts.reduce(function (a, k) { return a[k]; }, S);
    o[last] = val;
  }
  function grid(cols, fields) {
    var cls = cols === 2 ? 'ea-form-row' : cols === 4 ? 'ea-form-row-4' : 'ea-form-row-3';
    var out = '', i;
    for (i = 0; i < fields.length; i += cols) {
      out += '<div class="' + cls + '" style="margin-bottom:var(--spacing-md)">'
        + fields.slice(i, i + cols).join('') + '</div>';
    }
    return out;
  }
  function panel(title, body, icon) {
    return '<div class="ea-panel"><div class="ea-panel-header"><div class="ea-panel-icon'
      + (icon ? ' ' + icon : '') + '"></div><span class="ea-panel-title">' + esc(title)
      + '</span></div><div class="ea-panel-body">' + body + '</div></div>';
  }
  /* Typing into a live-recalculating form is fiddlier than it looks, and two
     things have to be handled or decimals cannot be entered at all:

       - A number input reports value "" while it holds a half-typed number
         such as "2.", and that is indistinguishable from a cleared field by
         value alone. validity.badInput tells them apart: it is true only for
         the half-typed case, so leave the model as it is and wait.
       - Re-rendering the page writes the MODEL value back into the field, so
         a rebuild between keystrokes normalises "2." to "2" and the next digit
         lands as "28". Holding the rebuild off until typing pauses lets the
         field keep the text the user is actually entering.

     The verdict strip sits outside the page body, so it stays live either way. */
  function bind(root) {
    Array.prototype.forEach.call(root.querySelectorAll('[data-path]'), function (el) {
      var isSelect = el.tagName === 'SELECT';
      el.addEventListener(isSelect ? 'change' : 'input', function () {
        if (el.type === 'number' && el.value === '' && el.validity && el.validity.badInput) return;
        set(el.getAttribute('data-path'),
          el.type === 'number' ? (el.value === '' ? 0 : parseFloat(el.value)) : el.value);
        recalc(isSelect);
      });
      /* Leaving the field settles it immediately rather than after the pause. */
      if (!isSelect) el.addEventListener('blur', function () { recalc(true); });
    });
  }

  /* --------------------------------------------------------- page 1 ---- */
  function buildShip() {
    var O = NRIN.OPTIONS, p = 'inp.ship.';
    var issues = NRIN.checkShip(S.inp.ship);
    var errors = issues.filter(function (i) { return i.level === 'error'; });
    var notice = '';
    if (issues.length) {
      notice = '<div style="margin-bottom:var(--spacing-lg)">'
        + panel(errors.length ? 'Check these particulars' : 'Worth a look',
          issues.map(function (i) {
            return '<div class="nr-hint"><b class="' + (i.level === 'error' ? 'fail' : '') + '">'
              + esc(i.field) + '</b> — ' + esc(i.message) + '</div>';
          }).join(''),
          errors.length ? 'warning' : 'orange')
        + '</div>';
    }
    return notice
      + '<div class="nr-hint" style="margin-bottom:var(--spacing-md)">Entered once here and read by every '
      + 'module. In the workbooks this block was repeated five times and kept in step by hand.</div>'
      + '<div class="nr-two">'
      + panel('Principal particulars', grid(3, [
        field(p + 'L', 'L', 'm', 'Rule length'),
        field(p + 'LLL', 'LLL', 'm', 'Load line length · Ch 1 Sec 3 [2.1.2]. The deckhouse deck x/L uses this; leave 0 and it falls back to L'),
        field(p + 'B', 'B', 'm', 'Moulded breadth'),
        field(p + 'D', 'D', 'm', 'Moulded depth'),
        field(p + 'TSC', 'TSC', 'm', 'Scantling draught'),
        field(p + 'V', 'V', 'kn', 'Service speed')
      ]))
      + panel('Loading condition', grid(3, [
        field(p + 'TLC', 'TLC', 'm', 'Draught at the considered loading condition'),
        field(p + 'TF', 'TF', 'm', 'Minimum forward draught — fore part module; governs whether slamming applies'),
        field(p + 'TBAL', 'TBAL', 'm', 'Ballast draught'),
        field(p + 'CB', 'CB', '—', 'Block coefficient at TSC'),
        field(p + 'CB_LC', 'CB-LC', '—', 'Block coefficient at the considered condition'),
        field(p + 'CW_LC', 'CW-LC', '—', 'Waterplane coefficient at the considered condition')
      ]), 'cyan')
      + '</div>'
      + '<div style="margin-top:var(--spacing-lg)" class="nr-two">'
      + panel('Navigation and scenario', grid(2, [
        field(p + 'navigation', 'Navigation notation', '', 'Sets A0, A1, e1, A2, e2 and Lc — Ch 5 Sec 3 Tab 1', O.navigation),
        field(p + 'scenario', 'Design load scenario', '', 'Extreme sea gives fps = 1.0; ballast water exchange gives 0.8', O.scenario),
        field(p + 'assessment', 'Assessment type', '', 'Prescriptive puts a 2.5 kN/m2 floor under Pex', O.assessment),
        field(p + 'bilgeKeel', 'Bilge keel fitted', '', 'fBK = 1.0 fitted, 1.2 not fitted', O.yesNo)
      ]), 'purple')
      + panel('Stability and material', grid(3, [
        field(p + 'gmMode', 'GM', '', 'Auto takes 0.07 B, or 0.12 B for a tanker or bulker', O.autoMode),
        field(p + 'GM', 'GM value', 'm', 'Used only when GM is Manual'),
        field(p + 'shipGroup', 'Ship group', '', 'Drives the automatic GM fraction', O.shipGroup),
        field(p + 'krMode', 'kr', '', 'Auto takes 0.35 B', O.autoMode),
        field(p + 'kr', 'kr value', 'm', 'Used only when kr is Manual'),
        field(p + 't_res', 't_res', 'mm', 'Reserve thickness')
      ]), 'orange')
      + '</div>';
  }

  /* --------------------------------------------------------- page 2 ---- */
  function buildLoads() {
    var R = S.res.loads;
    var pt = 'point.';
    var head = panel('Load point · Ch 5 Sec 5 [1.1]', grid(4, [
      field(pt + 'x', 'x', 'mm', 'Longitudinal position in model coordinates'),
      field(pt + 'y', 'y', 'm', 'Transverse position, positive to portside'),
      field(pt + 'z', 'z', 'm', 'Vertical position from the baseline'),
      field(pt + 'Bx', 'Bx', 'm', 'Local waterline breadth at this section; leave 0 to use B')
    ]) + (R ? '<div class="nr-hint">x/L = ' + fmt(R.xL, 4) + ' · fyB = ' + fmt(R.fyB, 4)
      + ' · fzT = ' + fmt(R.fzT, 4) + ' · Bx used = ' + fmt(R.Bx, 2) + ' m'
      + ' · roll angle theta = ' + fmt(R.d.theta, 3) + ' deg · TR = ' + fmt(R.d.TR, 4) + '</div>' : ''), 'cyan');

    if (!R) return head + '<div class="nr-hint">Coefficient tables are still loading.</div>';

    var edwRows = Object.keys(R.edw).map(function (k) {
      var e = R.edw[k];
      return '<tr><td style="text-align:left">' + esc(e.key) + '</td>'
        + '<td style="text-align:left;color:var(--text-secondary);font-family:var(--font-body)">' + esc(e.label) + '</td>'
        + '<td>' + fmt(e.alpha, 4) + '</td><td>' + fmt(e.Lref, 2) + '</td><td>' + fmt(e.H, 5) + '</td>'
        + '<td>' + fmt(e.fbeta, 2) + '</td><td>' + fmt(e.fnl, 4) + '</td>'
        + '<td>' + fmt(e.PCL, 3) + '</td><td>' + fmt(e.PBLwea, 3) + '</td><td>' + fmt(e.PWLwea, 3) + '</td>'
        + '<td>' + fmt(e.PBLlee, 3) + '</td><td>' + fmt(e.PWLlee, 3) + '</td></tr>';
    }).join('');

    var caseRows = R.cases.map(function (c) {
      var gov = c.name === R.governing;
      return '<tr' + (gov ? ' class="highlight"' : '') + '><td style="text-align:left">' + esc(c.name)
        + (gov ? ' <span class="badge badge-blue">governing</span>' : '') + '</td>'
        + '<td>' + esc(c.edw) + '</td><td>' + esc(c.side) + '</td>'
        + '<td>' + (c.weather ? 'weather' : 'lee') + '</td>'
        + '<td>' + fmt(c.Ps, 3) + '</td><td>' + fmt(c.Pw, 3) + '</td>'
        + '<td class="' + (gov ? 'cyan' : '') + '">' + fmt(c.Pex, 3) + '</td></tr>';
    }).join('');

    return head
      + '<div style="margin-top:var(--spacing-lg)"><div class="ea-section-title">Equivalent design waves · Ch 5 Sec 5 Tab 9 to Tab 20</div>'
      + '<div class="ea-table-wrap"><table class="ea-table"><thead><tr>'
      + '<th style="text-align:left">EDW</th><th style="text-align:left">Wave</th><th>alpha</th><th>Lref [m]</th>'
      + '<th>H [m]</th><th>fbeta</th><th>fnl</th><th>PCL</th><th>PBL wea</th><th>PWL wea</th>'
      + '<th>PBL lee</th><th>PWL lee</th></tr></thead><tbody>' + edwRows + '</tbody></table></div></div>'
      + '<div style="margin-top:var(--spacing-lg)"><div class="ea-section-title">External pressure · 24 strength load cases</div>'
      + '<div class="ea-table-wrap"><table class="ea-table"><thead><tr>'
      + '<th style="text-align:left">Load case</th><th>EDW</th><th>Side</th><th>At point</th>'
      + '<th>Ps [kN/m2]</th><th>Pw [kN/m2]</th><th>Pex [kN/m2]</th></tr></thead><tbody>'
      + caseRows + '</tbody></table></div>'
      + '<div class="nr-hint">Pex envelope <b>' + fmt(R.PexMax, 3) + ' kN/m2</b>, governing '
      + esc(R.governing) + '. The weather side is set by the load case, not by the point: a -P case has the wave '
      + 'onto the port side and a -S case onto starboard.</div></div>';
  }

  /* --------------------------------------------------------- page 3 ---- */
  function buildMachinery() {
    var O = NRIN.OPTIONS, p = 'inp.mach.', R = S.res.mach;
    var top = '<div class="nr-two">'
      + panel('Engine data · from the manufacturer', grid(4, [
        field(p + 'P', 'P', 'kW', 'Maximum continuous rating'),
        field(p + 'nr', 'nr', 'rpm', 'Rated speed'),
        field(p + 'LE', 'LE', 'm', 'Effective length available for bolting, not the overall engine length'),
        field(p + 'nG', 'nG', '—', 'Number of longitudinal members under the bedplate being checked')
      ]) + '<div class="nr-hint">Tab 3 scales directly with P/(nr LE) = <b>' + fmt(R.drive, 4) + '</b>.</div>')
      + panel('Configuration', grid(3, [
        field(p + 'location', 'Machinery space location', '', 'Switches every Tab 1 and Tab 2 minimum. A space aft is outside 0.4L', O.machLocation),
        field(p + 'bottomType', 'Bottom type', '', 'Selects which bottom sheet governs the envelope', O.bottomType),
        field(p + 'ReH', 'ReH, bottom structure', 'MPa', 'Material factor k comes from Ch 4 Sec 1 Tab 2', O.reH)
      ]) + '<div class="nr-hint">k = <b>' + fmt(R.k, 3) + '</b> · L0 = ' + fmt(R.L0, 2) + ' m</div>', 'cyan')
      + '</div>';

    /* [3.3.3] single member test */
    var mt = R.memberTest;
    var mtRows = mt.rows.map(function (r) {
      return '<tr><td style="text-align:left">' + esc(r.name) + '</td><td>' + fmt(r.value, 2) + '</td>'
        + '<td>' + fmt(r.limit, 2) + '</td><td class="' + (r.ok ? 'ok' : 'fail') + '">'
        + (r.ok ? 'OK' : 'NO') + '</td></tr>';
    }).join('');
    var test = '<div style="margin-top:var(--spacing-lg)">'
      + panel('Single longitudinal member test · Ch 11 Sec 2 [3.3.3]',
        '<div class="ea-table-wrap"><table class="ea-table"><thead><tr><th style="text-align:left">Condition</th>'
        + '<th>Value</th><th>Limit</th><th>Pass</th></tr></thead><tbody>' + mtRows + '</tbody></table></div>'
        + '<div class="nr-hint">All three must pass. One longitudinal member allowed: <b>'
        + (mt.allowed ? 'YES' : 'NO — use two or more') + '</b>. Two Tab 3 rows depend on this.</div>',
        mt.allowed ? 'success' : 'warning') + '</div>';

    /* selected scantlings + results, per group */
    var groups = R.groups.map(function (g) {
      var body = '<div class="ea-table-wrap"><table class="ea-table"><thead><tr>'
        + '<th style="text-align:left">Element</th><th>Required</th><th>Selected</th><th>Unit</th>'
        + '<th>UC</th><th>Status</th><th style="text-align:left">Rule</th></tr></thead><tbody>'
        + g.rows.map(function (r) {
          var b = band(r.uc);
          return '<tr><td style="text-align:left">' + esc(r.name) + '</td>'
            + '<td>' + (r.req === null ? 'n/a' : fmt(r.req, 3)) + '</td>'
            + '<td>' + fmt(r.sel, 3) + '</td><td>' + esc(r.unit) + '</td>'
            + '<td class="' + (b === 'over' ? 'error' : b === 'near' ? 'warning' : b === 'na' ? '' : 'success') + '">'
            + (r.uc === null ? '—' : fmt(r.uc, 4)) + '</td>'
            + '<td class="' + (r.status === 'pass' ? 'ok' : r.status === 'fail' ? 'fail' : '') + '">'
            + (r.status === 'pass' ? 'PASS' : r.status === 'fail' ? 'FAIL' : 'n/a') + '</td>'
            + '<td style="text-align:left;color:var(--text-secondary);font-family:var(--font-body)">'
            + esc(r.ref) + (r.note ? ' — ' + esc(r.note) : '') + '</td></tr>';
        }).join('') + '</tbody></table></div>';
      return '<div style="margin-top:var(--spacing-lg)">'
        + panel(g.name + (g.used ? '' : ' — not the selected bottom type'), body,
          g.used ? (band(g.worst) === 'over' ? 'warning' : 'success') : '') + '</div>';
    }).join('');

    var sel = '<div style="margin-top:var(--spacing-lg)">'
      + panel('Selected scantlings',
        '<div class="ea-section-title">Double bottom · Tab 1</div>' + grid(4, [
          field(p + 'ibBreadth', 'b, inner bottom panel', 'mm', 'Smaller panel dimension; only the inner bottom uses it'),
          field(p + 'ibSel', 'Inner bottom', 'mm'), field(p + 'marginSel', 'Margin plate', 'mm'),
          field(p + 'centreGirderSel', 'Centre girder', 'mm'), field(p + 'floorsSel', 'Floors, side girders', 'mm'),
          field(p + 'ductKeelSel', 'Duct-keel girder', 'mm'), field(p + 'ibBoltedSel', 'Inner bottom, bolted', 'mm')
        ])
        + '<div class="ea-section-title">Single bottom · Tab 2</div>' + grid(4, [
          field(p + 'sbCentreSel', 'Centre girder', 'mm'), field(p + 'sbFloorsSel', 'Floors, side girder', 'mm'),
          field(p + 'floorHeightSel', 'Floor height', 'm'), field(p + 'floorHeightRecessSel', 'Floor height, recessed', 'm')
        ])
        + '<div class="ea-section-title">Seatings · Tab 3</div>' + grid(3, [
          field(p + 'bedplateAreaSel', 'Bedplate area', 'cm2'),
          field(p + 'bedplateThk2Sel', 'Bedplate thk, 2+ members', 'mm'),
          field(p + 'bedplateThk1Sel', 'Bedplate thk, 1 member', 'mm'),
          field(p + 'girderWeb2Sel', 'Girder web, 2+ members', 'mm'),
          field(p + 'girderWeb1Sel', 'Girder web, 1 member', 'mm'),
          field(p + 'transWebSel', 'Transverse member web', 'mm')
        ])
        + '<div class="ea-section-title">Platform, casing and arrangement</div>' + grid(4, [
          field(p + 'platformSel', 'Platform', 'mm'), field(p + 'casingCargoSel', 'Casing, cargo holds', 'mm'),
          field(p + 'casingAccomSel', 'Casing, accommodation', 'mm'),
          field(p + 'webFrames', 'Web frames', 'frame sp.'),
          field(p + 'sideTransverses', 'Side transverses', 'frame sp.'),
          field(p + 'sideGirderSpacing', 'Side bottom girder spacing', 'm'),
          field(p + 'dbFloorsEngine', 'DB floors under engine', 'frame sp.'),
          field(p + 'sbFloorsEngine', 'SB floors under engine', 'frame sp.'),
          field(p + 'sbFloorsElse', 'SB floors elsewhere', 'frame sp.'),
          field(p + 'manholeDepth', 'Manhole depth', 'x floor depth')
        ]), 'orange') + '</div>';

    var spacingRows = R.spacing.map(function (r) {
      return '<tr><td style="text-align:left">' + esc(r.name) + '</td><td>' + fmt(r.actual, 3) + '</td>'
        + '<td>' + fmt(r.limit, 3) + '</td><td>' + esc(r.unit) + '</td>'
        + '<td class="' + (r.status === 'ok' ? 'ok' : 'fail') + '">'
        + (r.status === 'ok' ? 'OK' : 'EXCEEDS') + '</td>'
        + '<td style="text-align:left;color:var(--text-secondary);font-family:var(--font-body)">' + esc(r.ref) + '</td></tr>';
    }).join('');
    var spacing = '<div style="margin-top:var(--spacing-lg)">'
      + panel('Arrangement limits · Ch 11 Sec 2 [2.1] to [2.3]',
        '<div class="ea-table-wrap"><table class="ea-table"><thead><tr><th style="text-align:left">Item</th>'
        + '<th>Actual</th><th>Limit</th><th>Unit</th><th>Status</th><th style="text-align:left">Rule</th>'
        + '</tr></thead><tbody>' + spacingRows + '</tbody></table></div>'
        + '<div class="nr-hint">These are arrangement limits, not thickness minima, so they report OK or EXCEEDS '
        + 'and stay out of the utilisation envelope — as they did in the workbook.</div>',
        R.spacingOk ? 'success' : 'warning') + '</div>';

    return top + test + sel + groups + spacing;
  }

  /* The profile dropdown. The library does not change, so build it once. */
  var PROFILE_NAMES = null;
  function profileNames() {
    if (!PROFILE_NAMES) {
      PROFILE_NAMES = NR467DH.profiles().map(function (x) { return x.name; });
    }
    return PROFILE_NAMES.length ? PROFILE_NAMES : null;
  }

  /* The two faces of a plate, each with its own Ch 4 Sec 3 Tab 1 compartment.
     The corrosion total is tc1 + tc2 + t_res, so both faces matter and a blank
     second face means "nothing declared", contributing zero rather than being
     assumed the same as the first. */
  function exposurePair(prefix, tc) {
    var names = NRIN.corrosionNames();
    if (!names.length) return '<td>' + fmt(tc, 2) + '</td>';
    return '<td style="min-width:160px">'
      + field(prefix + 'exposure1', '', '', 'Compartment on face 1', names)
      + field(prefix + 'exposure2', '', '', 'Compartment on face 2; leave blank if nothing is declared',
        [''].concat(names))
      + '<div class="nr-hint" style="margin:2px 0 0">tc ' + fmt(tc, 2) + ' mm</div></td>';
  }

  /* A utilisation cell, coloured by band. */
  function ucCell(v) {
    return '<td class="' + (band(v) === 'over' ? 'error' : 'success') + '">' + fmt(v, 3) + '</td>';
  }

  /* --------------------------------------------------------- page 4 ----
     The deckhouse. Its tables are wide, so each block scrolls on its own
     rather than being squeezed into one grid. Inputs sit inline in the rows
     they belong to; everything else is computed. */
  function buildDeckhouse() {
    var O = NRIN.OPTIONS, p = 'inp.dh.', R = S.res.dh;
    if (!R) {
      return panel('Deckhouse',
        '<div class="nr-hint">Waiting for the rule tables to load.</div>', 'orange');
    }
    var st = R.structure;

    var top = '<div class="nr-two">'
      + panel('Structure · Ch 1 Sec 3 [2.2]', grid(2, [
        field(p + 'declaredType', 'Declared type', '', 'What you intend it to be; the rule decides separately', O.structureType),
        field(p + 'inboardOffset', 'Inboard offset per side', 'm', 'From the ship side to the deckhouse side'),
        field(p + 'lowestTierWidth', 'Lowest tier width', 'm', 'For reference against the minimum'),
        field(p + 'nD', 'nD', '—', 'Navigation coefficient, Ch 5 Sec 5 Tab 35')
      ]) + '<div class="nr-hint">Limit 0,04 B = <b>' + fmt(st.limit, 3) + ' m</b> · rule says <b>'
      + esc(st.ruled) + '</b> · declared vs rule <b class="' + (st.agreement === 'MATCH' ? 'ok' : 'fail')
      + '">' + esc(st.agreement) + '</b>. A superstructure takes the [5.3] side path, a deckhouse the [5.4] one — never both.</div>',
        st.agreement === 'MATCH' ? 'success' : 'warning')
      + panel('Settings', grid(3, [
        field(p + 'acSet', 'AC set', '', 'Acceptance criteria for the Ch 7 checks', O.acSet),
        field(p + 'stiffEnd', 'Stiffener end', '', 'Ch 7 Sec 5 end connection; sets fbdg and fshr', O.stiffEnd),
        field(p + 'shipTypeA', 'Ship type A', '', 'Raises the green sea deck pressure forward', O.yesNo),
        field(p + 'tierShift', 'Tier shift', '—', 'Ch 5 Sec 5 [5.2.3] increment; 0 if not applied'),
        field(p + 'Bx', 'Bx', 'm', 'Waterline breadth for the deck load point; 0 defaults to B'),
        field('inp.ship.LLL', 'LLL', 'm', 'Load line length — the deck x/L uses this, not L')
      ]) + '<div class="nr-hint">hw = <b>' + fmt(R.hw, 3) + ' m</b> · coefficient f = <b>' + fmt(R.f, 4)
      + '</b> · PWL,max at midship = ' + fmt(R.envelope.WL.Pmax, 2) + ' kN/m2</div>', 'cyan')
      + '</div>';

    /* ---- tiers ---- */
    var tierRows = (S.inp.dh.geometry.tiers || []).map(function (t, i) {
      var g = null;
      R.tiers.forEach(function (x) { if (x.index === i + 1) g = x; });
      var q = p + 'geometry.tiers.' + i + '.';
      return '<tr' + (g ? '' : ' style="opacity:0.5"') + '><td style="text-align:left">' + esc(t.name) + '</td>'
        + '<td>' + field(q + 'frame', '', '', 'Aft frame; blank disables the tier') + '</td>'
        + '<td>' + field(q + 'z', '', '') + '</td>'
        + '<td>' + field(q + 'length', '', '') + '</td>'
        + '<td>' + field(q + 'height', '', '') + '</td>'
        + '<td>' + field(q + 'b1', '', '') + '</td>'
        + '<td>' + field(q + 's', '', '') + '</td>'
        + '<td>' + (g ? fmt(g.xAft, 3) : '—') + '</td>'
        + '<td>' + (g ? fmt(g.xLmid, 4) : '—') + '</td></tr>';
    }).join('');
    var tiers = '<div style="margin-top:var(--spacing-lg)">'
      + panel('Tiers · frame to x, spans and spacings',
        '<div class="ea-table-wrap"><table class="ea-table"><thead><tr><th style="text-align:left">Tier</th>'
        + '<th>Frame</th><th>z [m]</th><th>length [m]</th><th>height [m]</th><th>b1 [m]</th><th>s [mm]</th>'
        + '<th>x aft [m]</th><th>x/L mid</th></tr></thead><tbody>' + tierRows + '</tbody></table></div>'
        + '<div class="nr-hint">Clear a frame to disable that tier. x walks the frame-spacing regions from the origin frame.</div>')
      + '</div>';

    /* ---- bulkhead elements ---- */
    var elRows = R.elements.map(function (e, i) {
      var q = p + 'elements.' + i + '.';
      return '<tr><td style="text-align:left">' + esc(e.name) + '</td>'
        + '<td>' + field(q + 'protection', '', '', 'A protected front reads the side column of Tab 36', O.yesNo) + '</td>'
        + '<td>' + fmt(e.a, 4) + '</td><td>' + fmt(e.b, 4) + '</td><td>' + fmt(e.c, 4) + '</td>'
        + '<td>' + fmt(e.Pplate, 2) + '</td><td>' + fmt(e.Pstiff, 2) + '</td>'
        + '<td>' + field(q + 'tGross', '', '') + '</td>'
        + exposurePair(q, e.tc)
        + '<td>' + fmt(e.tReq, 3) + '</td>' + ucCell(e.UCt)
        + '<td>' + field(q + 'stiffener', '', '', 'Combined with the attached plating', profileNames()) + '</td>'
        + '<td>' + fmt(e.Zreq, 1) + '</td><td>' + fmt(e.Zsel, 1) + '</td>' + ucCell(e.UCz) + '</tr>';
    }).join('');
    var els = '<div style="margin-top:var(--spacing-lg)">'
      + panel('Bulkhead elements · Ch 5 Sec 5 [5.4]',
        '<div class="ea-table-wrap"><table class="ea-table"><thead><tr><th style="text-align:left">Element</th>'
        + '<th>Prot.</th><th>a</th><th>b</th><th>c</th><th>P plate</th><th>P stiff</th><th>t gross</th>'
        + '<th>Exposure</th><th>t req</th><th>UC t</th><th>Stiffener</th><th>Z req</th><th>Z sel</th><th>UC Z</th>'
        + '</tr></thead><tbody>' + elRows + '</tbody></table></div>'
        + '<div class="nr-hint">These are minima, so UC = required / selected and a value at or below 1,00 passes.</div>')
      + '</div>';

    /* ---- decks ---- */
    var dkRows = R.decks.map(function (e, i) {
      var q = p + 'decks.' + i + '.';
      return '<tr><td style="text-align:left">' + esc(e.name) + '</td>'
        + '<td>' + e.effTier + '</td><td>' + fmt(e.chi, 3) + '</td><td>' + fmt(e.PWdmin, 2) + '</td>'
        + '<td>' + fmt(e.pexEnv, 2) + '</td><td>' + fmt(e.Pd, 2) + '</td>'
        + '<td>' + field(q + 'tSel', '', '') + '</td>' + exposurePair(q, e.tc)
        + '<td>' + fmt(e.tReq, 3) + '</td>' + ucCell(e.UCt)
        + '<td>' + field(q + 'stiffener', '', '', '', profileNames()) + '</td>'
        + '<td>' + fmt(e.Zreq, 1) + '</td><td>' + fmt(e.Zsel, 1) + '</td>' + ucCell(e.UCz) + '</tr>';
    }).join('');
    var decks = '<div style="margin-top:var(--spacing-lg)">'
      + panel('Exposed deck · green sea, Ch 5 Sec 5 [3]',
        '<div class="ea-table-wrap"><table class="ea-table"><thead><tr><th style="text-align:left">Deck</th>'
        + '<th>Tier in</th><th>chi</th><th>PW,d-min</th><th>Pex env</th><th>Pd</th><th>t sel</th>'
        + '<th>Exposure</th><th>t req</th><th>UC t</th><th>Stiffener</th><th>Z req</th><th>Z sel</th><th>UC Z</th>'
        + '</tr></thead><tbody>' + dkRows + '</tbody></table></div>'
        + '<div class="nr-hint">chi is read for the tier the deck lies WITHIN, one above the tier it caps, and '
        + 'the deck x/L uses LLL rather than L. Pd takes whichever of green sea and the Pex envelope is larger.</div>')
      + '</div>';

    /* ---- PSM ---- */
    var psmRows = R.psm.map(function (e, i) {
      var q = p + 'psm.' + i + '.';
      return '<tr><td style="text-align:left">' + esc(e.name) + '</td>'
        + '<td>' + field(q + 'model', '', '', 'Ch 7 Sec 6 Tab 3 structural model', O.psmModel) + '</td>'
        + '<td>' + field(q + 'S', '', '') + '</td><td>' + fmt(e.span, 2) + '</td>'
        + '<td>' + fmt(e.Pcalc, 2) + '</td><td>' + fmt(e.Zreq, 1) + '</td>'
        + '<td>' + fmt(e.AshrReq, 2) + '</td><td>' + fmt(e.beff, 3) + '</td>'
        + '<td>' + field(q + 'stiffener', '', '', '', profileNames()) + '</td>'
        + '<td>' + fmt(e.Zeff, 1) + '</td>' + ucCell(e.UCz) + '</tr>';
    }).join('');
    var psm = '<div style="margin-top:var(--spacing-lg)">'
      + panel('Primary supporting members · Ch 11 Sec 5 [3.4.1], Ch 7 Sec 6',
        '<div class="ea-table-wrap"><table class="ea-table"><thead><tr><th style="text-align:left">Member</th>'
        + '<th>Model</th><th>S [m]</th><th>span [m]</th><th>P</th><th>Z req</th><th>Ashr req</th>'
        + '<th>b eff [m]</th><th>Section</th><th>Z eff</th><th>UC Z</th></tr></thead><tbody>'
        + psmRows + '</tbody></table></div>'
        + '<div class="nr-hint">The attached plating is the effective breadth b_eff, not the stiffener spacing, '
        + 'and the corrosion total carries no 0,2 t cap — that cap is a plate-panel rule.</div>')
      + '</div>';

    /* ---- superstructure sides, shown either way but marked ---- */
    var sides = '';
    if (R.superSides.length) {
      var applies = R.results.superstructure;
      var ssRows = R.superSides.map(function (e, i) {
        var q = p + 'superSides.' + i + '.';
        return '<tr><td style="text-align:left">' + esc(e.name) + '</td>'
          + '<td>' + fmt(e.Pplate, 2) + '</td><td>' + fmt(e.Pstiff, 2) + '</td>'
          + '<td>' + field(q + 'tSel', '', '') + '</td><td>' + fmt(e.tReq, 3) + '</td>' + ucCell(e.UCt)
          + '<td>' + field(q + 'stiffener', '', '', '', profileNames()) + '</td>'
          + '<td>' + fmt(e.Zreq, 1) + '</td>' + ucCell(e.UCz)
          + '<td>' + fmt(e.twReq, 3) + '</td><td>' + fmt(e.twSel, 1) + '</td>' + ucCell(e.UCtw)
          + '<td>' + fmt(e.tMinReq, 2) + '</td></tr>';
      }).join('');
      sides = '<div style="margin-top:var(--spacing-lg)">'
        + panel('Superstructure sides · Ch 5 Sec 5 [5.3]',
          '<div class="nr-hint">' + (applies
            ? '<b>Applicable.</b> The structure classifies as a superstructure, so its sides take this path and the side rows in the element table are excluded from the envelope.'
            : '<b>Not applicable.</b> The structure classifies as a deckhouse, so its sides take the [5.4] path in the element table above. These rows are reference only and are excluded from the envelope.')
          + '</div>'
          + '<div class="ea-table-wrap"' + (applies ? '' : ' style="opacity:0.6"') + '><table class="ea-table"><thead><tr>'
          + '<th style="text-align:left">Side</th><th>P plate</th><th>P stiff</th><th>t sel</th><th>t req</th>'
          + '<th>UC t</th><th>Stiffener</th><th>Z req</th><th>UC Z</th><th>tw req</th><th>tw sel</th>'
          + '<th>UC tw</th><th>t min</th></tr></thead><tbody>' + ssRows + '</tbody></table></div>',
          applies ? 'cyan' : 'orange')
        + '</div>';
    }

    return top + tiers + els + decks + psm + sides;
  }

  /* --------------------------------------------------------- page 5 ----
     The fore part. Impact-driven, so the page leads with the two pressures and
     then shows what they demand. */
  function buildFore() {
    var O = NRIN.OPTIONS, p = 'inp.fore.', R = S.res.fore;
    if (!R) {
      return panel('Fore part',
        '<div class="nr-hint">Waiting for the rule tables to load.</div>', 'orange');
    }
    var d = R.d;

    var top = '<div class="nr-two">'
      + panel('Impact loads · Ch 5 Sec 5 [4.2] and [4.3]',
        '<div class="ea-summary-grid" style="grid-template-columns:repeat(2,1fr)">'
        + card('Max P_SLI', d.slammingRequired ? fmt(R.maxPSLI, 1) : 'n/a',
          d.slammingRequired ? 'kN/m2 - ' + esc(R.slamGoverning) : 'slamming not required', 'cyan')
        + card('Max P_FI', fmt(R.maxPFI, 1), 'kN/m2 - ' + esc(R.flareGoverning), 'cyan')
        + '</div>'
        + '<div class="nr-hint">TF = ' + fmt(d.TF, 2) + ' m against 0,04 L = ' + fmt(0.04 * d.L, 2)
        + ' m, so bottom slamming strengthening is <b class="' + (d.slammingRequired ? 'fail' : 'ok')
        + '">' + (d.slammingRequired ? 'REQUIRED' : 'not required') + '</b> (Ch 11 Sec 1 [3.2.1]).</div>'
        + '<div class="nr-hint">H differs between the two: slamming ' + fmt(d.Hslam, 4)
        + ' m (alpha ' + fmt(d.slamAlpha, 4) + '), bow flare ' + fmt(d.Hflare, 4)
        + ' m (alpha ' + fmt(d.flareAlpha, 4) + '). P_FI for the primary members takes CS = '
        + fmt(S.inp.fore.CSpsm, 2) + ' rather than ' + fmt(S.inp.fore.CS, 2) + ': '
        + fmt(R.PFIforPSM, 1) + ' kN/m2.</div>')
      + panel('Acceptance · AC-4', grid(3, [
        field(p + 'CS', 'CS plating', '', 'Ch 5 Sec 5 [4.3.1] ship coefficient'),
        field(p + 'CSpsm', 'CS primary members', '', 'The same impact re-scaled for primary members'),
        field(p + 'stem.ReH', 'Stem ReH', 'MPa', 'Ch 4 Sec 1 Tab 2', O.reHnum)
      ]) + '<div class="nr-hint">Impact runs against AC-4: Ca = ' + fmt(R.AC.Ca, 2) + ', Cs = '
      + fmt(R.AC.Cs, 2) + ', Ct = ' + fmt(R.AC.Ct, 2) + '. That is a different set from the '
      + 'AC-1/2/3 the deckhouse uses — impact is a one-off extreme event, so the plating is '
      + 'allowed to reach yield.</div>'
      + '<div class="nr-hint">Capped lengths: L0 = ' + fmt(d.L0, 1) + ' · L1 = ' + fmt(d.L1, 1)
      + ' · L3 = ' + fmt(d.L3, 1) + ' m. The minima below use all three.</div>', 'purple')
      + '</div>';

    var slamRows = R.slam.map(function (r, i) {
      var q = p + 'slamPoints.' + i + '.';
      return '<tr><td style="text-align:left">' + esc(r.name) + '</td>'
        + '<td>' + field(q + 'xL', '', '') + '</td><td>' + field(q + 'z', '', '') + '</td>'
        + '<td>' + field(q + 'beta', '', '', 'Deadrise; floored at 10 degrees') + '</td>'
        + '<td>' + fmt(r.hSL, 3) + '</td><td>' + fmt(r.TRZ, 3) + '</td>'
        + '<td>' + fmt(r.tanBeta, 4) + '</td><td>' + fmt(r.PSLI, 2) + '</td></tr>';
    }).join('');
    var flareRows = R.flare.map(function (r, i) {
      var q = p + 'flarePoints.' + i + '.';
      return '<tr><td style="text-align:left">' + esc(r.name) + '</td>'
        + '<td>' + field(q + 'z', '', '') + '</td>'
        + '<td>' + field(q + 'alphaFlare', '', '') + '</td>'
        + '<td>' + field(q + 'betaEntry', '', '') + '</td>'
        + '<td>' + fmt(r.CZ, 3) + '</td><td>' + fmt(r.flareTerm, 4) + '</td>'
        + '<td>' + fmt(r.speedTerm, 2) + '</td><td>' + fmt(r.PFI, 2) + '</td></tr>';
    }).join('');
    var points = '<div style="margin-top:var(--spacing-lg)" class="nr-two">'
      + panel('Bottom slamming points',
        '<div class="ea-table-wrap"><table class="ea-table"><thead><tr><th style="text-align:left">Point</th>'
        + '<th>x/L</th><th>z [m]</th><th>beta</th><th>h_SL [m]</th><th>T_RZ [s]</th>'
        + '<th>tan beta</th><th>P_SLI</th></tr></thead><tbody>' + slamRows + '</tbody></table></div>'
        + '<div class="nr-hint">h_SL is zero abaft x/L = 0,7, ramps to x/L = 0,9 and is flat forward of it.</div>')
      + panel('Bow flare points',
        '<div class="ea-table-wrap"><table class="ea-table"><thead><tr><th style="text-align:left">Point</th>'
        + '<th>z [m]</th><th>alpha</th><th>beta</th><th>CZ</th><th>flare term</th>'
        + '<th>speed term</th><th>P_FI</th></tr></thead><tbody>' + flareRows + '</tbody></table></div>')
      + '</div>';

    var minRows = R.plating.map(function (r, i) {
      var q = p + 'plating.' + i + '.';
      return '<tr><td style="text-align:left">' + esc(r.name) + '</td>'
        + '<td style="text-align:left;color:var(--text-secondary);font-family:var(--font-body)">'
        + esc(r.kind) + '</td>'
        + '<td>' + field(q + 's', '', '') + '</td>'
        + '<td>' + field(q + 'ReH', '', '', '', O.reHnum) + '</td>'
        + '<td>' + fmt(r.cF, 2) + '</td><td>' + fmt(r.tMin, 3) + '</td>'
        + '<td>' + field(q + 'tSel', '', '') + '</td>' + ucCell(r.UC) + '</tr>';
    }).join('') + R.stiffeners.map(function (r, i) {
      var q = p + 'stiffeners.' + i + '.';
      return '<tr><td style="text-align:left">' + esc(r.name) + '</td>'
        + '<td style="text-align:left;color:var(--text-secondary);font-family:var(--font-body)">'
        + 'stiffener web</td><td>—</td>'
        + '<td>' + field(q + 'ReH', '', '', '', O.reHnum) + '</td>'
        + '<td>—</td><td>' + fmt(r.tMin, 3) + '</td>'
        + '<td>' + field(q + 'twSel', '', '') + '</td>' + ucCell(r.UC) + '</tr>';
    }).join('');
    var minima = '<div style="margin-top:var(--spacing-lg)">'
      + panel('Minimum scantlings · Ch 11 Sec 1 Tab 1 / 4 / 5',
        '<div class="ea-table-wrap"><table class="ea-table"><thead><tr><th style="text-align:left">Element</th>'
        + '<th style="text-align:left">Form</th><th>s [mm]</th><th>ReH</th><th>cF</th>'
        + '<th>t min</th><th>t sel</th><th>UC</th></tr></thead><tbody>' + minRows
        + '</tbody></table></div>'
        + '<div class="nr-hint">The four plating forms use three different capped lengths — shell, '
        + 'inner bottom and deck take L3, the wash bulkhead takes L1, and the stiffener web minimum '
        + 'takes L0 uncapped. The web minimum is also capped by the plating actually selected.</div>')
      + '</div>';

    function panelTable(title, list, prefix, note, icon) {
      if (!list.length) {
        return panel(title, '<div class="nr-hint">' + note + '</div>', 'orange');
      }
      var body = list.map(function (r, i) {
        var q = p + prefix + '.' + i + '.';
        return '<tr><td style="text-align:left">' + esc(r.name) + '</td>'
          + '<td style="text-align:left;color:var(--text-secondary);font-family:var(--font-body)">'
          + esc(r.location) + '</td>'
          + '<td>' + fmt(r.P, 1) + '</td><td>' + fmt(r.Cd, 2) + '</td>'
          + '<td>' + field(q + 'ns', '', '', '0 simply supported, 1 one end fixed, 2 continuous') + '</td>'
          + '<td>' + fmt(r.fbdg, 0) + '</td>' + exposurePair(q, r.tc)
          + '<td>' + fmt(r.tReq, 3) + '</td>'
          + '<td>' + field(q + 'tSel', '', '') + '</td>' + ucCell(r.UCt)
          + '<td>' + field(q + 'stiffener', '', '', '', profileNames()) + '</td>'
          + '<td>' + fmt(r.Zreq, 1) + '</td><td>' + fmt(r.Zsel, 1) + '</td>' + ucCell(r.UCz)
          + '</tr>';
      }).join('');
      return panel(title,
        '<div class="ea-table-wrap"><table class="ea-table"><thead><tr><th style="text-align:left">Element</th>'
        + '<th style="text-align:left">Location</th><th>P</th><th>Cd</th><th>ns</th><th>fbdg</th>'
        + '<th>Exposure</th><th>t req</th><th>t sel</th><th>UC t</th><th>Stiffener</th>'
        + '<th>Z req</th><th>Z sel</th><th>UC Z</th></tr></thead><tbody>' + body
        + '</tbody></table></div><div class="nr-hint">' + note + '</div>', icon);
    }
    var panels = '<div style="margin-top:var(--spacing-lg)">'
      + panelTable('Bottom slamming panels · Ch 11 Sec 1 [3.2]', R.slamPanels, 'slamPanels',
        d.slammingRequired
          ? 'Cd = 1,30 for the flat bottom. Cd divides the pressure form, so the larger value '
            + 'makes the required plate thinner — it is a dynamic-load coefficient, not a '
            + 'safety factor, and reading it as the latter would put it in the wrong place.'
          : 'Slamming strengthening is not required for this ship, so these panels are not checked.',
        d.slammingRequired ? '' : 'orange')
      + '</div>'
      + '<div style="margin-top:var(--spacing-lg)">'
      + panelTable('Bow impact panels · Ch 11 Sec 1 [3.2]', R.bowPanels, 'bowPanels',
        'Cd = 1,20 for the flared side. Z sel is the combined modulus of the selected profile with '
        + 'this panel spacing and plate, recomputed rather than read from a table worked out for a '
        + 'different plate.')
      + '</div>';

    function reqTable(title, list, note) {
      var body = list.map(function (r) {
        return '<tr><td style="text-align:left">' + esc(r.name) + '</td>'
          + '<td>' + fmt(r.required, 3) + '</td><td>' + fmt(r.selected, 3) + '</td>'
          + '<td style="color:var(--text-muted)">' + esc(r.unit) + '</td>' + ucCell(r.UC)
          + '<td style="text-align:left;color:var(--text-secondary);font-family:var(--font-body)">'
          + esc(r.ref) + '</td></tr>';
      }).join('');
      return panel(title,
        '<div class="ea-table-wrap"><table class="ea-table"><thead><tr><th style="text-align:left">Item</th>'
        + '<th>Required</th><th>Selected</th><th>Unit</th><th>UC</th>'
        + '<th style="text-align:left">Rule</th></tr></thead><tbody>' + body + '</tbody></table></div>'
        + (note ? '<div class="nr-hint">' + note + '</div>' : ''));
    }
    var spacingRows = R.floorsGirders.spacing.concat(R.stem.plateSpacing, R.stem.bulbSpacing)
      .map(function (r) {
        var cls = r.status === 'OK' ? 'ok' : r.status === 'EXCEEDS' ? 'fail' : '';
        return '<tr><td style="text-align:left">' + esc(r.name) + '</td>'
          + '<td>' + (r.limit === null ? '—' : fmt(r.limit, 3)) + '</td>'
          + '<td>' + fmt(r.actual, 3) + '</td>'
          + '<td style="color:var(--text-muted)">' + esc(r.unit) + '</td>'
          + '<td class="' + cls + '">' + esc(r.status) + '</td>'
          + '<td style="text-align:left;color:var(--text-secondary);font-family:var(--font-body)">'
          + esc(r.ref) + '</td></tr>';
      }).join('');
    var structure = '<div style="margin-top:var(--spacing-lg)">'
      + reqTable('Floors, girders and web frames · Ch 11 Sec 1 Tab 2 / Tab 3',
        R.floorsGirders.requirements) + '</div>'
      + '<div style="margin-top:var(--spacing-lg)">'
      + panel('Spacing limits',
        '<div class="ea-table-wrap"><table class="ea-table"><thead><tr><th style="text-align:left">Item</th>'
        + '<th>Limit</th><th>Actual</th><th>Unit</th><th>Status</th>'
        + '<th style="text-align:left">Rule</th></tr></thead><tbody>' + spacingRows
        + '</tbody></table></div>'
        + '<div class="nr-hint">These are maxima, so the ratio runs the other way from the tables '
        + 'above. One row has no numeric limit in the rule — floors go at every web frame — '
        + 'and is reported as such rather than being compared against a dash.</div>', 'cyan')
      + '</div>'
      + '<div style="margin-top:var(--spacing-lg)">'
      + reqTable('Stem, bulbous bow and thruster tunnel · Ch 11 Sec 1 [2.7] to [2.9]',
        R.stem.plate.concat(R.stem.bar, R.stem.bulb),
        'Plate stem thicknesses are net; the bar stem area and thickness are gross, as the rule '
        + 'gives them.' + (R.stem.APnote ? ' ' + esc(R.stem.APnote) + '.' : ''))
      + '</div>';

    return top + points + minima + panels + structure;
  }

  /* --------------------------------------------------------- page 6 ----
     The aft part. Same shape as the fore page, but the stern slamming rule is
     a large-ship rule and switches off entirely below 150 m. */
  function buildAft() {
    var O = NRIN.OPTIONS, p = 'inp.aft.', R = S.res.aft;
    if (!R) {
      return panel('Aft part',
        '<div class="nr-hint">Waiting for the rule tables to load.</div>', 'orange');
    }
    var d = R.d;

    var top = '<div class="nr-two">'
      + panel('Stern slamming · Ch 5 Sec 5 [4.2.2]',
        '<div class="ea-summary-grid" style="grid-template-columns:repeat(2,1fr)">'
        + card('Max P_SLI', d.sternSlammingRequired ? fmt(R.maxPSLI, 1) : 'n/a',
          d.sternSlammingRequired ? 'kN/m2 · ' + esc(R.slamGoverning) : 'L below 150 m', 'cyan')
        + card('T_RZ', fmt(d.TRZ, 3), 's · 3 L^0,26', 'cyan')
        + '</div>'
        + '<div class="nr-hint">L = ' + fmt(d.L, 1) + ' m, so stern slamming is <b class="'
        + (d.sternSlammingRequired ? 'fail' : 'ok') + '">'
        + (d.sternSlammingRequired ? 'REQUIRED' : 'not required') + '</b> (Ch 11 Sec 3 [5.1.1], '
        + 'applies for L at or above 150 m). Below that the pressure is zero because the rule '
        + 'does not reach, which is a scope limit rather than a pass.</div>'
        + '<div class="nr-hint">alpha is a fixed ' + fmt(d.slamAlpha, 3) + ' here, giving H = '
        + fmt(d.Hslam, 4) + ' m. T_RZ follows 3 L^0,26, not the fore part 1,2 L^0,4.</div>')
      + panel('Conventions that differ from the fore part',
        '<div class="nr-hint"><b>x/L runs from the AFT END.</b> h_SL is largest at the aft '
        + 'perpendicular, falls away to x/L = 0,2 and is zero beyond — the mirror of the fore '
        + 'part, where it is zero until x/L = 0,7.</div>'
        + '<div class="nr-hint"><b>The impact height is measured from TLC</b>, not TF. TLC must '
        + 'belong to the loading condition that actually governs stern slamming, and h_SL is very '
        + 'sensitive to CW_LC through its CW^-4,9 term.</div>'
        + '<div class="nr-hint">A point more than h_SL below TLC returns zero because it sits '
        + 'outside the slamming zone. That is not a pass either.</div>', 'purple')
      + '</div>';

    var slamRows = R.slam.map(function (r, i) {
      var q = p + 'slamPoints.' + i + '.';
      return '<tr' + (r.inZone ? '' : ' style="opacity:0.55"') + '>'
        + '<td style="text-align:left">' + esc(r.name)
        + (r.inZone ? '' : ' <span class="badge">outside zone</span>') + '</td>'
        + '<td>' + field(q + 'xL', '', '', 'Measured from the aft end') + '</td>'
        + '<td>' + field(q + 'z', '', '') + '</td>'
        + '<td>' + field(q + 'beta', '', '', 'Deadrise; floored at 10 degrees') + '</td>'
        + '<td>' + fmt(r.hSL, 3) + '</td><td>' + fmt(r.TRZ, 3) + '</td>'
        + '<td>' + fmt(r.tanBeta, 4) + '</td><td>' + fmt(r.PSLI, 2) + '</td></tr>';
    }).join('');
    var points = '<div style="margin-top:var(--spacing-lg)">'
      + panel('Stern slamming points',
        '<div class="ea-table-wrap"><table class="ea-table"><thead><tr><th style="text-align:left">Point</th>'
        + '<th>x/L from AE</th><th>z [m]</th><th>beta</th><th>h_SL [m]</th><th>T_RZ [s]</th>'
        + '<th>tan beta</th><th>P_SLI</th></tr></thead><tbody>' + slamRows + '</tbody></table></div>')
      + '</div>';

    var minRows = R.plating.map(function (r, i) {
      var q = p + 'plating.' + i + '.';
      return '<tr><td style="text-align:left">' + esc(r.name) + '</td>'
        + '<td style="text-align:left;color:var(--text-secondary);font-family:var(--font-body)">'
        + esc(r.kind) + '</td>'
        + '<td>' + field(q + 's', '', '') + '</td>'
        + '<td>' + field(q + 'ReH', '', '', '', O.reHnum) + '</td>'
        + '<td>' + fmt(r.tMin, 3) + '</td>'
        + '<td>' + field(q + 'tSel', '', '') + '</td>' + ucCell(r.UC) + '</tr>';
    }).join('') + R.stiffeners.map(function (r, i) {
      var q = p + 'stiffeners.' + i + '.';
      return '<tr><td style="text-align:left">' + esc(r.name) + '</td>'
        + '<td style="text-align:left;color:var(--text-secondary);font-family:var(--font-body)">'
        + 'stiffener web</td><td>—</td>'
        + '<td>' + field(q + 'ReH', '', '', '', O.reHnum) + '</td>'
        + '<td>' + fmt(r.tMin, 3) + '</td>'
        + '<td>' + field(q + 'twSel', '', '') + '</td>' + ucCell(r.UC) + '</tr>';
    }).join('') + (R.machineryPlatform
      ? '<tr><td style="text-align:left">' + esc(R.machineryPlatform.name) + '</td>'
        + '<td style="text-align:left;color:var(--text-secondary);font-family:var(--font-body)">'
        + 'machinery platform</td><td>—</td>'
        + '<td>' + field(p + 'machineryPlatform.ReH', '', '', '', O.reHnum) + '</td>'
        + '<td>' + fmt(R.machineryPlatform.required, 3) + '</td>'
        + '<td>' + field(p + 'machineryPlatform.tSel', '', '') + '</td>'
        + ucCell(R.machineryPlatform.UC) + '</tr>'
      : '');
    var minima = '<div style="margin-top:var(--spacing-lg)">'
      + panel('Minimum scantlings · Ch 11 Sec 3 Tab 1 / Tab 2',
        '<div class="ea-table-wrap"><table class="ea-table"><thead><tr><th style="text-align:left">Element</th>'
        + '<th style="text-align:left">Form</th><th>s or b [mm]</th><th>ReH</th>'
        + '<th>t min</th><th>t sel</th><th>UC</th></tr></thead><tbody>' + minRows
        + '</tbody></table></div>'
        + '<div class="nr-hint">The inner bottom, deck and platform forms take the plate breadth b, '
        + 'not the stiffener spacing. The platform form switches at L = 120 m; this ship is '
        + fmt(d.L, 1) + ' m.</div>')
      + '</div>';

    var panelRows = R.panels.map(function (r, i) {
      var q = p + 'panels.' + i + '.';
      return '<tr><td style="text-align:left">' + esc(r.name) + '</td>'
        + '<td style="text-align:left;color:var(--text-secondary);font-family:var(--font-body)">'
        + esc(r.location) + '</td>'
        + '<td>' + fmt(r.P, 1) + '</td><td>' + fmt(r.Cd, 2) + '</td>'
        + '<td>' + field(q + 'ns', '', '', '0 simply supported, 1 one end fixed, 2 continuous') + '</td>'
        + '<td>' + fmt(r.fbdg, 0) + '</td>' + exposurePair(q, r.tc)
        + '<td>' + fmt(r.tReq, 3) + '</td>'
        + '<td>' + field(q + 'tSel', '', '') + '</td>' + ucCell(r.UCt)
        + '<td>' + field(q + 'stiffener', '', '', '', profileNames()) + '</td>'
        + '<td>' + fmt(r.Zreq, 1) + '</td><td>' + fmt(r.Zsel, 1) + '</td>' + ucCell(r.UCz)
        + '</tr>';
    }).join('');
    var panels = '<div style="margin-top:var(--spacing-lg)">'
      + panel('Stern impact panels · Ch 11 Sec 3 [5]',
        '<div class="ea-table-wrap"><table class="ea-table"><thead><tr><th style="text-align:left">Element</th>'
        + '<th style="text-align:left">Location</th><th>P</th><th>Cd</th><th>ns</th><th>fbdg</th>'
        + '<th>Exposure</th><th>t req</th><th>t sel</th><th>UC t</th><th>Stiffener</th>'
        + '<th>Z req</th><th>Z sel</th><th>UC Z</th></tr></thead><tbody>' + panelRows
        + '</tbody></table></div>'
        + '<div class="nr-hint">Cd = ' + fmt(R.Cd, 2) + ' for the flat bottom aft. Z sel is the '
        + 'combined modulus of the selected profile with this panel spacing and plate.</div>')
      + '</div>';

    function reqTable(title, list, note, icon) {
      var body = list.map(function (r) {
        return '<tr><td style="text-align:left">' + esc(r.name) + '</td>'
          + '<td>' + fmt(r.required, 3) + '</td><td>' + fmt(r.selected, 3) + '</td>'
          + '<td style="color:var(--text-muted)">' + esc(r.unit) + '</td>' + ucCell(r.UC)
          + '<td style="text-align:left;color:var(--text-secondary);font-family:var(--font-body)">'
          + esc(r.ref) + '</td></tr>';
      }).join('');
      return panel(title,
        '<div class="ea-table-wrap"><table class="ea-table"><thead><tr><th style="text-align:left">Item</th>'
        + '<th>Required</th><th>Selected</th><th>Unit</th><th>UC</th>'
        + '<th style="text-align:left">Rule</th></tr></thead><tbody>' + body + '</tbody></table></div>'
        + (note ? '<div class="nr-hint">' + note + '</div>' : ''), icon);
    }

    var trigRows = R.aftPeak.triggers.map(function (t) {
      return '<div class="nr-hint">' + esc(t.name) + ': <b class="'
        + (t.required ? 'fail' : 'ok') + '">' + t.status + '</b> — ' + esc(t.ref) + '</div>';
    }).join('');
    var spacingRows = R.aftPeak.spacing.map(function (r) {
      var cls = r.status === 'OK' ? 'ok' : r.status === 'EXCEEDS' ? 'fail' : '';
      return '<tr><td style="text-align:left">' + esc(r.name) + '</td>'
        + '<td>' + (r.limit === null ? '—' : fmt(r.limit, 3)) + '</td>'
        + '<td>' + fmt(r.actual, 3) + '</td>'
        + '<td style="color:var(--text-muted)">' + esc(r.unit) + '</td>'
        + '<td class="' + cls + '">' + esc(r.status) + '</td>'
        + '<td style="text-align:left;color:var(--text-secondary);font-family:var(--font-body)">'
        + esc(r.ref) + '</td></tr>';
    }).join('');
    var peak = '<div style="margin-top:var(--spacing-lg)">'
      + reqTable('Aft peak floor and girder stiffening · Ch 11 Sec 3 [2.3]',
        R.aftPeak.requirements,
        'The stiffener length entered is ' + fmt(R.aftPeak.stiffenerLength, 2) + ' m, capped at 5 m '
        + 'by the rule. The source workbook always used 5 m here regardless of what was entered '
        + '— its formula pointed at the label cell rather than the input — so these '
        + 'numbers are lower than the workbook prints.') + '</div>'
      + '<div style="margin-top:var(--spacing-lg)">'
      + panel('Aft peak arrangement · Ch 11 Sec 3 [2.1] and [3.2]',
        trigRows
        + '<div class="ea-table-wrap" style="margin-top:var(--spacing-md)"><table class="ea-table"><thead><tr>'
        + '<th style="text-align:left">Item</th><th>Limit</th><th>Actual</th><th>Unit</th>'
        + '<th>Status</th><th style="text-align:left">Rule</th></tr></thead><tbody>' + spacingRows
        + '</tbody></table></div>'
        + '<div class="nr-hint">The side-transverse limits are in FRAME SPACINGS, not metres. '
        + 'These are dimensional and arrangement rules only — no stress, bending or shear '
        + 'check is made on floors, girders or side transverses.</div>', 'cyan')
      + '</div>';

    var caveats = R.sternFrame.caveats.map(function (c) {
      return '<div class="nr-hint">' + esc(c) + '</div>';
    }).join('');
    var frame = '<div style="margin-top:var(--spacing-lg)">'
      + reqTable('Stern frame and propeller post · Ch 11 Sec 3 [2.2] and [4]',
        R.sternFrame.shell.concat(R.sternFrame.post, R.sternFrame.connections),
        caveats, 'orange') + '</div>';

    return top + points + minima + panels + peak + frame;
  }

  /* --------------------------------------------------------- page 7 ---- */
  function buildResults() {
    var R = S.res.mach, Lo = S.res.loads, D = S.res.dh;
    var dhRes = D && D.results;
    var foreRes0 = S.res.fore && S.res.fore.results;
    var aftRes0 = S.res.aft && S.res.aft.results;
    var cards = '<div class="ea-summary-grid" style="grid-template-columns:repeat(4,1fr)">'
      + card('Governing bottom UC', fmt(R.governing, 3),
        (R.double ? 'double' : 'single') + ' bottom · limit 1.00', band(R.governing) === 'over' ? 'fail' : 'pass')
      + card('Worst deckhouse UC', dhRes ? fmt(Math.max(dhRes.worstUCt, dhRes.worstUCz), 3) : '—',
        dhRes ? 'governing ' + dhRes.governing : 'not computed',
        dhRes && (dhRes.worstUCt > 1 || dhRes.worstUCz > 1) ? 'fail' : 'pass')
      + card('Worst fore UC',
        foreRes0 ? fmt(Math.max(foreRes0.worstPlating, foreRes0.worstStiffener), 3) : '—',
        foreRes0 ? 'impact panels and minima' : 'not computed',
        foreRes0 && Math.max(foreRes0.worstPlating, foreRes0.worstStiffener) > 1 ? 'fail' : 'pass')
      + card('Worst aft UC',
        aftRes0 ? fmt(Math.max(aftRes0.worstPlating, aftRes0.worstStiffener), 3) : '—',
        aftRes0 ? 'stern impact and minima' : 'not computed',
        aftRes0 && Math.max(aftRes0.worstPlating, aftRes0.worstStiffener) > 1 ? 'fail' : 'pass')
      + card('Overall', overallVerdict(), 'All four modules combined',
        overallVerdict() === 'PASS' ? 'pass' : 'fail')
      + '</div>';

    var dhBlock = '';
    if (dhRes) {
      var dhRows = dhRes.rows.map(function (r) {
        return '<tr><td style="text-align:left">' + esc(r.name) + '</td>'
          + '<td style="text-align:left;color:var(--text-secondary);font-family:var(--font-body)">'
          + esc(r.kind) + '</td>' + ucCell(r.UCt) + ucCell(r.UCz)
          + '<td class="' + (r.status === 'PASS' ? 'ok' : 'fail') + '">' + r.status + '</td></tr>';
      }).join('');
      var psmNote = dhRes.psmWorst === null ? ''
        : '<div class="nr-hint">Worst PSM modulus utilisation <b class="'
          + (dhRes.psmWorst <= 1 ? 'ok' : 'fail') + '">' + fmt(dhRes.psmWorst, 3) + '</b> ('
          + esc(dhRes.psmGoverning) + '). The PSM has no plating check so it carries no row, '
          + 'but it still decides the verdict.</div>';
      dhBlock = '<div style="margin-top:var(--spacing-xl)">'
        + '<div class="ea-section-title">Deckhouse · '
        + (dhRes.superstructure ? 'superstructure' : 'deckhouse') + ' row set</div>'
        + '<div class="ea-table-wrap"><table class="ea-table"><thead><tr><th style="text-align:left">Element</th>'
        + '<th style="text-align:left">Kind</th><th>UC t</th><th>UC Z</th><th>Status</th></tr></thead><tbody>'
        + dhRows + '</tbody></table></div>' + psmNote
        + '<div class="nr-hint">Max required Z ' + fmt(dhRes.maxZreq, 1) + ' cm3 · max required t '
        + fmt(dhRes.maxTreq, 2) + ' mm.</div></div>';
    }

    var F = S.res.fore, foreRes = F && F.results;
    var foreBlock = '';
    if (foreRes) {
      var fRows = foreRes.rows.map(function (r) {
        return '<tr><td style="text-align:left">' + esc(r.name) + '</td>'
          + '<td style="text-align:left;color:var(--text-secondary);font-family:var(--font-body)">'
          + esc(r.kind) + '</td>' + ucCell(r.UCt) + ucCell(r.UCz)
          + '<td class="' + (r.status === 'PASS' ? 'ok' : 'fail') + '">' + r.status + '</td></tr>';
      }).join('');
      foreBlock = '<div style="margin-top:var(--spacing-xl)">'
        + '<div class="ea-section-title">Fore part · impact panels</div>'
        + '<div class="ea-table-wrap"><table class="ea-table"><thead><tr><th style="text-align:left">Element</th>'
        + '<th style="text-align:left">Kind</th><th>UC t</th><th>UC Z</th><th>Status</th></tr></thead><tbody>'
        + fRows + '</tbody></table></div>'
        + '<div class="nr-hint">Worst plating ' + fmt(foreRes.worstPlating, 3)
        + ' · worst stiffener ' + fmt(foreRes.worstStiffener, 3)
        + ' · max required t ' + fmt(foreRes.maxTreq, 2) + ' mm'
        + ' · max required Z ' + fmt(foreRes.maxZreq, 1) + ' cm3.</div>'
        + '<div class="nr-hint">The panels and minima alone give <b>'
        + foreRes.overallPanelsAndMinima + '</b>, which is the scope the fore workbook rolls up. '
        + 'Adding floors, girders and the stem gives <b>' + foreRes.overall + '</b>.</div>'
        + '</div>';
    }

    var aftBlock = '';
    if (aftRes0) {
      var aRows = aftRes0.rows.map(function (r) {
        return '<tr><td style="text-align:left">' + esc(r.name) + '</td>'
          + '<td style="text-align:left;color:var(--text-secondary);font-family:var(--font-body)">'
          + esc(r.kind) + '</td>' + ucCell(r.UCt) + ucCell(r.UCz)
          + '<td class="' + (r.status === 'PASS' ? 'ok' : 'fail') + '">' + r.status + '</td></tr>';
      }).join('');
      aftBlock = '<div style="margin-top:var(--spacing-xl)">'
        + '<div class="ea-section-title">Aft part · stern impact panels</div>'
        + '<div class="ea-table-wrap"><table class="ea-table"><thead><tr><th style="text-align:left">Element</th>'
        + '<th style="text-align:left">Kind</th><th>UC t</th><th>UC Z</th><th>Status</th></tr></thead><tbody>'
        + aRows + '</tbody></table></div>'
        + '<div class="nr-hint">Worst plating ' + fmt(aftRes0.worstPlating, 3)
        + ' · worst stiffener ' + fmt(aftRes0.worstStiffener, 3)
        + (aftRes0.sternSlammingRequired ? '' : ' · stern slamming does not apply below L = 150 m')
        + '.</div>'
        + '<div class="nr-hint">The panels and minima alone give <b>'
        + aftRes0.overallPanelsAndMinima + '</b>, which is the scope the aft workbook rolls up. '
        + 'Adding the aft peak and the stern frame gives <b>' + aftRes0.overall + '</b>.</div>'
        + '</div>';
    }

    var rows = R.groups.map(function (g) {
      return '<tr' + (g.used ? '' : ' style="opacity:0.55"') + '>'
        + '<td style="text-align:left">' + esc(g.name) + (g.used ? '' : ' <span class="badge">not used</span>') + '</td>'
        + '<td style="text-align:left;color:var(--text-secondary);font-family:var(--font-body)">' + esc(g.ref) + '</td>'
        + '<td class="' + (band(g.worst) === 'over' ? 'error' : 'success') + '">' + fmt(g.worst, 4) + '</td>'
        + '<td class="' + (g.worst !== null && g.worst <= 1 ? 'ok' : 'fail') + '">'
        + (g.worst === null ? 'n/a' : g.worst <= 1 ? 'PASS' : 'FAIL') + '</td></tr>';
    }).join('');

    return cards
      + '<div style="margin-top:var(--spacing-xl)"><div class="ea-section-title">Machinery space · worst utilisation by group</div>'
      + '<div class="ea-table-wrap"><table class="ea-table"><thead><tr><th style="text-align:left">Group</th>'
      + '<th style="text-align:left">Rule</th><th>Worst UC</th><th>Status</th></tr></thead><tbody>'
      + rows + '</tbody></table></div></div>'
      + dhBlock + foreBlock + aftBlock
      + '<div style="margin-top:var(--spacing-lg)">'
      + panel('Modules still to come', roadmapHTML(), 'orange') + '</div>';
  }

  /* The verdict across every module that is built. */
  function overallVerdict() {
    if (S.res.mach.overall !== 'PASS') return 'FAIL';
    if (S.res.dh && S.res.dh.results.overall !== 'PASS') return 'FAIL';
    if (S.res.fore && S.res.fore.results.overall !== 'PASS') return 'FAIL';
    if (S.res.aft && S.res.aft.results.overall !== 'PASS') return 'FAIL';
    return 'PASS';
  }

  function roadmapHTML() {
    return '<div class="nr-hint">The shared particulars and the Ch 5 Sec 5 external pressure engine are done and '
      + 'verified, and the machinery space and the deckhouse are built on top of them. Two remain:</div>'
      + '<div class="nr-hint"><b>Fore part</b> — Ch 5 Sec 3 impact loads, bottom slamming, bow impact, minimum '
      + 'scantlings, floors and girders, stem. The largest of the two Week 30 workbooks.</div>'
      + '<div class="nr-hint"><b>Aft part</b> — stern impact, aft peak, stern frame, minimum scantlings.</div>';
  }

  function card(label, value, sub, cls) {
    return '<div class="ea-summary-card ' + cls + '"><div class="ea-summary-label">' + esc(label) + '</div>'
      + '<div class="ea-summary-value" style="font-size:' + (String(value).length > 10 ? '1.1rem' : '2rem')
      + '">' + esc(value) + '</div><div class="ea-summary-sub">' + esc(sub) + '</div></div>';
  }

  /* ------------------------------------------------------------- shell */
  function drawVerdict() {
    var R = S.res.mach, Lo = S.res.loads, D = S.res.dh;
    /* The bar tracks the worst utilisation anywhere in the model, so it moves
       when either module governs rather than only the machinery bottom. */
    var worst = R.governing || 0, from = 'machinery bottom';
    if (D && D.results.worstUCt !== null) {
      var dw = Math.max(D.results.worstUCt, D.results.worstUCz);
      if (dw > worst) { worst = dw; from = D.results.governing; }
    }
    var F = S.res.fore;
    if (F && F.results.worstPlating !== null) {
      var fw = Math.max(F.results.worstPlating, F.results.worstStiffener);
      if (fw > worst) { worst = fw; from = 'fore part'; }
    }
    var A = S.res.aft;
    if (A && A.results.worstPlating !== null) {
      var aw = Math.max(A.results.worstPlating, A.results.worstStiffener);
      if (aw > worst) { worst = aw; from = 'aft part'; }
    }
    var b = band(worst);
    var pct = Math.min(100, worst * 80);                       // 1.00 sits at 80 % of the track
    var overall = overallVerdict();
    document.getElementById('verdict').innerHTML =
      '<div class="nr-verdict-item"><span class="nr-verdict-label">Worst UC · ' + esc(from) + '</span>'
      + '<div class="nr-uc"><div class="nr-uc-track"><div class="nr-uc-fill ' + b + '" style="width:' + pct + '%"></div>'
      + '<div class="nr-uc-limit" style="left:80%"></div></div>'
      + '<span class="nr-uc-num ' + b + '">' + fmt(worst, 3) + '</span></div></div>'
      + '<div class="nr-verdict-sep"></div>'
      + '<div class="nr-verdict-item"><span class="nr-verdict-label">Machinery</span>'
      + '<span class="nr-verdict-value">' + R.overall + '</span></div>'
      + '<div class="nr-verdict-sep"></div>'
      + '<div class="nr-verdict-item"><span class="nr-verdict-label">Deckhouse</span>'
      + '<span class="nr-verdict-value">' + (D ? D.results.overall : '—') + '</span></div>'
      + '<div class="nr-verdict-sep"></div>'
      + '<div class="nr-verdict-item"><span class="nr-verdict-label">Fore part</span>'
      + '<span class="nr-verdict-value">' + (F ? F.results.overall : '—') + '</span></div>'
      + '<div class="nr-verdict-sep"></div>'
      + '<div class="nr-verdict-item"><span class="nr-verdict-label">Aft part</span>'
      + '<span class="nr-verdict-value">' + (A ? A.results.overall : '—') + '</span></div>'
      + '<div class="nr-verdict-sep"></div>'
      + '<div class="nr-verdict-item"><span class="nr-verdict-label">Pex envelope</span>'
      + '<span class="nr-verdict-value">' + (Lo ? fmt(Lo.PexMax, 1) + ' kN/m2' : '—') + '</span></div>'
      + '<div class="nr-verdict-spacer"></div>'
      + '<span class="nr-stamp ' + (overall === 'PASS' ? 'pass' : 'fail') + '">' + overall + '</span>';
  }

  function drawWizard() {
    var h = '';
    PAGES.forEach(function (p, i) {
      if (i) h += '<div class="ea-wizard-line"></div>';
      h += '<button class="ea-wizard-step' + (p.n === S.page ? ' active' : '') + '" onclick="UI.go(' + p.n + ')">'
        + '<span class="ea-wizard-num">' + p.n + '</span> ' + p.label + '</button>';
    });
    document.getElementById('wizard').innerHTML = h;
  }

  function recalc(immediate) {
    S.res.mach = NR467MACH.solve(S.inp);
    if (NR467LOADS.ready()) {
      try { S.res.loads = NR467LOADS.solve(S.inp.ship, S.point); }
      catch (e) { S.res.loads = null; }
    }
    /* The deckhouse needs both rule tables and, for its deck rows, the loads
       engine. It stays null until all three are in, and the page says so. */
    if (NR467DH.ready() && NR467LOADS.ready()) {
      try {
        var derived = NR467LOADS.derive(S.inp.ship);
        S.res.dh = NR467DH.solve(S.inp, S.inp.dh, {
          derived: derived,
          pexEnv: function (points) {
            var m = 0;
            points.forEach(function (pt) {
              var v = NR467LOADS.solve(S.inp.ship, pt).PexMax;
              if (v > m) m = v;
            });
            return m;
          }
        });
      } catch (e) { S.res.dh = null; }
    }
    /* The fore part needs its own rule tables and the profile library, and
       reaches the wave parameter through the loads engine. */
    if (NR467FORE.ready() && NR467LOADS.ready() && NR467SEC.ready()) {
      try { S.res.fore = NR467FORE.solve(S.inp, S.inp.fore); }
      catch (e) { S.res.fore = null; }
    }
    if (NR467AFT.ready() && NR467LOADS.ready() && NR467SEC.ready()) {
      try { S.res.aft = NR467AFT.solve(S.inp, S.inp.aft); }
      catch (e) { S.res.aft = null; }
    }
    drawVerdict();
    clearTimeout(renderTimer);
    if (immediate === false) renderTimer = setTimeout(renderPage, 350);
    else renderPage();
  }

  var renderTimer = null;

  function renderPage() {
    var main = document.getElementById('main-' + S.page);
    if (S.page === 1) main.innerHTML = buildShip();
    else if (S.page === 2) main.innerHTML = buildLoads();
    else if (S.page === 3) main.innerHTML = buildMachinery();
    else if (S.page === 4) main.innerHTML = buildDeckhouse();
    else if (S.page === 5) main.innerHTML = buildFore();
    else if (S.page === 6) main.innerHTML = buildAft();
    else main.innerHTML = buildResults();
    var focus = document.activeElement, fp = focus && focus.getAttribute && focus.getAttribute('data-path');
    var pos = focus && focus.selectionStart;
    bind(main);
    if (fp) {
      var again = main.querySelector('[data-path="' + fp + '"]');
      if (again) { again.focus(); try { again.selectionStart = again.selectionEnd = pos; } catch (e) { } }
    }
  }

  function go(n) {
    S.page = n;
    PAGES.forEach(function (p) {
      document.getElementById('page-' + p.n).classList.toggle('active', p.n === n);
    });
    drawWizard(); renderPage(); window.scrollTo(0, 0);
  }

  /* ------------------------------------------------------------- export
     Both exports are built from one description of the report, so the PDF and
     the spreadsheet cannot say different things. A failure here is reported to
     the user rather than left in the console — an export that silently does
     nothing looks like a broken button. */
  function exportPDF() {
    try {
      NR467REPORT.toPDF(S);
      toast('PDF written: ' + NR467REPORT.fileBase(S) + '.pdf');
    } catch (e) { toast('Could not write the PDF: ' + e.message); }
  }
  function exportXLSX() {
    try {
      NR467REPORT.toXLSX(S);
      toast('Spreadsheet written: ' + NR467REPORT.fileBase(S) + '.xlsx');
    } catch (e) { toast('Could not write the spreadsheet: ' + e.message); }
  }

  /* ---------------------------------------------------------- save/load */
  function saveJSON() {
    var payload = { app: 'NR467 Local Scantlings', version: 1, savedAt: new Date().toISOString(), inp: S.inp, point: S.point };
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (S.inp.vessel || 'NR467').replace(/[^\w.-]+/g, '_') + '_local.json';
    a.click(); URL.revokeObjectURL(a.href);
    toast('Saved ' + a.download);
  }
  function loadJSON(ev) {
    var f = ev.target.files && ev.target.files[0];
    if (!f) return;
    var r = new FileReader();
    r.onload = function () {
      try {
        var d = JSON.parse(r.result);
        if (!d.inp) throw new Error('no input block');
        var base = NRIN.defaults();
        if (d.inp.ship) Object.assign(base.ship, d.inp.ship);
        if (d.inp.mach) Object.assign(base.mach, d.inp.mach);
        /* The deckhouse block holds arrays of rows, not just scalars, so a
           shallow merge would leave a saved four-tier model sitting on the
           two-tier default rows. Take the saved arrays whole. */
        if (d.inp.dh) {
          Object.assign(base.dh, d.inp.dh);
          if (d.inp.dh.geometry) base.dh.geometry = d.inp.dh.geometry;
        }
        if (d.inp.fore) Object.assign(base.fore, d.inp.fore);
        if (d.inp.aft) Object.assign(base.aft, d.inp.aft);
        /* A file saved before the corrosion tables were reconciled carries the
           old workbook spellings; bring them onto the shared table. */
        NRIN.canonicaliseExposures(base);
        ['vessel', 'rules', 'preparedBy', 'revision'].forEach(function (k) {
          if (d.inp[k] !== undefined) base[k] = d.inp[k];
        });
        S.inp = base;
        if (d.point) Object.assign(S.point, d.point);
        recalc(); go(S.page); toast('Loaded ' + f.name);
      } catch (e) { toast('Could not read that file: ' + e.message); }
      ev.target.value = '';
    };
    r.readAsText(f);
  }

  function boot() {
    S.res.mach = NR467MACH.solve(S.inp);
    drawWizard(); drawVerdict(); go(1);
    /* Rule tables and the profile library are data, fetched once at start-up.
       One recalc at the end rather than one per file, so the first paint does
       not show a half-loaded model. */
    function grab(url) {
      return fetch(url).then(function (r) {
        if (!r.ok) throw new Error(url + ' returned ' + r.status);
        return r.json();
      });
    }
    Promise.all([
      grab('app/data/edw-coefficients.json'),
      grab('app/data/deckhouse-tables.json'),
      grab('app/data/sections.json'),
      grab('app/data/fore-tables.json'),
      grab('app/data/aft-tables.json'),
      grab('app/data/corrosion.json')
    ]).then(function (j) {
      /* Ch 4 Sec 3 Tab 1 first — every module's corrosion lookup goes through
         it, so nothing may solve before it is in. */
      NRIN.setCorrosion(j[5]);
      NRIN.OPTIONS.exposure = NRIN.corrosionNames();
      NRIN.canonicaliseExposures(S.inp);
      NR467LOADS.setTables(j[0]);
      NR467DH.setTables(j[1]);
      NR467SEC.setSections(j[2]);
      NR467FORE.setTables(j[3]);
      NR467AFT.setTables(j[4]);
      recalc();
    }).catch(function (e) { toast('Could not load the rule tables: ' + e.message); });
  }

  return {
    S: S, boot: boot, go: go, recalc: recalc, saveJSON: saveJSON, loadJSON: loadJSON, toast: toast,
    exportPDF: exportPDF, exportXLSX: exportXLSX,
    esc: esc, fmt: fmt, band: band
  };
})();
