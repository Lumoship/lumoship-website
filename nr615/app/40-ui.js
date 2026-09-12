/* ============================================================================
   Application shell: state, wizard, generated forms, the live verdict strip
   and the cross-section drawing. Every edit re-solves the whole rule chain, so
   the verdict under the header is never stale — that is the point of the flow.
   ============================================================================ */

window.UI = (function () {
  'use strict';

  var S = {
    inp: NRIN.defaults(),
    batch: [],
    res: null,
    page: 1,
    open: {},          // which check cards are expanded
    folds: {},         // which optional blocks are expanded
    imported: null,    // report from the last workbook import, shown on Setup
    cases: [],         // design load sets · Sec 3 [1.1.3]
    active: 0,         // which load set the detailed pages are showing
    caseRes: []        // one solved result per load set
  };

  var CASE_KEY = {};
  NRIN.CASE_KEYS.forEach(function (k) { CASE_KEY[k] = 1; });

  var PAGES = [
    { n: 1, label: 'Setup' },
    { n: 2, label: 'Panel' },
    { n: 3, label: 'Loads' },
    { n: 4, label: 'Extras' },
    { n: 5, label: 'Results' },
    { n: 6, label: 'Batch' }
  ];

  /* ------------------------------------------------------------- helpers */
  function esc(s) {
    return String(s === undefined || s === null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function fmt(v, dp) {
    if (v === null || v === undefined) return '—';
    if (typeof v === 'string') return v;
    if (!isFinite(v)) return '—';
    if (v !== 0 && (Math.abs(v) >= 1e7 || Math.abs(v) < 1e-4)) return v.toExponential(3);
    var d = dp === undefined ? (Math.abs(v) >= 100 ? 2 : Math.abs(v) >= 1 ? 4 : 5) : dp;
    return v.toFixed(d).replace(/\.?0+$/, function (m) { return m.indexOf('.') === 0 ? '' : m; });
  }
  function band(eta, etaAll) {
    if (eta === null || eta === undefined) return 'na';
    if (eta > etaAll) return 'over';
    if (eta > 0.9 * etaAll) return 'near';
    return 'ok';
  }
  function toast(msg) {
    var t = document.getElementById('toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(t._h); t._h = setTimeout(function () { t.classList.remove('show'); }, 2200);
  }

  /* ---------------------------------------------------- generated forms */
  function fieldHTML(f) {
    var v = S.inp[f.k];
    var help = f.h ? ' title="' + esc(f.h) + '"' : '';
    var h = '<div class="ea-field"><label class="ea-label"' + help + '>' + esc(f.l)
      + (f.u ? ' <span style="color:var(--text-muted);text-transform:none">[' + esc(f.u) + ']</span>' : '') + '</label>';
    if (f.t === 'select') {
      h += '<select class="ea-select" data-key="' + f.k + '"' + help + '>';
      NRIN.OPTIONS[f.o].forEach(function (o) {
        h += '<option value="' + esc(o) + '"' + (o === v ? ' selected' : '') + '>' + esc(o) + '</option>';
      });
      h += '</select>';
    } else if (f.t === 'text') {
      h += '<input type="text" class="ea-input" data-key="' + f.k + '" value="' + esc(v) + '"' + help + '>';
    } else {
      h += '<input type="number" step="' + (f.step || 'any') + '" class="ea-input" data-key="' + f.k
        + '" value="' + esc(v) + '"' + help + '>';
    }
    return h + '</div>';
  }
  function rows(list, cols) {
    var cls = cols === 2 ? 'ea-form-row' : cols === 4 ? 'ea-form-row-4' : 'ea-form-row-3';
    var out = '', i;
    for (i = 0; i < list.length; i += cols) {
      out += '<div class="' + cls + '" style="margin-bottom:var(--spacing-md)">'
        + list.slice(i, i + cols).map(fieldHTML).join('') + '</div>';
    }
    return out;
  }
  function panel(title, body, icon) {
    return '<div class="ea-panel"><div class="ea-panel-header"><div class="ea-panel-icon'
      + (icon ? ' ' + icon : '') + '"></div><span class="ea-panel-title">' + esc(title)
      + '</span></div><div class="ea-panel-body">' + body + '</div></div>';
  }
  function fold(id, title, state, body) {
    var open = S.folds[id] ? ' open' : '';
    return '<div class="nr-fold' + open + '" id="fold-' + id + '">'
      + '<div class="nr-fold-head" onclick="UI.toggleFold(\'' + id + '\')">'
      + '<span class="nr-fold-chev">&#9656;</span>'
      + '<span class="nr-fold-title">' + esc(title) + '</span>'
      + '<span class="nr-fold-state">' + state + '</span></div>'
      + '<div class="nr-fold-body">' + body + '</div></div>';
  }

  function bind(root) {
    Array.prototype.forEach.call(root.querySelectorAll('[data-key]'), function (el) {
      var ev = el.tagName === 'SELECT' ? 'change' : 'input';
      el.addEventListener(ev, function () {
        var k = el.getAttribute('data-key');
        S.inp[k] = el.type === 'number' ? (el.value === '' ? 0 : parseFloat(el.value)) : el.value;
        /* A stress or pressure edit belongs to the load set on screen, not to
           the geometry — write it back so switching sets does not lose it. */
        if (CASE_KEY[k] && S.cases[S.active]) S.cases[S.active][k] = S.inp[k];
        recalc(k);
      });
    });
    Array.prototype.forEach.call(root.querySelectorAll('[data-case]'), function (el) {
      el.addEventListener('input', function () {
        var i = parseInt(el.getAttribute('data-case'), 10);
        var f = el.getAttribute('data-field');
        S.cases[i][f] = el.type === 'number' ? (el.value === '' ? 0 : parseFloat(el.value)) : el.value;
        if (i === S.active && f !== 'name') S.inp[f] = S.cases[i][f];
        recalc();
      });
    });
  }

  /* ------------------------------------------------------------- pages */
  function importReportHTML() {
    var r = S.imported;
    if (!r) return '';
    var warn = r.notes.length;
    var body = '<div class="nr-hint"><b>' + esc(r.file) + '</b> — ' + r.count
      + ' input values read' + (r.batchCount ? ', ' + r.batchCount + ' batch panel'
        + (r.batchCount === 1 ? '' : 's') : ', batch left alone') + '.</div>'
      + (warn ? r.notes.map(function (nte) {
        return '<div class="nr-hint" style="color:var(--warning)">' + esc(nte) + '</div>';
      }).join('') : '<div class="nr-hint">Nothing needed attention.</div>')
      + '<div class="nr-hint" style="margin-top:var(--spacing-sm)">The sweep limits n and m_tor are not carried '
      + 'by the workbook and kept their current values.</div>'
      + '<div class="ea-btn-group mt-md"><button class="ea-btn ea-btn-secondary ea-btn-sm" '
      + 'onclick="UI.dismissImport()">Dismiss</button></div>';
    return '<div style="margin-bottom:var(--spacing-lg)">'
      + panel('Imported from workbook', body, warn ? 'warning' : 'success') + '</div>';
  }

  function buildSetup() {
    var F = NRFIELDS;
    return importReportHTML() + '<div class="nr-two">'
      + panel('Project', rows(F.PROJECT, 2)
        + '<div class="nr-hint">eta_all comes from the Rules that invoke NR615, not from NR615 itself — Sec 1 [2.3.1]. '
        + 'The buckling check must be repeated for every design load set and dynamic load case — Sec 3 [1.1.3].</div>')
      + panel('Material', rows(F.MATERIAL, 2)
        + '<div class="nr-hint" style="margin-top:var(--spacing-md)">With mixed materials in one panel, take the minimum yield — Sec 3 [1.2.3].</div>', 'cyan')
      + '</div>'
      + '<div style="margin-top:var(--spacing-lg)">'
      + panel('Analysis control', rows(F.CONTROL, 4), 'purple') + '</div>'
      + '<div style="margin-top:var(--spacing-lg)">'
      + panel('Scope', scopeHTML(), 'orange') + '</div>';
  }

  function scopeHTML() {
    return '<div class="nr-hint"><b>Sign convention · Sec 1 [1.2.3]</b> — compressive and shear stresses are POSITIVE, '
      + 'tensile stresses NEGATIVE.</div>'
      + '<div class="nr-hint"><b>Net scantlings · Sec 1 [1.2.2]</b> — every formula works on net thicknesses. '
      + 'Enter gross values only with the thickness basis set to Gross, and the corrosion additions are deducted here.</div>'
      + '<div class="nr-hint"><b>Boundary conditions</b> — Tab 4 Cases 1, 2 and 15 are the simply supported default of '
      + 'Sec 5 [2.2.3]. Cases 3-19 are selectable on the Loads page; each switches both the buckling factor K and its own '
      + 'reduction factor C. Any departure from simple support is subject to the agreement of the Society.</div>'
      + '<div class="nr-hint"><b>Preconditions</b> — the stiffener check is only valid once the overall stiffened panel '
      + 'capacity is satisfied, Sec 3 [3.3.1] Note 1. gamma_c for the stiffener is solved by bisection on the '
      + 'Sec 5 [2.3.3] interaction, not assumed equal to 1.</div>'
      + '<div class="nr-hint"><b>Sweeps</b> — gamma_GEB is minimised over the half-wave number n and sigma_ET over m_tor. '
      + 'Both limits are on the Loads page and the Results page flags a minimum that reaches the end of a sweep.</div>'
      + '<div class="nr-hint"><b>Bulb bars</b> are idealised as equivalent angle bars — Sec 5 [2.3.2].</div>';
  }

  function buildPanelPage() {
    var F = NRFIELDS;
    return '<div class="nr-two">'
      + '<div>'
      + panel('Elementary plate panel', rows(F.PLATE, 3)
        + '<div class="nr-hint">Tab 4 requires a to be the longer side. For a U-type stiffener the spacing used in the '
        + 'capacity formulae becomes b1 + b2 — Sec 5 [2.1.2].</div>')
      + '<div style="margin-top:var(--spacing-lg)">'
      + panel('Thickness basis', rows(F.BASIS, 3), 'orange') + '</div>'
      + '<div style="margin-top:var(--spacing-lg)">'
      + panel('Stiffener scantlings', rows(F.STIFF, 3), 'cyan') + '</div>'
      + '</div>'
      + '<div>'
      + panel('Section', '<div class="nr-figure" id="figure"></div>'
        + '<div class="nr-hint" style="margin-top:var(--spacing-md)" id="figureNote"></div>', 'purple')
      + '<div style="margin-top:var(--spacing-lg)">'
      + panel('Input validation', '<div class="nr-checks-grid" id="validation"></div>') + '</div>'
      + '</div></div>';
  }

  /* ------------------------------------------- design load sets · Sec 3 */
  function caseTableHTML() {
    var etaAll = S.inp.etaAll;
    var head = '<thead><tr><th></th>'
      + NRIN.CASE_FIELDS.map(function (f) {
        return '<th>' + esc(f.label) + (f.unit ? '<br><span style="font-weight:400;text-transform:none">'
          + esc(f.unit) + '</span>' : '') + '</th>';
      }).join('')
      + '<th>Worst eta</th><th>Governing</th><th>Status</th><th></th></tr></thead>';

    var body = S.cases.map(function (c, i) {
      var R = S.caseRes[i];
      var e = R ? R.env : null;
      var b = e ? band(e.worst, etaAll) : 'na';
      var cells = NRIN.CASE_FIELDS.map(function (f) {
        var cls = f.t === 'text' ? ' class="name"' : '';
        return '<td' + cls + '><input type="' + (f.t === 'text' ? 'text' : 'number')
          + '" data-case="' + i + '" data-field="' + f.k + '" value="' + esc(c[f.k]) + '"></td>';
      }).join('');
      return '<tr' + (i === S.active ? ' class="worst"' : '') + '>'
        + '<td class="rowdel"><button title="' + (i === S.active ? 'Showing this load set'
          : 'Show this load set on the detailed pages') + '" onclick="UI.activateCase(' + i + ')">'
        + (i === S.active ? '&#9679;' : '&#9675;') + '</button></td>'
        + cells
        + '<td class="eta ' + b + '">' + (e ? fmt(e.worst, 3) : '—') + '</td>'
        + '<td>' + esc(e ? e.governing : '') + '</td>'
        + '<td class="eta ' + (!e ? 'na' : e.overall === 'PASS' ? 'ok' : e.overall === 'CHECK' ? 'near' : 'over')
        + '">' + (e ? e.overall : '—') + '</td>'
        + '<td class="rowdel"><button title="Remove this load set" onclick="UI.removeCase(' + i
        + ')">&times;</button></td></tr>';
    }).join('');

    return '<div class="nr-toolbar">'
      + '<button class="ea-btn ea-btn-primary ea-btn-sm" onclick="UI.addCase()">+ Add load set</button>'
      + '<button class="ea-btn ea-btn-secondary ea-btn-sm" onclick="UI.duplicateCase()">Duplicate active</button>'
      + '<span class="nr-spacer"></span>'
      + '<span class="badge badge-blue">showing: ' + esc(S.cases[S.active] ? S.cases[S.active].name : '—')
      + '</span></div>'
      + '<div class="nr-batch-wrap" style="max-height:340px"><table class="nr-batch">'
      + head + '<tbody>' + body + '</tbody></table></div>'
      + '<div class="nr-hint" style="margin-top:var(--spacing-md)">Sec 3 [1.1.3] requires the buckling check to be '
      + 'repeated for every design load set and dynamic load case. Each row here is one such set; the geometry, '
      + 'material and modelling options are shared. The verdict strip and the Results envelope report the worst across '
      + 'all of them, and every derivation on the other pages follows the set marked with the filled dot.</div>';
  }

  function buildLoads() {
    var F = NRFIELDS;
    return panel('Design load sets · Sec 3 [1.1.3]', '<div id="caseTable">' + caseTableHTML() + '</div>', 'cyan')
      + '<div style="margin-top:var(--spacing-lg)"></div>'
      + '<div class="nr-two">'
      + panel('Applied stresses', rows(F.STRESS, 3)
        + '<div class="nr-hint"><b>Compression and shear POSITIVE, tension NEGATIVE</b> — Sec 1 [1.2.3]. '
        + 'Under the prescriptive route Sec 3 [2.1.1] fixes the combination: longitudinal stiffening takes sigma_y = 0, '
        + 'transverse takes sigma_x = 0, both with tau = tau_hg.</div>')
      + panel('Lateral load', rows(F.LATERAL, 3)
        + '<div class="nr-hint">M1 sums the lateral-pressure and concentrated-load contributions of Sec 5 [2.3.3]. '
        + 'Set MCL = 0 to suppress the concentrated-load term.</div>', 'orange')
      + '</div>'
      + '<div style="margin-top:var(--spacing-lg)">'
      + panel('Tab 4 boundary conditions', rows(F.CASES, 3), 'cyan') + '</div>'
      + '<div style="margin-top:var(--spacing-lg)">'
      + panel('Arrangement, restraint and sweeps', rows(F.ARRANGE, 4), 'purple') + '</div>';
  }

  function buildExtras() {
    var F = NRFIELDS, R = S.res;
    function st(active, eta) {
      if (!active) return '<span style="color:var(--text-muted)">not in use</span>';
      var b = band(eta, S.inp.etaAll);
      return '<span style="color:var(--' + (b === 'over' ? 'error' : b === 'near' ? 'warning' : 'success')
        + ')">eta = ' + fmt(eta, 3) + '</span>';
    }
    var slenState = R.slen.status === 'PASS'
      ? '<span style="color:var(--success)">PASS</span>'
      : '<span style="color:var(--error)">' + R.slen.fails + ' FAIL</span>';

    return '<div class="nr-hint" style="margin-bottom:var(--spacing-md)">These blocks are optional. Leave a geometry at '
      + 'zero and its check reports n/a and stays out of the envelope — exactly as the workbook behaved.</div>'
      + fold('slen', 'Sec 2 — slenderness data (PSM, web stiffeners, brackets)', slenState,
        '<div class="ea-section-title">Primary supporting members · Sec 2 [4.1.1]</div>' + rows(F.SLEN_PSM, 3)
        + '<div class="ea-section-title">Web stiffeners on PSM · Sec 2 [4.2.2] Tab 1</div>' + rows(F.SLEN_WS, 3)
        + '<div class="ea-section-title">Brackets · Sec 2 [5]</div>' + rows(F.SLEN_BR, 4))
      + fold('pillar', 'Sec 5 [3.1] — struts, pillars and cross ties', st(R.pillar.active, R.pillar.eta),
        rows(F.PILLAR, 3))
      + fold('corr', 'Sec 5 [3.2] and Sec 4 [3.3] — corrugated bulkheads', st(R.corr.active, R.corr.eta),
        '<div class="ea-section-title">Local buckling · two stress combinations · Sec 5 [3.2.1]</div>'
        + rows(F.CORR_LOCAL, 5)
        + '<div class="ea-section-title">Corrugation unit as a column · Sec 4 [3.3.2]</div>' + rows(F.CORR_COL, 4))
      + fold('curved', 'Sec 5 [2.2.6] — curved plate panels',
        R.curved.active ? st(true, R.curved.eta)
          : '<span style="color:var(--text-muted)">' + esc(R.curved.reason || 'not entered') + '</span>',
        rows(F.CURVED, 3)
        + '<div class="nr-hint">Tab 5 applies while R/tp &lt;= 2500. Above that the panel is treated as plane and the '
        + 'plate capacity of Sec 5 [2.2.1] governs instead. Tensile axial or tangential stresses are entered as 0.</div>')
      + fold('open', 'Sec 5 [2.4] — PSM web plates in way of openings', st(R.openings.active, R.openings.eta),
        '<div class="ea-section-title">Configuration · Tab 7</div>' + rows(F.OPENINGS_CFG, 4)
        + '<div class="ea-section-title">Panel P1</div>' + rows(F.OPENINGS_P1, 5)
        + '<div class="ea-section-title">Panel P2</div>' + rows(F.OPENINGS_P2, 5));
  }

  /* -------------------------------------------------- cross-section SVG */
  function drawSection() {
    var host = document.getElementById('figure');
    if (!host) return;
    var I = S.inp, R = S.res, C = R.coef, N = R.net;
    var tp = N.tp, tw = N.tw, tf = N.tf, hw = I.hw, bf = I.bf;
    var s = C.sUsed, beff = R.plate.beff;
    var flat = I.profile === 'Flat bar';

    var W = 520, H = 300, padTop = 42, padBot = 58, padSide = 34;
    var totalH = tp + hw + (flat ? 0 : tf);
    /* Scale off the section DEPTH, not the stiffener spacing: at a realistic
       s/hw ratio, fitting the full plating across the frame shrinks the
       stiffener to a hairline. The plating is drawn as far as the frame allows
       and cut with break marks, so the profile stays legible and everything
       vertical is still to scale. */
    var scale = (H - padTop - padBot) / Math.max(totalH, 1);
    var halfMax = W / 2 - padSide;
    var cx = W / 2;
    var yTop = padTop;                    // top of flange
    function Y(zFromPlateTop) { return yTop + zFromPlateTop * scale; }

    var g = [];
    var plateY = Y(flat ? hw : hw + tf);
    var halfS = Math.min(s * scale / 2, halfMax);
    var clipped = s * scale / 2 > halfMax;
    var halfBe = Math.min(beff * scale / 2, halfMax);

    // attached plating
    g.push('<rect x="' + (cx - halfS) + '" y="' + plateY + '" width="' + (2 * halfS)
      + '" height="' + (tp * scale) + '" fill="#1e293b" stroke="#334155" stroke-width="1"/>');
    // effective width, centred on the stiffener
    g.push('<rect x="' + (cx - halfBe) + '" y="' + plateY + '" width="' + (2 * halfBe)
      + '" height="' + (tp * scale) + '" fill="rgba(59,130,246,0.35)" stroke="#3b82f6" stroke-width="1"/>');
    if (clipped) {
      // break marks: the plating continues past the frame
      [cx - halfS, cx + halfS].forEach(function (bx, i) {
        var d = i ? 1 : -1, y0 = plateY - 3, y1 = plateY + tp * scale + 3;
        g.push('<path d="M' + bx + ' ' + y0 + ' l' + (d * 6) + ' ' + ((y1 - y0) / 3)
          + ' l' + (-d * 12) + ' ' + ((y1 - y0) / 3) + ' l' + (d * 6) + ' ' + ((y1 - y0) / 3)
          + '" fill="none" stroke="#64748b" stroke-width="1.2"/>');
      });
    }
    // web
    g.push('<rect x="' + (cx - tw * scale / 2) + '" y="' + Y(flat ? 0 : tf) + '" width="' + Math.max(1.5, tw * scale)
      + '" height="' + (hw * scale) + '" fill="#334155" stroke="#64748b" stroke-width="1"/>');
    // flange
    if (!flat && bf > 0 && tf > 0) {
      var fx = I.flangeType === 'One-sided (angle/L2)' ? cx - tw * scale / 2 : cx - bf * scale / 2;
      g.push('<rect x="' + fx + '" y="' + yTop + '" width="' + (bf * scale) + '" height="' + Math.max(1.5, tf * scale)
        + '" fill="#334155" stroke="#64748b" stroke-width="1"/>');
    }
    // neutral axis, measured from the plate mid-plane upward
    var naY = plateY + tp * scale / 2 - R.stiff.w_na * scale;
    g.push('<line x1="' + (cx - halfS) + '" y1="' + naY + '" x2="' + (cx + halfS - 26)
      + '" y2="' + naY + '" stroke="#a855f7" stroke-width="1.2" stroke-dasharray="7 4"/>');
    g.push('<text x="' + (cx + halfS - 22) + '" y="' + (naY + 3.5)
      + '" fill="#a855f7" font-size="10" font-family="monospace">n.a.</text>');

    // dimension line for the spacing
    var dimY = plateY + tp * scale + 24;
    g.push('<line x1="' + (cx - halfS) + '" y1="' + dimY + '" x2="' + (cx + halfS) + '" y2="' + dimY
      + '" stroke="#64748b" stroke-width="1"/>');
    g.push('<text x="' + cx + '" y="' + (dimY + 14) + '" fill="#94a3b8" font-size="10" font-family="monospace" '
      + 'text-anchor="middle">s = ' + fmt(s, 0) + ' mm' + (clipped ? '  (plating cut to fit)' : '') + '</text>');
    var beY = plateY - 9;
    g.push('<line x1="' + (cx - halfBe) + '" y1="' + beY + '" x2="' + (cx + halfBe) + '" y2="' + beY
      + '" stroke="#3b82f6" stroke-width="1"/>');
    g.push('<text x="' + (cx - halfBe - 6) + '" y="' + (beY + 3.5) + '" fill="#3b82f6" font-size="10" '
      + 'font-family="monospace" text-anchor="end">beff ' + fmt(beff, 0) + '</text>');
    // web depth
    g.push('<text x="' + (cx + Math.max(6, tw * scale / 2) + 8) + '" y="' + Y((flat ? 0 : tf) + hw / 2)
      + '" fill="#94a3b8" font-size="10" font-family="monospace">hw ' + fmt(hw, 0) + ' x ' + fmt(tw, 1) + '</text>');
    if (!flat && bf > 0) {
      g.push('<text x="' + cx + '" y="' + (yTop - 7) + '" fill="#94a3b8" font-size="10" font-family="monospace" '
        + 'text-anchor="middle">bf ' + fmt(bf, 0) + ' x ' + fmt(tf, 1) + '</text>');
    }

    host.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '">' + g.join('') + '</svg>';
    var note = document.getElementById('figureNote');
    if (note) {
      note.innerHTML = 'Net scantlings' + (N.gross ? ' (corrosion additions deducted from the gross values entered)' : '')
        + ': tp = ' + fmt(tp, 2) + ', tw = ' + fmt(tw, 2) + (flat ? '' : ', tf = ' + fmt(tf, 2)) + ' mm. '
        + 'The shaded strip is the effective width beff = ' + fmt(beff, 1) + ' mm used for the stiffener section, '
        + 'Sec 5 [2.3.4]; the dashed line is the neutral axis at w_na = ' + fmt(R.stiff.w_na, 1)
        + ' mm above the plate mid-plane.';
    }
  }

  function drawValidation() {
    var host = document.getElementById('validation');
    if (!host) return;
    host.innerHTML = S.res.valid.map(function (v) {
      return '<div class="nr-chip ' + v.state + '" title="' + esc(v.why) + '">'
        + '<span class="nr-chip-dot"></span><span class="nr-chip-label">' + esc(v.label) + '</span>'
        + '<span class="nr-chip-value">' + esc(v.value) + '</span></div>';
    }).join('');
  }

  /* -------------------------------------------------------- verdict bar */
  function drawVerdict() {
    var E = S.env, etaAll = E.etaAll;
    var b = band(E.worst, etaAll);
    var pct = Math.min(100, E.worst / Math.max(etaAll, 1e-9) * 80);   // eta_all sits at 80% of the track
    var stamp = E.overall === 'PASS' ? 'pass' : E.overall === 'CHECK' ? 'check' : 'fail';
    var slenCls = E.slenStatus === 'PASS' ? 'success' : 'error';
    var many = S.cases.length > 1;

    document.getElementById('verdict').innerHTML =
      '<div class="nr-verdict-item"><span class="nr-verdict-label">Worst utilisation'
      + (many ? ' · all ' + S.cases.length + ' load sets' : '') + '</span>'
      + '<div class="nr-uc"><div class="nr-uc-track"><div class="nr-uc-fill ' + b + '" style="width:' + pct + '%"></div>'
      + '<div class="nr-uc-limit" style="left:80%"></div></div>'
      + '<span class="nr-uc-num ' + b + '">' + fmt(E.worst, 3) + '</span></div></div>'
      + '<div class="nr-verdict-sep"></div>'
      + '<div class="nr-verdict-item"><span class="nr-verdict-label">Governing mode</span>'
      + '<span class="nr-verdict-value">' + esc(E.governing) + '</span></div>'
      + (many ? '<div class="nr-verdict-sep"></div>'
        + '<div class="nr-verdict-item"><span class="nr-verdict-label">Governing load set</span>'
        + '<span class="nr-verdict-value">' + esc(E.governingCase || '—') + '</span></div>' : '')
      + '<div class="nr-verdict-sep"></div>'
      + '<div class="nr-verdict-item"><span class="nr-verdict-label">eta_all</span>'
      + '<span class="nr-verdict-value">' + fmt(etaAll, 2) + '</span></div>'
      + '<div class="nr-verdict-sep"></div>'
      + '<div class="nr-verdict-item"><span class="nr-verdict-label">Slenderness · Sec 2</span>'
      + '<span class="nr-verdict-value" style="color:var(--' + slenCls + ')">' + E.slenStatus
      + (E.slenFails ? ' · ' + E.slenFails + ' fail' : '') + '</span></div>'
      + '<div class="nr-verdict-spacer"></div>'
      + '<span class="nr-stamp ' + stamp + '">' + E.overall + '</span>';
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

  /* -------------------------------------------------------------- flow */
  function renderPage() {
    var main = document.getElementById('main-' + S.page);
    if (S.page === 1) main.innerHTML = buildSetup();
    else if (S.page === 2) main.innerHTML = buildPanelPage();
    else if (S.page === 3) main.innerHTML = buildLoads();
    else if (S.page === 4) main.innerHTML = buildExtras();
    else if (S.page === 5) main.innerHTML = RESULTS.html(S);
    else if (S.page === 6) main.innerHTML = BATCH.html(S);
    bind(main);
    if (S.page === 2) { drawSection(); drawValidation(); }
    if (S.page === 6) BATCH.bind(S);
  }

  /* A change to a project text field cannot move a number, so skip the solve
     and only refresh what the edit actually touched. */
  var TEXT_ONLY = { vessel: 1, rules: 1, preparedBy: 1, revision: 1, notes: 1 };

  /* Solve every design load set against the current geometry. The detailed
     pages show the active set; the envelope reports the worst across all of
     them, which is what Sec 3 [1.1.3] actually asks for. */
  function caseInput(c) {
    var inp = Object.assign({}, S.inp);
    NRIN.CASE_KEYS.forEach(function (k) { inp[k] = c[k]; });
    return inp;
  }
  function solveCases() {
    S.caseRes = S.cases.map(function (c) { return NR615.solve(caseInput(c)); });
  }

  /* Per buckling mode, the worst utilisation over all load sets and which set
     produced it. Modes that report n/a or CHECK keep that status. */
  function envAcross() {
    var base = S.res.env, out = [];
    base.rows.forEach(function (r, ri) {
      var worst = null, wi = -1, anyCheck = false, allNa = true;
      S.caseRes.forEach(function (R, ci) {
        var row = R.env.rows[ri];
        if (row.status === 'check') anyCheck = true;
        if (typeof row.eta === 'number') {
          allNa = false;
          if (worst === null || row.eta > worst) { worst = row.eta; wi = ci; }
        }
      });
      out.push({
        key: r.key, name: r.name, ref: r.ref,
        eta: anyCheck ? null : (allNa ? undefined : worst),
        status: anyCheck ? 'check' : (allNa ? 'na' : (worst <= base.etaAll ? 'pass' : 'fail')),
        caseIdx: wi,
        caseName: wi >= 0 ? S.cases[wi].name : '',
        mode: wi >= 0 ? S.caseRes[wi].env.rows[ri].mode : r.mode
      });
    });
    var live = out.filter(function (r) { return typeof r.eta === 'number'; });
    var worst = live.length ? Math.max.apply(null, live.map(function (r) { return r.eta; })) : 0;
    var gov = live.filter(function (r) { return r.eta === worst; })[0];
    var anyCheck = out.some(function (r) { return r.status === 'check'; });
    /* Slenderness does not depend on the load set unless the sigma_ct cap is
       switched on, so take the worst of what the sets produced. */
    var slenFails = Math.max.apply(null, S.caseRes.map(function (R) { return R.slen.fails; }));
    var slenStatus = slenFails === 0 ? 'PASS' : 'FAIL';
    return {
      rows: out, etaAll: base.etaAll, worst: worst,
      governing: gov ? gov.name : '—',
      governingCase: gov && gov.caseIdx >= 0 ? S.cases[gov.caseIdx].name : '',
      anyCheck: anyCheck, slenFails: slenFails, slenStatus: slenStatus,
      overall: anyCheck ? 'CHECK' : (worst <= base.etaAll && slenStatus === 'PASS' ? 'PASS' : 'FAIL')
    };
  }

  function recalc(changedKey) {
    if (changedKey && TEXT_ONLY[changedKey]) return;
    S.res = NR615.solve(S.inp);
    solveCases();
    S.env = envAcross();
    drawVerdict();
    if (S.page === 2) { drawSection(); drawValidation(); }
    else if (S.page === 3) refreshCaseTable();
    else if (S.page === 4) refreshFoldStates();
    else if (S.page === 5) {
      var main = document.getElementById('main-5');
      main.innerHTML = RESULTS.html(S); bind(main);
    } else if (S.page === 6) { BATCH.refresh(S); }
  }

  /* The load-set table carries live utilisations, so redraw it in place —
     keeping the caret where it was, as the batch table does. */
  function refreshCaseTable() {
    var host = document.getElementById('caseTable');
    if (!host) return;
    var focus = document.activeElement;
    var ci = focus && focus.getAttribute && focus.getAttribute('data-case');
    var f = focus && focus.getAttribute && focus.getAttribute('data-field');
    var pos = focus && focus.selectionStart;
    host.innerHTML = caseTableHTML();
    bind(host);
    if (ci !== null && ci !== undefined) {
      var again = host.querySelector('[data-case="' + ci + '"][data-field="' + f + '"]');
      if (again) { again.focus(); try { again.selectionStart = again.selectionEnd = pos; } catch (e) { } }
    }
  }

  function refreshFoldStates() {
    // Cheapest correct thing: the fold headers carry live utilisations, so
    // rebuild the page but keep every open/closed state (they live in S.folds).
    var main = document.getElementById('main-4');
    var focus = document.activeElement, key = focus && focus.getAttribute && focus.getAttribute('data-key');
    var selStart = focus && focus.selectionStart;
    main.innerHTML = buildExtras(); bind(main);
    if (key) {
      var again = main.querySelector('[data-key="' + key + '"]');
      if (again) { again.focus(); try { again.selectionStart = again.selectionEnd = selStart; } catch (e) { } }
    }
  }

  function go(n) {
    S.page = n;
    PAGES.forEach(function (p) {
      document.getElementById('page-' + p.n).classList.toggle('active', p.n === n);
    });
    drawWizard();
    renderPage();
    window.scrollTo(0, 0);
  }

  function toggleFold(id) {
    S.folds[id] = !S.folds[id];
    var el = document.getElementById('fold-' + id);
    if (el) el.classList.toggle('open', !!S.folds[id]);
  }
  function toggleCheck(key) {
    S.open[key] = !S.open[key];
    var el = document.getElementById('chk-' + key);
    if (el) el.classList.toggle('open', !!S.open[key]);
  }

  /* --------------------------------------------------------- save/load */
  function saveJSON() {
    var payload = {
      app: 'NR615 Buckling', version: 2, savedAt: new Date().toISOString(),
      inp: S.inp, batch: S.batch, cases: S.cases, active: S.active
    };
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (S.inp.vessel || 'NR615').replace(/[^\w.-]+/g, '_') + '_buckling.json';
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
        Object.keys(base).forEach(function (k) { if (d.inp[k] !== undefined) base[k] = d.inp[k]; });
        S.inp = base;
        S.batch = Array.isArray(d.batch) && d.batch.length ? d.batch : [NRIN.batchRow(1, base)];
        /* Version 1 files predate load sets — the stresses they carry are the
           one set they had. */
        S.cases = Array.isArray(d.cases) && d.cases.length ? d.cases : [NRIN.loadCase('LC1', base)];
        S.active = Math.min(Math.max(0, d.active | 0), S.cases.length - 1);
        NRIN.CASE_KEYS.forEach(function (k) { S.inp[k] = S.cases[S.active][k]; });
        recalc(); go(S.page);
        toast('Loaded ' + f.name);
      } catch (e) { toast('Could not read that file: ' + e.message); }
      ev.target.value = '';
    };
    r.readAsText(f);
  }

  function activateCase(i) {
    if (!S.cases[i]) return;
    S.active = i;
    NRIN.CASE_KEYS.forEach(function (k) { S.inp[k] = S.cases[i][k]; });
    recalc();
    go(S.page);
    toast('Showing ' + S.cases[i].name);
  }
  function addCase() {
    S.cases.push(NRIN.loadCase('LC' + (S.cases.length + 1), S.inp));
    recalc(); refreshCaseTable();
  }
  function duplicateCase() {
    var src = S.cases[S.active] || S.inp;
    var c = NRIN.loadCase(src.name ? src.name + ' copy' : 'LC' + (S.cases.length + 1), src);
    S.cases.push(c);
    recalc(); refreshCaseTable();
  }
  function removeCase(i) {
    if (S.cases.length <= 1) { toast('Keep at least one load set'); return; }
    S.cases.splice(i, 1);
    if (S.active >= S.cases.length) S.active = S.cases.length - 1;
    else if (S.active > i) S.active--;
    NRIN.CASE_KEYS.forEach(function (k) { S.inp[k] = S.cases[S.active][k]; });
    recalc(); go(S.page);
  }

  /* Called by IMPORT once a workbook has been read and validated. */
  function applyImport(res, fileName) {
    S.inp = res.inp;
    if (res.batch && res.batch.length) S.batch = res.batch;
    /* The workbook held one stress set, so that becomes the first load set. */
    S.cases = [NRIN.loadCase('LC1 — from workbook', res.inp)];
    S.active = 0;
    S.imported = {
      file: fileName, count: res.count, notes: res.notes,
      batchCount: res.batch ? res.batch.length : 0
    };
    recalc();
    go(1);
    toast('Imported ' + res.count + ' values from ' + fileName
      + (res.notes.length ? ' — ' + res.notes.length + ' note(s)' : ''));
  }
  function dismissImport() { S.imported = null; go(S.page); }

  function boot() {
    S.cases = [NRIN.loadCase('LC1 — design', S.inp)];
    S.active = 0;
    S.batch = [NRIN.batchRow(1, S.inp)];
    recalc();
    drawWizard(); go(1);
  }

  return {
    S: S, boot: boot, go: go, recalc: recalc, toggleFold: toggleFold, toggleCheck: toggleCheck,
    saveJSON: saveJSON, loadJSON: loadJSON, toast: toast,
    applyImport: applyImport, dismissImport: dismissImport,
    activateCase: activateCase, addCase: addCase, duplicateCase: duplicateCase, removeCase: removeCase,
    caseInput: caseInput,
    esc: esc, fmt: fmt, band: band, rows: rows, panel: panel, bind: bind,
    exportPDF: function () { EXPORT.pdf(S); }, exportExcel: function () { EXPORT.excel(S); }
  };
})();
