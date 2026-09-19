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
    { n: 1, key: 'ship',       label: 'Main particulars',       page: 1,
      title: 'Ship particulars',
      hint: 'Identification, class, main dimensions, still-water bending moments, material family, ice class. Everything the rules need before a section exists.' },
    { n: 2, key: 'section',    label: 'Geometry',   page: 3, tab: 'geometry', view: 'section',
      title: 'Section geometry',
      hint: 'Lines and nodes only. Start from the Ship Geometry parameters, add girders / decks with Add panel, or draw with the Line, Arc and Node tools. Set bending / shear efficiency and watertightness per panel.' },
    { n: 3, key: 'supports',   label: 'Supports',   page: 3, tab: null, view: 'supports',
      title: 'Supports & spans',
      hint: 'Per panel: the transverse primary members that support the plating and longitudinals (aft / fore frame → span), and any areas supported differently.' },
    { n: 4, key: 'strakes',    label: 'Strakes',    page: 3, tab: null, view: 'strakes',
      title: 'Strakes & plate thickness',
      hint: 'Pick a panel and split it into strakes along its length: length, thickness, grade. Lengths must add up to the panel length. Seed from Auto fills empty panels from the engine layout.' },
    { n: 5, key: 'stiffeners', label: 'Stiffeners', page: 3, tab: null, view: 'stiffeners',
      title: 'Stiffeners',
      hint: 'Set the default span, then per panel add groups: start node, first offset, spacing, count, direction, profile type and size, grade. Stiffeners that do not fit on the panel are flagged.' },
    { n: 6, key: 'compartments', label: 'Compartments', page: 3, tab: null, view: 'compartments',
      title: 'Compartments',
      hint: 'Tanks and spaces bounded by panels: type, density, air pipe height, test head, cargo load. These feed the tank heads and cargo loads in the rule checks.' },
    { n: 7, key: 'bulkheads',  label: 'Bulkheads',  page: 5,
      title: 'Bulkheads',
      hint: 'Transverse and longitudinal bulkheads. Nothing to define here yet.' },
    { n: 8, key: 'check',      label: 'Results',    page: 4,
      title: 'Rule check & report',
      hint: 'Hull girder, local scantling and buckling results for every element. Export the report (PDF), Excel or DXF with the buttons at the bottom of this page.' },
    { n: 9, key: 'profiles',   label: 'Profiles',   page: 6,
      title: 'Profiles', hint: 'Stiffener catalogue (HP, L, T, FB) and custom sizes; the filter preference for the optimizer.' },
    { n: 10, key: 'compartments', label: 'Compartments', page: 7,
      title: 'Compartments', hint: 'Every compartment of every section — type, density, air pipe and test head. Boundaries are drawn in the section.' }
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
        items.push({ ok: !!v, level: r[0] === 'vesselName' ? 'warn' : 'error', text: r[1] + (v ? '' : ' — blank'), fix: v ? '' : 'Enter ' + r[1] + ' on the Ship page', focus: r[0] });
      });
      var ms = numVal('MsDesign'), sag = numVal('MsSag');
      items.push({ ok: ms != null && sag != null, level: 'error', text: 'Still-water moments M_s hog / sag' + ((ms == null || sag == null) ? ' — blank' : ''), fix: 'Enter M_s hogging and sagging (loading manual)', focus: 'MsDesign' });
      return items;
    },
    2: function () {
      // Section model (05-model.js): counts, closed hull chain, model-check issues.
      var items = []; var S = D().getSection ? D().getSection() : null;
      var ok = function (c, t) { items.push({ ok: !!c, text: t }); };
      if (!S) { ok(false, 'Section model not built yet'); return items; }
      var byPos = {}; S.panels.forEach(function (p) { byPos[p.position || 'none'] = (byPos[p.position || 'none'] || 0) + 1; });
      var ok2 = function (c, t, level, fix) { items.push({ ok: !!c, text: t, level: level || 'warn', fix: fix || '' }); };
      ok2(S.panels.length > 0, S.nodes.length + ' nodes · ' + S.panels.length + ' segments' + (S.manual ? ' (hand-edited)' : ' (from parameters)'), 'error', 'Draw or generate the section');
      ok2(byPos.bottom && byPos.side, 'Shell: bottom' + (byPos.bilge ? ' · bilge' : '') + ' · side' + (byPos.bottom && byPos.side ? '' : ' — missing'), 'error', 'The section needs bottom and side shell segments');
      ok2(byPos.upperDeck || byPos.deck, (byPos.upperDeck || byPos.deck) ? 'Deck present' : 'No deck segment', 'warn', 'Give the deck segment the position Upper deck');
      ok2(byPos.innerBottom, byPos.innerBottom ? 'Inner bottom present' : 'No inner bottom (single bottom)', 'warn');
      var issues = (window.SectionModel ? SectionModel.validate(S) : []).filter(function (i) { return i.level !== 'info'; });
      ok2(!issues.length, issues.length ? issues.length + ' model-check issue' + (issues.length > 1 ? 's' : '') : 'Model check clean', 'warn', issues.map(function (i) { return i.text; }).join('; '));
      var noPos = S.panels.filter(function (p) { return !p.position; });
      ok2(!noPos.length, noPos.length ? noPos.length + ' segment' + (noPos.length > 1 ? 's' : '') + ' without a position code (' + noPos.slice(0, 6).map(function (p) { return p.id; }).join(', ') + (noPos.length > 6 ? '…' : '') + ')' : 'Every segment has a position code', 'error', 'Set the position of each segment in the Segments table (Section step)');
      return items;
    },
    3: function () {
      var items = []; var S = D().getSection ? D().getSection() : null; var M = window.SectionModel;
      if (!S) { items.push({ ok: false, text: 'Section model not built yet' }); return items; }
      var gids = Object.keys(S.groups || {}); var le = numVal('le'); var ship = le ? Math.round(le * 1000) : null;
      var own = gids.filter(function (g) { var d = S.panelData && S.panelData[g]; return d && d.supports && d.supports.span > 0; }).length;
      var unnamed = S.panels.filter(function (p) { return !p.position; }).length;
      items.push({ ok: !!ship || own === gids.length, level: 'error', text: own ? own + ' of ' + gids.length + ' panels with their own span' + (ship ? ', rest use ship l_e ' + ship + ' mm' : '') : (ship ? 'All panels on ship l_e = ' + ship + ' mm' : 'No span — set l_e on the Ship page or per panel'), fix: 'Enter l_e on the Ship page or a span per panel (Supports)' });
      return items;
    },
    4: function () {
      var items = []; var S = D().getSection ? D().getSection() : null; var M = window.SectionModel;
      if (!S) { items.push({ ok: false, text: 'Section model not built yet' }); return items; }
      if (M.migratePanelData) M.migratePanelData(S);
      var gids = Object.keys(S.groups || {}); var empty = [], bad = [], noT = 0, total = 0;
      gids.forEach(function (g) { var d = M.panelData(S, g); var L = M.chainInfo(S, g).L; if (!d.strakes.length) { empty.push(S.groups[g]); return; }
        var sum = d.strakes.reduce(function (a, x) { return a + (x.len || 0); }, 0); if (Math.abs(sum - L) > 5) bad.push(S.groups[g]); d.strakes.forEach(function (x) { total++; if (!(x.t > 0)) noT++; }); });
      items.push({ ok: !empty.length, level: 'error', text: empty.length ? empty.length + ' panel' + (empty.length > 1 ? 's' : '') + ' without strakes (' + empty.slice(0, 4).join(', ') + (empty.length > 4 ? '…' : '') + ')' : total + ' strakes on ' + gids.length + ' panels', fix: 'Strakes step: ＋ or Auto layout on each panel' });
      items.push({ ok: !bad.length, level: 'error', text: bad.length ? 'Σ strake length ≠ panel length: ' + bad.join(', ') : 'Strake lengths add up on every panel', fix: 'Use ⇥ (fit last) on the panel' });
      items.push({ ok: !noT, level: 'error', text: noT ? noT + ' strake' + (noT > 1 ? 's' : '') + ' without a thickness' : 'Every strake has a thickness', fix: 'Enter t (mm) for every strake' });
      var noG = 0; gids.forEach(function (g) { M.panelData(S, g).strakes.forEach(function (x) { if (!x.grade) noG++; }); });
      // a blank grade is the zone material (Ship step) — legitimate, so only informative
      items.push({ ok: true, level: 'warn', text: noG ? noG + ' strake' + (noG > 1 ? 's' : '') + ' on the automatic grade (zone material)' : 'Every strake has an explicit grade' });
      var tight = 0, bad2 = 0;
      if (M.chainObstacles) gids.forEach(function (g) { var d = M.panelData(S, g); var obs = M.chainObstacles(S, g); var x = 0; d.strakes.forEach(function (st, i) { x += st.len || 0; if (i === d.strakes.length - 1) return; var dm = Infinity; obs.forEach(function (o) { dm = Math.min(dm, Math.abs(o.x - x)); }); if (dm < 50) bad2++; else if (dm < 100) tight++; }); });
      items.push({ ok: !bad2, level: 'warn', text: bad2 ? bad2 + ' seam' + (bad2 > 1 ? 's' : '') + ' within 50 mm of a member — hard to build' : 'No seam within 50 mm of a member', fix: 'Move the seam (strake length) at least 50 mm off the girder / stiffener' });
      items.push({ ok: !tight, level: 'warn', text: tight ? tight + ' seam' + (tight > 1 ? 's' : '') + ' closer than the recommended 100 mm' : 'Seams keep the recommended 100 mm', fix: '100 mm clearance recommended' });
      return items;
    },
    5: function () {
      var items = []; var S = D().getSection ? D().getSection() : null; var M = window.SectionModel;
      if (!S) { items.push({ ok: false, text: 'Section model not built yet' }); return items; }
      if (M.migratePanelData) M.migratePanelData(S);
      var total = 0, dropped = 0, noProf = 0, withG = 0;
      Object.keys(S.groups || {}).forEach(function (g) { var d = M.panelData(S, g); if (d.stiffGroups.length) withG++; var prev = null;
        d.stiffGroups.forEach(function (x) { var r = M.groupPositions(S, g, x, prev); if (r.placed.length) prev = Math.max.apply(null, r.placed); total += r.placed.length; dropped += r.dropped.length; if (!x.profile) noProf += r.placed.length; }); });
      items.push({ ok: total > 0, level: 'error', text: total ? total + ' stiffeners on ' + withG + ' panels' : 'No stiffeners yet', fix: 'Stiffeners step: add a group per panel (＋ or ⤓)' });
      var main = ['bottom', 'side', 'innerBottom', 'innerSide', 'upperDeck']; var bare = [];
      Object.keys(S.groups || {}).forEach(function (g) { var d = M.panelData(S, g); var segs = M.chainOf(S, g); if (!d.stiffGroups.length && segs.some(function (q) { return main.indexOf(q.position) >= 0; })) bare.push(S.groups[g]); });
      items.push({ ok: !bare.length, level: 'warn', text: bare.length ? 'Main panels without stiffeners: ' + bare.join(', ') : 'Main panels stiffened', fix: 'Shell, inner bottom, inner side and deck normally carry longitudinals' });
      items.push({ ok: !dropped, level: 'error', text: dropped ? dropped + ' stiffener' + (dropped > 1 ? 's' : '') + ' did not fit on their panel' : 'Every stiffener fits its panel', fix: 'Reduce the count / spacing or use max' });
      items.push({ ok: !noProf, level: 'error', text: noProf ? noProf + ' stiffener' + (noProf > 1 ? 's' : '') + ' without a profile size' : 'Every stiffener has a profile', fix: 'Pick a profile from the catalogue for each group' });
      return items;
    },
    6: function () {
      var items = []; var S = D().getSection ? D().getSection() : null;
      if (!S) { items.push({ ok: false, text: 'Section model not built yet' }); return items; }
      var cs = S.compartments || [];
      items.push({ ok: cs.length > 0, level: 'warn', text: cs.length ? cs.length + ' compartment' + (cs.length > 1 ? 's' : '') : 'No compartments yet', fix: 'Tanks and holds set the design heads — add at least the ballast tanks and the hold' });
      var openB = cs.filter(function (c) { return !window.SectionCAD || !window.SectionCAD.isClosed(S, c); }).length;
      items.push({ ok: !openB, level: 'error', text: openB ? openB + ' compartment' + (openB > 1 ? 's' : '') + ' with an open boundary' : 'All boundaries closed', fix: 'Pick the nodes round the space until it closes' });
      var tanksNoPipe = cs.filter(function (c) { return ['ballast', 'fuel', 'freshwater', 'liquidCargo'].indexOf(c.type) >= 0 && !(c.airpipe_mm > 0); }).length;
      items.push({ ok: !tanksNoPipe, level: 'error', text: tanksNoPipe ? tanksNoPipe + ' tank' + (tanksNoPipe > 1 ? 's' : '') + ' without an air pipe height' : 'Tank heads defined', fix: 'Enter the air pipe top (mm AB) for every tank' });
      return items;
    },
    7: function () { return []; }, 9: function () { return []; }, 10: function () { return []; },
    8: function () {
      var items = [];
      var S = D().getSection ? D().getSection() : null;
      if (S && S.manual && window.SectionAdapter) {
        var un = SectionAdapter.unmapped(S);
        items.push({ ok: !un.length, text: un.length ? un.length + ' panel' + (un.length > 1 ? 's' : '') + ' with no LR rule mapping (' + un.slice(0, 5).map(function (u) { return u.id + ' ' + (u.position || '?'); }).join(', ') + (un.length > 5 ? '…' : '') + ') — not checked' : 'Every panel is covered by an LR rule set' });
        var dl = S.panels.filter(function (p) { return p.deckLoad && p.deckLoad.type && p.deckLoad.type !== 'none'; }).length;
        if (dl) items.push({ ok: true, text: dl + ' deck panel' + (dl > 1 ? 's' : '') + ' with a deck load → Pt 3 Ch 3 Table 3.5.1 heads in the deck longitudinal checks' });
      }
      var fail = parseInt(($('cntFail') || {}).textContent) || 0;
      var okN = parseInt(($('cntOk') || {}).textContent) || 0;
      items.push({ ok: okN > 0, text: okN ? okN + ' checks OK' : 'Analysis not run yet — press Run Analysis on the Geometry page' });
      items.push({ ok: fail === 0, text: fail ? fail + ' FAIL' : 'No failing elements' });
      return items;
    }
  };

  // ------------------------------------------------------------------ checklist
  // Every step's open items in one place. level 'error' blocks the analysis
  // (the result would be meaningless without it), 'warn' only informs.
  function allChecks() {
    var out = [];
    for (var n = 1; n < STEPS.length; n++) {
      var items = []; try { items = CHECKS[n] ? CHECKS[n]() : []; } catch (_) { items = []; }
      items.forEach(function (i) { out.push({ step: n, label: stepByN(n).label, ok: i.ok, level: i.level || 'warn', text: i.text, fix: i.fix || '', focus: i.focus || null }); });
    }
    return out;
  }
  function blockingErrors() { return allChecks().filter(function (i) { return !i.ok && i.level === 'error'; }); }
  function showChecklist(anchor) {
    document.querySelectorAll('.check-list').forEach(function (m) { m.remove(); });
    var all = allChecks(); var open = all.filter(function (i) { return !i.ok; });
    var errs = open.filter(function (i) { return i.level === 'error'; }), warns = open.filter(function (i) { return i.level !== 'error'; });
    var box = document.createElement('div'); box.className = 'check-list';
    var row = function (i) { return '<div class="cl-item ' + i.level + '" data-step="' + i.step + '"' + (i.focus ? ' data-focus="' + i.focus + '"' : '') + '><span class="cl-mark">' + (i.level === 'error' ? '✕' : '!') + '</span><div><div class="cl-text">' + i.text + '</div>' + (i.fix ? '<div class="cl-fix">' + i.fix + '</div>' : '') + '</div><span class="cl-step">' + i.label + ' →</span></div>'; };
    box.innerHTML = '<div class="cl-head"><span>Checklist</span><span class="cl-sum">' + (errs.length ? '<b class="e">' + errs.length + ' error' + (errs.length > 1 ? 's' : '') + '</b>' : '') + (warns.length ? '<b class="w">' + warns.length + ' warning' + (warns.length > 1 ? 's' : '') + '</b>' : '') + (!open.length ? '<b class="ok">all clear ✓</b>' : '') + '</span><button class="cl-close" title="Close">✕</button></div>' +
      (errs.length ? '<div class="cl-sec">Errors — the analysis will not run until these are fixed</div>' + errs.map(row).join('') : '') +
      (warns.length ? '<div class="cl-sec">Warnings</div>' + warns.map(row).join('') : '') +
      (!open.length ? '<div class="cl-empty">Every required input is present.</div>' : '');
    document.body.appendChild(box);
    var r = anchor ? anchor.getBoundingClientRect() : { right: window.innerWidth - 12, bottom: 60, top: 60 };
    var top = r.bottom + 6; if (top + box.offsetHeight > window.innerHeight - 8) top = Math.max(8, r.top - box.offsetHeight - 6);
    box.style.top = top + 'px'; box.style.left = Math.max(8, Math.min(window.innerWidth - box.offsetWidth - 8, r.right - box.offsetWidth)) + 'px';
    var close = function () { box.remove(); document.removeEventListener('mousedown', outside, true); };
    var outside = function (ev) { if (!box.contains(ev.target) && ev.target !== anchor) close(); };
    setTimeout(function () { document.addEventListener('mousedown', outside, true); }, 0);
    box.querySelector('.cl-close').addEventListener('click', close);
    box.querySelectorAll('.cl-item').forEach(function (el) { el.addEventListener('click', function () { close(); goToStep(parseInt(el.dataset.step)); var f = el.dataset.focus; if (f) setTimeout(function () { var inp = $(f); if (inp) { inp.focus(); inp.scrollIntoView({ block: 'center' }); } }, 300); }); });
  }
  // Badges open the checklist; the analysis is gated on the errors.
  document.addEventListener('click', function (e) { var b = e.target.closest && e.target.closest('.sb-badge'); if (b) { e.stopPropagation(); showChecklist(b); } }, true);
  function gateAnalysis() {
    if (window.toggleAnalysisMode && !window.toggleAnalysisMode.__gated) {
      var orig = window.toggleAnalysisMode;
      var wrapped = function () {
        if (!window.ANALYSIS_MODE) { var errs = blockingErrors(); if (errs.length) { if (window.eaToast) window.eaToast('Missing input — ' + errs.length + ' error' + (errs.length > 1 ? 's' : '') + '. See the checklist.'); showChecklist(document.getElementById('runAnalysisBtn')); return; } }
        return orig.apply(this, arguments);
      };
      wrapped.__gated = true; window.toggleAnalysisMode = wrapped;
      var btn = document.getElementById('runAnalysisBtn'); if (btn) btn.setAttribute('onclick', 'window.toggleAnalysisMode()');
    }
  }
  window.showChecklist = showChecklist; window.blockingErrors = blockingErrors; window.allStepChecks = allChecks;
  window.MidshipSteps = { current: function () { return current; }, openCount: function (s) { return openCount(s); }, stepByN: stepByN };

  // ------------------------------------------------------------------ strip
  function stripHtml(step) {
    var items = [];
    try { items = CHECKS[step.n] ? CHECKS[step.n]() : []; } catch (_) { items = []; }
    var open = items.filter(function (i) { return !i.ok; }).length;
    var h = '<div class="step-strip" data-step="' + step.n + '">';
    h += '<div class="step-strip-main">';
    h += '<div class="step-strip-title" title="' + step.hint.replace(/"/g, '&quot;') + '"><span class="step-strip-num">' + step.n + '<span>/' + STEPS.length + '</span></span>' + step.title + '</div>';
    h += '<div class="step-strip-hint">' + step.hint + '</div>';
    h += '</div>';
    var okN = items.length - open;
    var tip = items.map(function (i) { return (i.ok ? '✓ ' : '● ') + i.text; }).join(String.fromCharCode(10));
    h += '<ul class="step-strip-checks" title="What this step still needs">';
    items.forEach(function (i) {
      h += '<li class="' + (i.ok ? 'ok' : 'todo') + '">' + (i.ok ? '&#10003;' : '&#9679;') + ' ' + i.text + '</li>';
    });
    h += '</ul>';
    // Geometry page shows this instead of the list: whole words, never clipped.
    h += '<div class="step-strip-badge ' + (open ? 'todo' : 'ok') + '" title="' + tip.replace(/"/g, '&quot;') + '">' +
         okN + '/' + items.length + (open ? ' &middot; ' + open + ' open' : ' &#10003;') + '</div>';
    h += '<div class="step-strip-nav">';
    h += '<button class="ea-btn ea-btn-secondary ea-btn-sm" onclick="stepPrev()" ' + (step.n === 1 ? 'disabled' : '') + '>&larr; ' + (step.n > 1 ? stepByN(step.n - 1).label : 'Back') + '</button>';
    if (step.n < STEPS.length) {
      h += '<button class="ea-btn ea-btn-primary ea-btn-sm" onclick="stepNext()">' + stepByN(step.n + 1).label + ' &rarr;</button>';
    } else {
      h += '<button class="ea-btn ea-btn-primary ea-btn-sm" onclick="exportPDF && exportPDF()">Report &rarr;</button>';
    }
    h += '</div></div>';
    return h;
  }

  // Status-bar badge (Geometry page): the step's own strip is hidden there.
  function paintBadge(step) {
    var el2 = $('fbStepBadge'); if (el2) { paintBadgeInto(el2, step); }
    var el3 = $('fsStepBadge'); if (el3) { paintBadgeInto(el3, step); }
    var el = $('sbStepBadge'); if (!el) return;
    paintBadgeInto(el, step);
  }
  function paintBadgeInto(el, step) {
    var all = allChecks(); var errs = all.filter(function (i) { return !i.ok && i.level === 'error'; }).length, warns = all.filter(function (i) { return !i.ok && i.level !== 'error'; }).length;
    el.className = 'step-strip-badge sb-badge ' + (errs ? 'err' : warns ? 'todo' : 'ok');
    el.innerHTML = errs ? '✕ ' + errs + (warns ? ' · ! ' + warns : '') : warns ? '! ' + warns : '&#10003; all clear';
    el.title = 'Click for the checklist';
  }
  function mountStrip(step) {
    paintBadge(step);
    try { document.body.classList.toggle('example-project', !!(D().isExampleGeometry && D().isExampleGeometry())); } catch (_) {}
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
    paintNav(current);
    // Laker-only controls (Variant) show only while the example geometry is loaded.
    try { document.body.classList.toggle('example-project', !!(D().isExampleGeometry && D().isExampleGeometry())); } catch (_) {}
    var host = $('page-' + step.page) && $('page-' + step.page).querySelector('.step-strip-host');
    if (host) host.innerHTML = stripHtml(step);
    paintBadge(step);
  }

  // ------------------------------------------------------------------- nav
  var SECTION_STEPS = [2, 3, 4, 5, 6];
  var openCount = function (s) { try { return (CHECKS[s] ? CHECKS[s]() : []).filter(function (i) { return !i.ok; }).length; } catch (_) { return 0; } };
  function paintNav(n) {
    var inSections = SECTION_STEPS.indexOf(n) >= 0;
    // main row: Main particulars · Sections (steps 2–6 as one) · Check
    document.querySelectorAll('.ea-wizard-step').forEach(function (b) {
      var s = parseInt(b.dataset.step); var grp = b.dataset.group === 'sections';
      var active = grp ? inSections : s === n;
      var done = grp ? n > 6 : (s === 1 ? n > 1 : false);
      // Amber ring on any passed step whose checklist still has open items, so a
      // step skipped with "Next" stays visible from every other step.
      var open = grp ? SECTION_STEPS.reduce(function (a, k) { return a + openCount(k); }, 0) : openCount(s);
      b.classList.toggle('active', active);
      b.classList.toggle('completed', done);
      b.classList.toggle('incomplete', open > 0 && done);
      var num = b.querySelector('.ea-wizard-num');
      if (num) num.title = open ? open + ' open item(s)' : 'Complete';
    });
    var mainLines = document.querySelectorAll('.ea-wizard .ea-wizard-line');
    if (mainLines[0]) mainLines[0].classList.toggle('completed', n > 1);
    if (mainLines[1]) mainLines[1].classList.toggle('completed', n > 6);
    if (window.ProjectTree) { try { ProjectTree.paint(); } catch (_) {} }
    var back = document.querySelector('#bottomStatusBar .sb-nav-btn.back');
    var fwd = document.querySelector('#bottomStatusBar .sb-nav-btn.fwd');
    if (back) { back.textContent = '← ' + (n > 1 ? stepByN(n - 1).label : 'Back'); back.onclick = stepPrev; }
    if (fwd) { fwd.textContent = (n < STEPS.length ? stepByN(n + 1).label : 'Report') + ' →'; fwd.onclick = stepNext; }
  }

  // Geometry page: move the step nav into the mode bar and the file actions next to
  // Run Analysis; put them back for the form pages. Idempotent.
  function formBar() {
    var fb = document.getElementById('formBar');
    if (!fb) {
      fb = document.createElement('div'); fb.id = 'formBar'; fb.className = 'chrome-bar form-bar';
      fb.innerHTML = '<div class="form-bar-left"></div><div class="bridge-mid"></div><div class="form-bar-right"><div class="bridge-files"></div><span id="fbStepBadge" class="step-strip-badge sb-badge"></span></div>';
      var header = document.querySelector('.ea-header'); if (header && header.parentElement) header.parentElement.insertBefore(fb, header);
    }
    var sb = document.getElementById('formStatusBar');
    if (!sb) {
      sb = document.createElement('div'); sb.id = 'formStatusBar'; sb.className = 'status-bar form-status';
      sb.innerHTML = '<button class="sb-nav-btn back" onclick="stepPrev()">← Back</button><span class="sb-spacer"></span><span id="fsStepBadge" class="step-strip-badge sb-badge"></span><button class="sb-nav-btn fwd" onclick="stepNext()">Next →</button>';
      document.body.appendChild(sb);
    }
    return fb;
  }
  // Left rail: the main flow. The step nav (.ea-wizard) lives here, vertical.
  function sideRail() {
    var rail = document.getElementById('sideRail');
    if (!rail) {
      rail = document.createElement('aside'); rail.id = 'sideRail';
      rail.innerHTML = '<div class="rail-title">Workflow</div>';
      document.body.appendChild(rail); document.body.classList.add('with-rail');
    }
    return rail;
  }
  function arrangeChrome(onGeometry) {
    var wiz = document.querySelector('.ea-wizard'); var bar = document.querySelector('.draw-bridge-bar');
    var acts = document.querySelector('.ea-header-actions'); var header = document.querySelector('.ea-header');
    if (!wiz || !bar || !header) return;
    var fb = formBar(); sideRail();
    var sub = document.querySelector('.ea-subwizard');
    if (!onGeometry) {
      // form pages (Main particulars, Check): the one-row bar carries the page title, files right
      var fmid = fb.querySelector('.bridge-mid'), ffiles = fb.querySelector('.bridge-files');
      if (sub && sub.parentElement !== fmid) fmid.appendChild(sub);
      var pool = [].concat(Array.prototype.slice.call(acts ? acts.querySelectorAll('.ea-header-btn:not(.ea-header-link):not(.ea-export-btn)') : []), Array.prototype.slice.call((bar.querySelector('.bridge-files') || { children: [] }).children));
      pool.forEach(function (b) { ffiles.appendChild(b); });
      fb.style.display = ''; document.body.classList.add('chrome-form'); document.body.classList.remove('chrome-geometry');
      var sb = document.getElementById('formStatusBar'); if (sb) { sb.style.display = ''; var n = current; var b = sb.querySelector('.back'), f = sb.querySelector('.fwd'); if (b) b.textContent = '← ' + (n > 1 ? stepByN(n - 1).label : 'Back'); if (f) f.textContent = (n < STEPS.length ? stepByN(n + 1).label : 'Report') + ' →'; }
      return;
    }
    fb.style.display = 'none'; document.body.classList.remove('chrome-form');
    var sb2 = document.getElementById('formStatusBar'); if (sb2) sb2.style.display = 'none';
    var mid = bar.querySelector('.bridge-mid'); if (!mid) { mid = document.createElement('div'); mid.className = 'bridge-mid'; bar.insertBefore(mid, bar.children[1] || null); }
    var right = bar.querySelector('.counts');
    var fileHost = bar.querySelector('.bridge-files'); if (!fileHost && right) { fileHost = document.createElement('div'); fileHost.className = 'bridge-files'; right.insertBefore(fileHost, right.firstChild); }
    if (sub && sub.parentElement !== mid) mid.appendChild(sub);
    if (fileHost) {
      var pool2 = [].concat(Array.prototype.slice.call(acts ? acts.querySelectorAll('.ea-header-btn:not(.ea-header-link):not(.ea-export-btn)') : []), Array.prototype.slice.call((fb.querySelector('.bridge-files') || { children: [] }).children));
      pool2.forEach(function (b) { fileHost.appendChild(b); });
    }
    document.body.classList.add('chrome-geometry');
  }
  var lastSectionStep = 2;
  function goToSections() { goToStep(SECTION_STEPS.indexOf(current) >= 0 ? current : lastSectionStep); }
  window.goToSections = goToSections;
  function goToStep(n) {
    var step = stepByN(n);
    if (SECTION_STEPS.indexOf(step.n) >= 0) lastSectionStep = step.n;
    current = step.n;
    // The Check page reads the drawing state; make sure the engine has run once
    // even when the user jumps there straight from Ship.
    if (step.page === 4) { var errsNow = blockingErrors(); document.body.classList.toggle('check-blocked', errsNow.length > 0); var blk = document.getElementById('checkBlocked'); if (!blk) { blk = document.createElement('div'); blk.id = 'checkBlocked'; var pg = document.getElementById('page-4'); var main = pg && (pg.querySelector('.ea-main') || pg); if (main) main.insertBefore(blk, main.firstChild); } if (blk) blk.innerHTML = errsNow.length ? '<div class="cl-block"><b>' + errsNow.length + ' missing input' + (errsNow.length > 1 ? 's' : '') + '</b> — the rule check needs them first.<ul>' + errsNow.map(function (i) { return '<li><span class="cl-mark">✕</span>' + i.text + (i.fix ? ' <em>· ' + i.fix + '</em>' : '') + ' <a href="#" data-goto="' + i.step + '">' + i.label + ' →</a></li>'; }).join('') + '</ul></div>' : ''; blk.querySelectorAll('[data-goto]').forEach(function (a) { a.addEventListener('click', function (ev) { ev.preventDefault(); goToStep(parseInt(a.dataset.goto)); }); }); }
    if (step.page === 4 && window.Draw && window.Draw.STRAKES && !(window.Draw.STRAKES.shell || []).length) {
      try { if (window.Draw.init) window.Draw.init(); if (window.Draw.computeStrakes) window.Draw.computeStrakes(); } catch (e) { console.warn('[steps] engine init before Check failed:', e); }
    }
    try { localStorage.setItem(KEY, String(current)); } catch (_) {}
    if (typeof window.goToPage === 'function') window.goToPage(step.page);
    arrangeChrome(step.page === 3);
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
      } catch (_) {}
      // goToPage(3) initialises the drawing on a 50 ms tick and the editor a
      // little after; switch tab/view once both exist, then refresh the checks.
      var tries = 0;
      (function arm() {
        // In the Section CAD (step 2) the editor has no tabs; the view switch
        // rebuilds them, so set the view first and pick the tab after.
        var ready = document.querySelector('.view-pill') && (document.querySelector('.ed-tab') || document.body.classList.contains('cad-mode'));
        if (!ready && tries++ < 40) return setTimeout(arm, 100);
        if (step.view) setView(step.view);
        wireTabsMore();
        wireFolding();
        if (step.tab) clickEditorTab(step.tab);
        refreshStrip();
      })();
    }
    document.body.setAttribute('data-step', String(current));
  }
  function stepNext() { if (window.ProjectTree) ProjectTree.goNext(1); else goToStep(current + 1); }
  function stepPrev() { if (window.ProjectTree) ProjectTree.goNext(-1); else goToStep(current - 1); }

  // Old callers (Back / View Summary buttons, Project.createProject) still
  // call goToPage(); keep the step model in sync when they do.
  function hookGoToPage() {
    var orig = window.goToPage;
    if (typeof orig !== 'function' || orig.__stepHooked) return;
    var wrapped = function (n) {
      var r = orig.apply(this, arguments);
      if (n === 2) n = 3;
      var s = n === 1 ? 1 : n === 4 ? 8 : n === 5 ? 7 : n === 6 ? 9 : n === 7 ? 10 : (current >= 2 && current <= 6 ? current : 2);
      if (s !== current) { current = s; try { localStorage.setItem(KEY, String(current)); } catch (_) {} }
      arrangeChrome(stepByN(current).page === 3);
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
      if (e.target.closest && e.target.closest('.ed-add-btn, .ed-del-btn, #recalcBtn, [data-regen-go], #runAnalysisBtn, [data-sg-del], #sgAdd')) bump();
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
      if (before && !before.classList.contains('open')) setTimeout(function () {
        goToStep(2);
        // The new section has a different envelope than whatever was on
        // screen; fit it once the editor has re-rendered.
        setTimeout(function () { try { D().fitView && D().fitView(); } catch (_) {} }, 400);
      }, 700);
      return r;
    };
    wrapped.__stepHooked = true;
    window.Project.createProject = wrapped;
  }

  // The editor re-renders its tab bar often; keep a "⋯" (all tabs) toggle on it.
  function wireTabsMore() {
    var host = $('edContent'); if (!host || host.__moreWired) return;
    host.__moreWired = true;
    var add = function () {
      var bar = host.querySelector('.ed-tabs'); if (!bar || bar.querySelector('.ed-tabs-more')) return;
      var b = document.createElement('button');
      b.className = 'ed-tab ed-tabs-more'; b.type = 'button'; b.textContent = '⋯';
      b.title = 'Show all editor tabs (this step shows only the ones it needs)';
      b.addEventListener('click', function () { document.body.classList.toggle('all-tabs'); });
      bar.appendChild(b);
    };
    add();
    new MutationObserver(add).observe(host, { childList: true });
  }

  // Fold / unfold editor groups by clicking their header; remembered by title.
  var folded = {};
  try { folded = JSON.parse(localStorage.getItem('midship_folded') || '{}'); } catch (_) {}
  function groupKey(g) { var t = g.querySelector('.ed-group-header'); return t ? t.textContent.replace(/\(.*?\)/g, '').replace(/[\d\s·Σ✓⚠]+/g, ' ').trim().slice(0, 40) : ''; }
  function applyFolds() {
    document.querySelectorAll('#edContent .ed-group').forEach(function (g) { var k = groupKey(g); if (k && folded[k]) g.classList.add('collapsed'); });
  }
  function wireFolding() {
    var host = $('edContent'); if (!host || host.__foldWired) return;
    host.__foldWired = true;
    host.addEventListener('click', function (e) {
      var hdr = e.target.closest('.ed-group-header'); if (!hdr || !host.contains(hdr)) return;
      if (e.target.closest('button, input, select, a, label')) return;
      var g = hdr.parentElement; if (!g || !g.classList.contains('ed-group')) return;
      g.classList.toggle('collapsed');
      var k = groupKey(g); if (k) { if (g.classList.contains('collapsed')) folded[k] = 1; else delete folded[k]; }
      try { localStorage.setItem('midship_folded', JSON.stringify(folded)); } catch (_) {}
    });
    new MutationObserver(applyFolds).observe(host, { childList: true });
    applyFolds();
  }

  function boot() {
    // Ctrl+Shift+D reveals the developer buttons (Debug / Refresh) on the Geometry page.
    document.addEventListener('keydown', function (e) {
      if (e.ctrlKey && e.shiftKey && (e.key === 'D' || e.key === 'd')) { document.body.classList.toggle('dev-mode'); e.preventDefault(); }
    });
    hookGoToPage();
    hookProject();
    wireRefresh();
    gateAnalysis(); setTimeout(gateAnalysis, 1500);
    var saved = 1;
    try { saved = parseInt(localStorage.getItem(KEY)) || 1; } catch (_) {}
    if (/[?&]fresh=1/.test(location.search) || location.hash === '#fresh') saved = 1;
    // 95-project.js restores an autosaved project by visiting the Geometry
    // page and coming back to Setup (~600 ms). Land on the remembered step
    // only after that dance is over, otherwise it is overwritten.
    var hasProject = false;
    try { hasProject = !!localStorage.getItem('midship_project_v1'); } catch (_) {}
    if (hasProject) {
      // Hide the page dance of the restore (Geometry page → back) and land on
      // the remembered step once 95-project.js says it is done.
      document.body.classList.add('booting');
      var done = false;
      var finish = function () { if (done) return; done = true; document.body.classList.remove('booting'); goToStep(saved); };
      window.addEventListener('midship:restored', finish, { once: true });
      setTimeout(finish, 2500);
    } else goToStep(saved);
  }

  window.STEPS = STEPS;
  window.goToStep = goToStep;
  window.stepNext = stepNext;
  window.stepPrev = stepPrev;
  window.refreshStepStrip = refreshStrip;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(boot, 0); });
  else setTimeout(boot, 0);
})();
