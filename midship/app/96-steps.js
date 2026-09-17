/*
 * 96-steps.js — six-step design flow on top of the existing pages.
 *
 * The engine already has every editor the flow needs; what it lacked was an
 * order. This module maps the design sequence
 *
 *     1 Ship  ->  2 Section  ->  3 Positions  ->  4 Strakes  ->  5 Stiffeners  ->  6 Check
 *
 * onto the three real pages (Setup / Geometry / Summary): steps 2-5 all live on
 * the Geometry page and differ only in which editor tab and drawing view are
 * open, plus a strip at the top saying what to do here and what is still
 * missing. Nothing in the calculation path changes; goToPage() and the editor
 * keep working exactly as before, this file only drives them.
 */
(function () {
  'use strict';

  var STEPS = [
    { n: 1, key: 'ship',       label: 'Ship',       page: 1,
      title: 'Ship particulars',
      hint: 'Identification, class, main dimensions, still-water bending moments, material family, ice class. Everything the rules need before a section exists.' },
    { n: 2, key: 'section',    label: 'Section',    page: 3, tab: 'geometry', view: 'general',
      title: 'Section geometry',
      hint: 'Set the nine geometry parameters — half beam, inner bottom, tween and upper deck, coaming, bilge radius, keel, duct keel, inner side. The drawing follows every change.' },
    { n: 3, key: 'positions',  label: 'Positions',  page: 3, tab: 'positions', view: 'position',
      title: 'Positions & arrangement',
      hint: 'Side girders, stringer / tween deck levels, watertight flags and compartments — all in the Layout tab. Position codes are shown on the drawing; compartment contents are edited in the Comp tab.' },
    { n: 4, key: 'strakes',    label: 'Strakes',    page: 3, tab: 'strakes', view: 'thickness',
      title: 'Strakes & plate thickness',
      hint: 'Divide each panel into strakes and set thickness and grade. Keep Auto on to let the engine seed them, or edit freely — the last strake fits the panel. Run the plate optimizer from Analysis mode when the layout is right.' },
    { n: 5, key: 'stiffeners', label: 'Stiffeners', page: 3, tab: 'params', view: 'profile',
      title: 'Stiffener spacing & profiles',
      hint: 'First the spacings and profile types per surface (Params tab), then the individual profiles (Prof tab). Auto-recalculate regenerates positions from the spacing; optimizers size the profiles against the rules.' },
    { n: 6, key: 'check',      label: 'Check',      page: 4,
      title: 'Rule check & report',
      hint: 'Hull girder, local scantling and buckling results for every element. Export PDF / Excel / DXF from the header.' }
  ];

  var KEY = 'midship_step_v1';
  var current = 1;

  // ------------------------------------------------------------------ helpers
  function $(id) { return document.getElementById(id); }
  function numVal(id) { var el = $(id); var v = el ? parseFloat(el.value) : NaN; return isNaN(v) ? null : v; }
  function D() { return window.Draw || {}; }
  function stepByN(n) { return STEPS[Math.min(Math.max(n, 1), STEPS.length) - 1]; }

  function clickEditorTab(key) {
    var btn = document.querySelector('.ed-tab[data-ed-tab="' + key + '"]');
    if (btn && !btn.classList.contains('active')) btn.click();
  }
  function setView(mode) {
    if (D().setViewMode) { try { D().setViewMode(mode); return; } catch (_) {} }
    var pill = document.querySelector('.view-pill[data-viewmode="' + mode + '"]');
    if (pill && !pill.classList.contains('active')) pill.click();
  }

  // ------------------------------------------------------------ completeness
  // Each check returns { ok: bool, items: [{ok, text}] }. Advisory, never a
  // hard gate — the user knows better than a checklist when a step is done,
  // but the strip should say plainly what is still blank.
  var CHECKS = {
    1: function () {
      var items = [];
      var req = [['vesselName', 'Vessel name'], ['L', 'L'], ['B', 'B'], ['D', 'D'], ['T', 'T'], ['Cb', 'C_b']];
      req.forEach(function (r) {
        var el = $(r[0]); var v = el ? el.value.trim() : '';
        items.push({ ok: !!v, text: r[1] + (v ? '' : ' — blank') });
      });
      var ms = numVal('MsDesign'), sag = numVal('MsSag');
      items.push({ ok: ms != null && sag != null, text: 'Still-water moments M_s hog / sag' + ((ms == null || sag == null) ? ' — blank (loading manual)' : '') });
      return items;
    },
    2: function () {
      var g = D().GEOMETRY || {}; var items = [];
      var ok = function (c, t) { items.push({ ok: !!c, text: t }); };
      ok(g.B_half > 0, 'Half beam ' + (g.B_half || '—') + ' mm');
      ok(g.IB > 0 && g.IB < g.UD, 'Inner bottom below upper deck');
      var lv = D().levelZs ? D().levelZs('tween') : (g.TT != null ? [g.TT] : []);
      ok(!lv.length || (lv[0] > g.IB && lv[0] <= g.UD), lv.length ? 'Tween deck at ' + lv[0] + ' mm, between inner bottom and upper deck' : 'No tween deck (single-deck hold)');
      var st = D().levelZs ? D().levelZs('stringer') : [];
      ok(true, st.length ? st.length + ' side stringer level' + (st.length > 1 ? 's' : '') : 'No side stringer');
      ok(g.HC >= g.UD, (g.HC > g.UD) ? 'Hatch coaming ' + (g.HC - g.UD) + ' mm above deck' : 'No hatch coaming');
      ok(g.IS > g.duct_half && g.IS < g.B_half, 'Inner side between duct keel and half beam');
      ok(g.R_B > 0 && g.R_B <= g.UD, 'Bilge radius');
      return items;
    },
    3: function () {
      var d = D(); var items = [];
      var sg = (d.SIDE_GIRDERS || []).length, comp = (d.COMPARTMENTS || []).length;
      items.push({ ok: sg > 0, text: sg + ' side girder' + (sg === 1 ? '' : 's') });
      var lv = ((d.profiles || {}).stringer || []).length + ((d.profiles || {}).tweenDeck || []).length;
      items.push({ ok: lv > 0, text: lv + ' stringer / tween level' + (lv === 1 ? '' : 's') });
      items.push({ ok: comp > 0, text: comp + ' compartment' + (comp === 1 ? '' : 's') + ' defined (Comp tab)' });
      var wt = d.WT_FLAGS || {}; var wtN = Object.keys(wt).length;
      items.push({ ok: wtN > 0, text: 'Watertight flags set' });
      return items;
    },
    4: function () {
      var d = D(); var S = d.STRAKES || {}; var items = [];
      var panels = 0, empty = [], thin = [];
      var d0 = D();
      Object.keys(S).forEach(function (k) {
        var arr = S[k]; if (!Array.isArray(arr)) return;
        // legacy flat unions and switched-off elements are not panels
        if (k === 'stringer' || k === 'tween') return;
        if (k === 'coamingTop' && !(d0.PARAMS && d0.PARAMS.coamingTop > 0)) return;
        panels++;
        if (!arr.length) empty.push(k);
        arr.forEach(function (s) { if (!(s.thick > 0 || s.t > 0 || s.thickness > 0)) thin.push(k); });
      });
      items.push({ ok: panels > 0 && empty.length === 0, text: panels + ' panels, ' + (empty.length ? empty.length + ' without strakes: ' + empty.slice(0, 4).join(', ') : 'all have strakes') });
      items.push({ ok: thin.length === 0, text: thin.length ? thin.length + ' strake(s) without thickness' : 'Every strake has a thickness' });
      items.push({ ok: true, text: (d.getStrakesAuto && d.getStrakesAuto()) ? 'Auto strakes ON — engine keeps panels fitted' : 'Auto strakes OFF — check each panel reads "fits"' });
      return items;
    },
    5: function () {
      var d = D(); var P = d.profiles || {}; var PR = d.PARAMS || {}; var items = [];
      // Rows either carry their own profileName or fall back to the group
      // default chosen on the Setup form (bottomLongProfile etc.). Both count
      // as sized; only report the split so the user knows what is custom.
      var total = 0, custom = 0;
      Object.keys(P).forEach(function (k) {
        (P[k] || []).forEach(function (p) { total++; if (p.profileName) custom++; });
      });
      items.push({ ok: PR.dbSpacing > 0 && PR.sideSpacing > 0, text: 'Spacing: DB ' + (PR.dbSpacing || '—') + ' · side ' + (PR.sideSpacing || '—') + ' mm (Params tab)' });
      items.push({ ok: total > 0, text: total ? total + ' stiffeners — ' + custom + ' with a custom profile, ' + (total - custom) + ' on the group default' : 'No stiffeners yet — set spacings and Auto-recalculate' });
      var le = numVal('le');
      items.push({ ok: le != null && le > 0, text: 'l_e (web frame span) ' + (le != null ? le + ' m' : '— blank, optimizers assume 1.5 m') });
      return items;
    },
    6: function () {
      var items = [];
      var fail = parseInt(($('cntFail') || {}).textContent) || 0;
      var okN = parseInt(($('cntOk') || {}).textContent) || 0;
      items.push({ ok: okN > 0, text: okN ? okN + ' checks OK' : 'Analysis not run yet — press Run Analysis on the Geometry page' });
      items.push({ ok: fail === 0, text: fail ? fail + ' FAIL' : 'No failing elements' });
      return items;
    }
  };

  // ------------------------------------------------------------------ strip
  function stripHtml(step) {
    var items = [];
    try { items = CHECKS[step.n] ? CHECKS[step.n]() : []; } catch (_) { items = []; }
    var open = items.filter(function (i) { return !i.ok; }).length;
    var h = '<div class="step-strip" data-step="' + step.n + '">';
    h += '<div class="step-strip-main">';
    h += '<div class="step-strip-title"><span class="step-strip-num">' + step.n + '<span>/' + STEPS.length + '</span></span>' + step.title + '</div>';
    h += '<div class="step-strip-hint">' + step.hint + '</div>';
    h += '</div>';
    h += '<ul class="step-strip-checks" title="What this step still needs">';
    items.forEach(function (i) {
      h += '<li class="' + (i.ok ? 'ok' : 'todo') + '">' + (i.ok ? '&#10003;' : '&#9679;') + ' ' + i.text + '</li>';
    });
    h += '</ul>';
    h += '<div class="step-strip-nav">';
    h += '<button class="ea-btn ea-btn-secondary ea-btn-sm" onclick="stepPrev()" ' + (step.n === 1 ? 'disabled' : '') + '>&larr; ' + (step.n > 1 ? stepByN(step.n - 1).label : 'Back') + '</button>';
    if (step.n < STEPS.length) {
      h += '<button class="ea-btn ea-btn-primary ea-btn-sm" onclick="stepNext()">' + stepByN(step.n + 1).label + ' &rarr;' + (open ? ' <span class="step-strip-open">' + open + ' open</span>' : '') + '</button>';
    } else {
      h += '<button class="ea-btn ea-btn-primary ea-btn-sm" onclick="exportPDF && exportPDF()">Report &rarr;</button>';
    }
    h += '</div></div>';
    return h;
  }

  function mountStrip(step) {
    document.querySelectorAll('.step-strip-host').forEach(function (el) { el.innerHTML = ''; });
    var page = $('page-' + step.page); if (!page) return;
    var host = page.querySelector('.step-strip-host');
    if (!host) {
      host = document.createElement('div');
      host.className = 'step-strip-host';
      var main = page.querySelector('.ea-main') || page;
      main.insertBefore(host, main.firstChild);
    }
    host.innerHTML = stripHtml(step);
  }

  function refreshStrip() {
    var step = stepByN(current);
    var host = $('page-' + step.page) && $('page-' + step.page).querySelector('.step-strip-host');
    if (host) host.innerHTML = stripHtml(step);
  }

  // ------------------------------------------------------------------- nav
  function paintNav(n) {
    document.querySelectorAll('.ea-wizard-step').forEach(function (b) {
      var s = parseInt(b.dataset.step);
      b.classList.toggle('active', s === n);
      b.classList.toggle('completed', s < n);
    });
    document.querySelectorAll('.ea-wizard-line').forEach(function (l, i) { l.classList.toggle('completed', i < n - 1); });
    var back = document.querySelector('#bottomStatusBar .sb-nav-btn.back');
    var fwd = document.querySelector('#bottomStatusBar .sb-nav-btn.fwd');
    if (back) { back.textContent = '← ' + (n > 1 ? stepByN(n - 1).label : 'Back'); back.onclick = stepPrev; }
    if (fwd) { fwd.textContent = (n < STEPS.length ? stepByN(n + 1).label : 'Report') + ' →'; fwd.onclick = stepNext; }
  }

  function goToStep(n) {
    var step = stepByN(n);
    current = step.n;
    try { localStorage.setItem(KEY, String(current)); } catch (_) {}
    if (typeof window.goToPage === 'function') window.goToPage(step.page);
    paintNav(current);
    mountStrip(step);
    if (step.page === 3) {
      // First visit with no remembered layout: start with the left panel as
      // a rail and the floating Info card closed, so the model has the room.
      try {
        if (!localStorage.getItem('midship_layout')) {
          var grid = document.querySelector('.main-grid');
          if (grid && !grid.classList.contains('left-collapsed') && window.toggleSidePanel) window.toggleSidePanel('left');
        }
        if (!localStorage.getItem('midship_info_overlay')) {
          var ov = $('infoOverlay'), sb = $('infoOverlayShowBtn');
          if (ov && sb && ov.style.display !== 'none') { ov.style.display = 'none'; sb.style.display = 'inline-flex'; }
        }
      } catch (_) {}
      // goToPage(3) initialises the drawing on a 50 ms tick and the editor a
      // little after; switch tab/view once both exist, then refresh the checks.
      var tries = 0;
      (function arm() {
        var ready = document.querySelector('.ed-tab') && document.querySelector('.view-pill');
        if (!ready && tries++ < 40) return setTimeout(arm, 100);
        if (step.tab) clickEditorTab(step.tab);
        if (step.view) setView(step.view);
        refreshStrip();
      })();
    }
    document.body.setAttribute('data-step', String(current));
  }
  function stepNext() { goToStep(current + 1); }
  function stepPrev() { goToStep(current - 1); }

  // Old callers (Back / View Summary buttons, Project.createProject) still
  // call goToPage(); keep the step model in sync when they do.
  function hookGoToPage() {
    var orig = window.goToPage;
    if (typeof orig !== 'function' || orig.__stepHooked) return;
    var wrapped = function (n) {
      var r = orig.apply(this, arguments);
      if (n === 2) n = 3;
      var s = n === 1 ? 1 : n === 4 ? 6 : (current >= 2 && current <= 5 ? current : 2);
      if (s !== current) { current = s; try { localStorage.setItem(KEY, String(current)); } catch (_) {} }
      paintNav(current);
      mountStrip(stepByN(current));
      document.body.setAttribute('data-step', String(current));
      return r;
    };
    wrapped.__stepHooked = true;
    window.goToPage = wrapped;
  }

  // Refresh the checklist when the user edits anything on the current page.
  function wireRefresh() {
    var t = null;
    var bump = function () { clearTimeout(t); t = setTimeout(refreshStrip, 250); };
    document.addEventListener('change', bump, true);
    document.addEventListener('input', bump, true);
    document.addEventListener('click', function (e) {
      if (e.target.closest && e.target.closest('.ed-add-btn, .ed-del-btn, #recalcBtn, #runAnalysisBtn, [data-sg-del], #sgAdd')) bump();
    }, true);
  }

  // A new project lands on step 2 — the section is the first thing to shape.
  function hookProject() {
    if (!window.Project || typeof window.Project.createProject !== 'function' || window.Project.createProject.__stepHooked) return;
    var orig = window.Project.createProject;
    var wrapped = function () {
      var before = document.getElementById('newProjectModal');
      var r = orig.apply(this, arguments);
      // createProject closes the modal only when validation passed.
      if (before && !before.classList.contains('open')) setTimeout(function () { goToStep(2); }, 700);
      return r;
    };
    wrapped.__stepHooked = true;
    window.Project.createProject = wrapped;
  }

  function boot() {
    hookGoToPage();
    hookProject();
    wireRefresh();
    var saved = 1;
    try { saved = parseInt(localStorage.getItem(KEY)) || 1; } catch (_) {}
    if (/[?&]fresh=1/.test(location.search) || location.hash === '#fresh') saved = 1;
    // 95-project.js restores an autosaved project by visiting the Geometry
    // page and coming back to Setup (~600 ms). Land on the remembered step
    // only after that dance is over, otherwise it is overwritten.
    var hasProject = false;
    try { hasProject = !!localStorage.getItem('midship_project_v1'); } catch (_) {}
    if (hasProject && saved !== 1) setTimeout(function () { goToStep(saved); }, 1300);
    else goToStep(saved);
  }

  window.STEPS = STEPS;
  window.goToStep = goToStep;
  window.stepNext = stepNext;
  window.stepPrev = stepPrev;
  window.refreshStepStrip = refreshStrip;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(boot, 0); });
  else setTimeout(boot, 0);
})();
