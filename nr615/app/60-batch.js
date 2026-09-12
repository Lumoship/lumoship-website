/* ============================================================================
   Batch check. Every row runs the SAME engine as the single-panel pages, so
   there is no simplified stiffener model and no "indicative, excluded" column
   to reconcile afterwards — the workbook needed both because it could not
   repeat the exact Sec 5 [2.3.3] bisection twenty times. Rows are unlimited.

   Anything not listed as a column is inherited from the main input set: the
   material, the analysis control, the Tab 4 cases, the end restraint and so on.
   ============================================================================ */

window.BATCH = (function () {
  'use strict';

  function esc(s) { return UI.esc(s); }
  function fmt(v, dp) { return UI.fmt(v, dp); }
  function band(v, a) { return UI.band(v, a); }

  /* Per-panel scope: the four modes that actually vary panel to panel. The
     pillar, corrugation, curved and opening checks are properties of other
     structure and stay on the Extras page. */
  function solveRow(base, row) {
    var inp = Object.assign({}, base, {
      a: row.a, b: row.b, tp: row.tp, s: row.s, l: row.l,
      profile: row.profile, hw: row.hw, tw: row.tw, bf: row.bf, tf: row.tf,
      sx: row.sx, sy: row.sy, tau: row.tau, psix: row.psix, psiy: row.psiy,
      ReHP: row.ReHP, ReHS: row.ReHS, P: row.P, MCL: row.MCL
    });
    var R = NR615.solve(inp);
    var modes = [
      { name: 'Plate', eta: R.plate.eta },
      { name: 'Overall panel', eta: R.panel.eta },
      { name: 'Stiffener SI', eta: R.stiff.SI.na ? null : R.stiff.SI.eta },
      { name: 'Stiffener PI', eta: R.stiff.PI.na ? null : R.stiff.PI.eta }
    ];
    var live = modes.filter(function (m) { return typeof m.eta === 'number'; });
    var check = modes.some(function (m) { return m.eta === null; });
    var worst = live.length ? Math.max.apply(null, live.map(function (m) { return m.eta; })) : 0;
    var gov = live.filter(function (m) { return m.eta === worst; })[0];
    return {
      R: R, modes: modes, worst: worst, check: check,
      gov: check ? 'CHECK' : (gov ? gov.name : '—'),
      status: check ? 'check' : (worst <= base.etaAll ? 'pass' : 'fail')
    };
  }

  function solveAll(S) {
    return S.batch.map(function (row) { return solveRow(S.inp, row); });
  }

  /* ---------------------------------------------------------------- view */
  function html(S) {
    var out = solveAll(S);
    var worstIdx = -1, worstVal = -1;
    out.forEach(function (o, i) { if (!o.check && o.worst > worstVal) { worstVal = o.worst; worstIdx = i; } });
    var fails = out.filter(function (o) { return o.status === 'fail'; }).length;
    var checks = out.filter(function (o) { return o.check; }).length;

    var toolbar = '<div class="nr-toolbar">'
      + '<button class="ea-btn ea-btn-primary ea-btn-sm" onclick="BATCH.add()">+ Add panel</button>'
      + '<button class="ea-btn ea-btn-secondary ea-btn-sm" onclick="BATCH.duplicate()">Duplicate last</button>'
      + '<button class="ea-btn ea-btn-secondary ea-btn-sm" onclick="BATCH.fromCurrent()">Add from current panel</button>'
      + (S.cases.length > 1
        ? '<button class="ea-btn ea-btn-secondary ea-btn-sm" onclick="BATCH.expandCases()" '
        + 'title="Replace every row with one row per panel and design load set, so Sec 3 [1.1.3] is covered explicitly">'
        + 'Expand across ' + S.cases.length + ' load sets</button>' : '')
      + '<button class="ea-btn ea-btn-secondary ea-btn-sm" onclick="BATCH.sort()">Sort by utilisation</button>'
      + '<button class="ea-btn ea-btn-secondary ea-btn-sm" onclick="BATCH.pushWorst()">Load worst into the main pages</button>'
      + '<span class="nr-spacer"></span>'
      + '<span class="badge ' + (fails || checks ? 'badge-orange' : 'badge-green') + '">'
      + S.batch.length + ' panel' + (S.batch.length === 1 ? '' : 's')
      + ' · ' + fails + ' fail' + (checks ? ' · ' + checks + ' check' : '') + '</span>'
      + '</div>';

    var head = '<thead><tr>'
      + '<th></th>'
      + NRIN.BATCH_FIELDS.map(function (f) {
        return '<th>' + esc(f.label) + (f.unit ? '<br><span style="font-weight:400;text-transform:none">'
          + esc(f.unit) + '</span>' : '') + '</th>';
      }).join('')
      + '<th>alpha</th><th>Cx</th><th>Cy</th><th>C_tau</th>'
      + '<th>eta plate</th><th>eta panel</th><th>eta SI</th><th>eta PI</th>'
      + '<th>eta max</th><th>Governing</th><th>Status</th></tr></thead>';

    var body = S.batch.map(function (row, i) {
      var o = out[i], et = S.inp.etaAll;
      var cells = NRIN.BATCH_FIELDS.map(function (f) {
        var v = row[f.k];
        if (f.t === 'select') {
          return '<td><select data-row="' + i + '" data-field="' + f.k + '">'
            + f.opts.map(function (op) {
              return '<option value="' + esc(op) + '"' + (op === v ? ' selected' : '') + '>' + esc(op) + '</option>';
            }).join('') + '</select></td>';
        }
        var cls = f.t === 'text' ? ' class="name"' : '';
        return '<td' + cls + '><input type="' + (f.t === 'text' ? 'text' : 'number')
          + '" data-row="' + i + '" data-field="' + f.k + '" value="' + esc(v) + '"></td>';
      }).join('');

      function eta(v) {
        if (v === null) return '<td class="eta na">CHECK</td>';
        return '<td class="eta ' + band(v, et) + '">' + fmt(v, 3) + '</td>';
      }
      return '<tr' + (i === worstIdx ? ' class="worst"' : '') + '>'
        + '<td class="rowdel"><button title="Remove this panel" onclick="BATCH.remove(' + i + ')">&times;</button></td>'
        + cells
        + '<td class="out">' + fmt(o.R.coef.alpha, 2) + '</td>'
        + '<td class="out">' + fmt(o.R.plate.Cx, 3) + '</td>'
        + '<td class="out">' + fmt(o.R.plate.Cy, 3) + '</td>'
        + '<td class="out">' + fmt(o.R.plate.Ctau, 3) + '</td>'
        + eta(o.modes[0].eta) + eta(o.modes[1].eta) + eta(o.modes[2].eta) + eta(o.modes[3].eta)
        + '<td class="eta ' + (o.check ? 'na' : band(o.worst, et)) + '">' + (o.check ? '—' : fmt(o.worst, 3)) + '</td>'
        + '<td>' + esc(o.gov) + '</td>'
        + '<td class="eta ' + (o.status === 'pass' ? 'ok' : o.status === 'fail' ? 'over' : 'near') + '">'
        + (o.status === 'check' ? 'CHECK' : o.status.toUpperCase()) + '</td></tr>';
    }).join('');

    return toolbar
      + '<div class="nr-batch-wrap"><table class="nr-batch">' + head + '<tbody>' + body + '</tbody></table></div>'
      + '<div class="nr-hint" style="margin-top:var(--spacing-md)">'
      + 'Each row runs the full Sec 5 chain — plate capacity, overall stiffened panel and the exact Sec 5 [2.3.3] '
      + 'stiffener bisection for both failure modes. There is no simplified batch model here, so a row that governs '
      + 'needs no second pass on the Panel pages; <b>Load worst into the main pages</b> only moves it there so you can '
      + 'read the derivation.</div>'
      + '<div class="nr-hint">Columns not shown are inherited from the main input set: material constants, the analysis '
      + 'control, Tab 4 cases, end restraint, panel location, eta_all and S. Change those on the earlier pages and every '
      + 'row follows.</div>'
      + '<div class="nr-hint">Each row carries its own loading, because hull girder stress varies panel to panel as well '
      + 'as case to case. So a row is one panel <b>in one design load set</b>, not a panel across all of them. '
      + (S.cases.length > 1
        ? 'Use <b>Expand across ' + S.cases.length + ' load sets</b> to write out the combinations explicitly — '
        + 'it replaces each row with one row per load set and names them accordingly. Adjust the stresses afterwards '
        + 'where a panel sees a different value in a given set.'
        : 'Define more sets on the Loads page if the assessment needs them — Sec 3 [1.1.3].')
      + '</div>';
  }

  /* -------------------------------------------------------------- events */
  function bind(S) {
    var host = document.getElementById('main-6');
    if (!host) return;
    Array.prototype.forEach.call(host.querySelectorAll('[data-row]'), function (el) {
      var ev = el.tagName === 'SELECT' ? 'change' : 'input';
      el.addEventListener(ev, function () {
        var i = parseInt(el.getAttribute('data-row'), 10);
        var f = el.getAttribute('data-field');
        var spec = NRIN.BATCH_FIELDS.filter(function (x) { return x.k === f; })[0];
        S.batch[i][f] = (spec && (spec.t === 'text' || spec.t === 'select'))
          ? el.value : (el.value === '' ? 0 : parseFloat(el.value));
        refresh(S, el);
      });
    });
  }

  /* Redraw without losing the caret: remember which cell had focus, rebuild,
     then put the cursor back where it was. */
  function refresh(S, keepEl) {
    var host = document.getElementById('main-6');
    if (!host) return;
    var r = keepEl && keepEl.getAttribute('data-row'), f = keepEl && keepEl.getAttribute('data-field');
    var pos = keepEl && keepEl.selectionStart;
    host.innerHTML = html(S);
    bind(S);
    if (r !== null && r !== undefined) {
      var again = host.querySelector('[data-row="' + r + '"][data-field="' + f + '"]');
      if (again) { again.focus(); try { again.selectionStart = again.selectionEnd = pos; } catch (e) { } }
    }
  }

  function rerender() { var S = UI.S; refresh(S); }

  function add() {
    var S = UI.S;
    S.batch.push(NRIN.batchRow(S.batch.length + 1, S.inp));
    rerender();
  }
  function duplicate() {
    var S = UI.S;
    if (!S.batch.length) return add();
    var copy = Object.assign({}, S.batch[S.batch.length - 1]);
    copy.name = 'Panel ' + (S.batch.length + 1);
    S.batch.push(copy); rerender();
  }
  function fromCurrent() {
    var S = UI.S;
    var row = NRIN.batchRow(S.batch.length + 1, S.inp);
    row.name = 'Panel ' + (S.batch.length + 1);
    S.batch.push(row); rerender();
    UI.toast('Added the current panel as a new batch row');
  }
  function remove(i) {
    var S = UI.S;
    if (S.batch.length <= 1) { UI.toast('Keep at least one panel'); return; }
    S.batch.splice(i, 1); rerender();
  }
  /* Write the panel x load-set product out as explicit rows. Nothing hidden:
     each new row is a real, editable panel carrying that set's loading, so a
     stress that differs for one panel in one set can simply be typed in. */
  function expandCases() {
    var S = UI.S;
    if (S.cases.length < 2) return;
    var base = S.batch.slice();
    var out = [];
    base.forEach(function (row) {
      S.cases.forEach(function (c) {
        var copy = Object.assign({}, row);
        NRIN.CASE_KEYS.forEach(function (k) { if (k in copy) copy[k] = c[k]; });
        copy.name = row.name + ' · ' + c.name;
        out.push(copy);
      });
    });
    S.batch = out;
    rerender();
    UI.toast(base.length + ' panel' + (base.length === 1 ? '' : 's') + ' x ' + S.cases.length
      + ' load sets = ' + out.length + ' rows');
  }

  function sort() {
    var S = UI.S;
    var out = solveAll(S);
    var pairs = S.batch.map(function (r, i) { return { r: r, w: out[i].check ? Infinity : out[i].worst }; });
    pairs.sort(function (x, y) { return y.w - x.w; });
    S.batch = pairs.map(function (p) { return p.r; });
    rerender(); UI.toast('Sorted, worst first');
  }
  function pushWorst() {
    var S = UI.S;
    var out = solveAll(S);
    var bi = -1, bw = -1;
    out.forEach(function (o, i) { if (!o.check && o.worst > bw) { bw = o.worst; bi = i; } });
    if (bi < 0) { UI.toast('No numeric result to load'); return; }
    var row = S.batch[bi];
    ['a', 'b', 'tp', 's', 'l', 'profile', 'hw', 'tw', 'bf', 'tf', 'sx', 'sy', 'tau', 'psix', 'psiy',
      'ReHP', 'ReHS', 'P', 'MCL'].forEach(function (k) { S.inp[k] = row[k]; });
    /* The loading came with the panel, so the active load set has to follow it
       or the detailed pages would describe something else. */
    if (S.cases[S.active]) NRIN.CASE_KEYS.forEach(function (k) { S.cases[S.active][k] = S.inp[k]; });
    UI.recalc(); UI.go(5);
    UI.toast('Loaded ' + row.name + ' into the main pages');
  }

  return {
    html: html, bind: bind, refresh: refresh, solveRow: solveRow, solveAll: solveAll,
    add: add, duplicate: duplicate, fromCurrent: fromCurrent, remove: remove, sort: sort,
    pushWorst: pushWorst, expandCases: expandCases
  };
})();
