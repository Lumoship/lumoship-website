// ============================================================================
// Project tree (left rail) — the MARS layout without Torsion Models:
//
//   Basic Ship Data › Ship Identification · Main Particulars · Frame Table ·
//                     Draughts And Loading Conditions · Still Water Loads · Materials
//   Profiles
//   Compartments
//   Cross sections › one row per section (right-click: new / rename / duplicate / delete)
//   Transverse Bulkheads
//   Results
//
// Leaves map onto the step model of 96-steps.js (a step, optionally a "view" that
// shows one part of the Main particulars page). The bar on top carries the in-page
// transitions: the six Basic Ship Data views on page 1, the section steps on the
// drawing pages, the page title elsewhere. Also owns the Frame table, the Profiles
// page and the Compartments overview.
// ============================================================================
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var D = function () { return window.Draw; };
  var KEY_GROUPS = 'midship_tree_groups_v1';

  // ------------------------------------------------------------------ tree
  var TREE = [
    { key: 'ship', label: 'Basic Ship Data', group: true, children: [
      { key: 'identification', label: 'Ship Identification',              short: 'Identification',     step: 1, view: 'identification' },
      { key: 'main',           label: 'Main Particulars',                 short: 'Main particulars',   step: 1, view: 'main' },
      { key: 'frames',         label: 'Frame Table',                      short: 'Frame table',        step: 1, view: 'frames' },
      { key: 'draughts',       label: 'Draughts And Loading Conditions',  short: 'Draughts & loading', step: 1, view: 'draughts' },
      { key: 'stillwater',     label: 'Still Water Loads',                short: 'Still water loads',  step: 1, view: 'stillwater' },
      { key: 'materials',      label: 'Materials',                        short: 'Materials',          step: 1, view: 'materials' } ] },
    { key: 'profiles',     label: 'Profiles',      step: 9 },
    { key: 'compartments', label: 'Compartments',  step: 10 },
    { key: 'sections',     label: 'Cross sections', group: true, sections: true },
    { key: 'bulkheads',    label: 'Transverse Bulkheads', step: 7 },
    { key: 'results',      label: 'Results',       step: 8 }
  ];
  var SECTION_STEPS = [2, 3, 4, 5, 6];
  var SECTION_LABELS = { 2: 'Geometry', 3: 'Supports', 4: 'Strakes', 5: 'Stiffeners', 6: 'Compartments' };
  // Back / Next order
  var ORDER = [];
  TREE.forEach(function (n) { if (n.children) n.children.forEach(function (c) { ORDER.push({ step: c.step, view: c.view }); }); else if (n.sections) SECTION_STEPS.forEach(function (s) { ORDER.push({ step: s }); }); else ORDER.push({ step: n.step }); });

  var currentView = 'identification';
  var groups = { ship: true, sections: true };
  try { Object.assign(groups, JSON.parse(localStorage.getItem(KEY_GROUPS) || '{}')); } catch (_) {}
  var saveGroups = function () { try { localStorage.setItem(KEY_GROUPS, JSON.stringify(groups)); } catch (_) {} };

  function stepNow() { return window.MidshipSteps && window.MidshipSteps.current ? window.MidshipSteps.current() : 1; }
  function openCount(s) { try { return window.MidshipSteps.openCount(s); } catch (_) { return 0; } }

  // ------------------------------------------------------------------ navigation
  function goTo(step, view) {
    if (view) currentView = view;
    if (step === 1) document.body.setAttribute('data-ship-view', currentView); else document.body.removeAttribute('data-ship-view');
    window.goToStep(step);
    if (step === 1 && view) { if (view === 'frames') FrameTable.render(); if (view === 'draughts') {/* nothing extra */} }
    if (step === 9) Profiles.render();
    if (step === 10) Comps.render();
    paint();
  }
  function goNext(dir) {
    var s = stepNow(); var i = ORDER.findIndex(function (o) { return o.step === s && (s !== 1 || o.view === currentView); });
    var j = Math.max(0, Math.min(ORDER.length - 1, i + dir)); var o = ORDER[j];
    goTo(o.step, o.view);
  }
  function labelOf(step, view) {
    if (step === 1) { var c = TREE[0].children.find(function (x) { return x.view === view; }); return c ? c.label : 'Main particulars'; }
    if (SECTION_STEPS.indexOf(step) >= 0) return SECTION_LABELS[step];
    var n = TREE.find(function (x) { return x.step === step; }); return n ? n.label : '';
  }
  function neighbours() {
    var s = stepNow(); var i = ORDER.findIndex(function (o) { return o.step === s && (s !== 1 || o.view === currentView); });
    var p = ORDER[i - 1], n = ORDER[i + 1];
    return { back: p ? labelOf(p.step, p.view) : null, next: n ? labelOf(n.step, n.view) : null };
  }

  // ------------------------------------------------------------------ rail
  function renderRail() {
    var rail = $('sideRail'); if (!rail) return;
    var s = stepNow(); var inSections = SECTION_STEPS.indexOf(s) >= 0;
    var h = '<div class="rail-title">Project</div><div class="tree">';
    TREE.forEach(function (n) {
      if (n.group) {
        var open = groups[n.key] !== false; var active = n.sections ? inSections : (s === 1);
        var openItems = n.sections ? SECTION_STEPS.reduce(function (a, k) { return a + openCount(k); }, 0) : openCount(1);
        h += '<div class="tree-group ' + (open ? 'open' : '') + '"><button class="tree-node group ' + (active ? 'active' : '') + '" data-group="' + n.key + '"><span class="tw">' + (open ? '▾' : '▸') + '</span><span class="tl">' + n.label + '</span>' + (openItems ? '<span class="tdot warn" title="' + openItems + ' open item(s)"></span>' : '') + '</button><div class="tree-children">';
        if (n.children) n.children.forEach(function (c) {
          var act = s === c.step && currentView === c.view;
          h += '<button class="tree-node leaf ' + (act ? 'active' : '') + '" data-step="' + c.step + '" data-view="' + c.view + '"><i></i><span class="tl">' + c.label + '</span></button>';
        });
        if (n.sections && window.Sections) {
          var items = []; try { items = Sections.list(); } catch (_) {}
          var models = {}; try { Sections.exportState().items.forEach(function (m) { models[m.id] = m; }); } catch (_) {}
          items.forEach(function (it) {
            var lb = Sections.label(models[it.id] || it);
            h += '<button class="tree-node leaf sec ' + (it.active && inSections ? 'active' : it.active ? 'current' : '') + '" data-sec="' + it.id + '" title="' + lb.name + (lb.sub ? ' · ' + lb.sub : '') + ' — right-click for more"><i></i><span class="tl">' + lb.name + '</span><span class="ts">' + lb.sub + '</span></button>';
          });
        }
        h += '</div></div>';
      } else {
        var oc = openCount(n.step);
        h += '<button class="tree-node top ' + (s === n.step ? 'active' : '') + '" data-step="' + n.step + '"><span class="tw"></span><span class="tl">' + n.label + '</span>' + (oc ? '<span class="tdot warn" title="' + oc + ' open item(s)"></span>' : '') + '</button>';
      }
    });
    h += '</div>';
    rail.innerHTML = h;
  }
  function wireRail() {
    var rail = $('sideRail'); if (!rail || rail.__treeWired) return; rail.__treeWired = true;
    rail.addEventListener('click', function (e) {
      var g = e.target.closest('.tree-node.group'); if (g) { var k = g.dataset.group; groups[k] = groups[k] === false ? true : false; saveGroups(); renderRail(); return; }
      var sec = e.target.closest('.tree-node.sec'); if (sec) { if (sec.querySelector('input')) return; if (window.Sections) Sections.activate(sec.dataset.sec); window.goToSections(); paint(); return; }
      var leaf = e.target.closest('.tree-node[data-step]'); if (leaf) { goTo(parseInt(leaf.dataset.step), leaf.dataset.view || null); }
    });
    rail.addEventListener('contextmenu', function (e) {
      var sec = e.target.closest('.tree-node.sec'); var grp = e.target.closest('.tree-node.group[data-group="sections"]');
      if (!sec && !grp) return; e.preventDefault();
      if (sec) {
        var id = sec.dataset.sec; var n = 0; try { n = Sections.list().length; } catch (_) {}
        menu(e.clientX, e.clientY, [
          { short: 'ab', label: 'Rename section', run: function () { renameInline(sec, id); } },
          { short: '⧉', label: 'Duplicate section', run: function () { Sections.duplicate(id); goTo(2); } },
          { short: '✕', label: 'Delete section', confirm: 'Delete — click again to confirm', danger: true, off: n < 2, run: function () { Sections.remove(id); var st = stepNow(); goTo(SECTION_STEPS.indexOf(st) >= 0 ? st : 2); } }
        ]);
      } else {
        menu(e.clientX, e.clientY, [{ short: '＋', label: 'New section', run: function () { groups.sections = true; saveGroups(); Sections.create(); goTo(2); } }]);
      }
    });
    window.addEventListener('midship:section-switched', paint);
    window.addEventListener('midship:model-changed', renderRail);
  }
  function menu(x, y, items) {
    document.querySelectorAll('.cad-menu').forEach(function (m) { m.remove(); });
    var el = document.createElement('div'); el.className = 'cad-menu rail-menu';
    el.innerHTML = items.map(function (it, i) { return '<div class="cad-menu-item ' + (it.danger ? 'danger' : '') + (it.off ? ' off' : '') + '" data-i="' + i + '"><span class="cad-menu-code">' + (it.short || '') + '</span><span>' + it.label + '</span></div>'; }).join('');
    document.body.appendChild(el);
    var top = Math.min(y, window.innerHeight - el.offsetHeight - 8), left = Math.min(x, window.innerWidth - el.offsetWidth - 8);
    el.style.top = top + 'px'; el.style.left = left + 'px';
    var close = function () { el.remove(); document.removeEventListener('mousedown', outside, true); document.removeEventListener('keydown', esc, true); };
    var outside = function (ev) { if (!el.contains(ev.target)) close(); };
    var esc = function (ev) { if (ev.key === 'Escape') { close(); ev.stopPropagation(); } };
    setTimeout(function () { document.addEventListener('mousedown', outside, true); document.addEventListener('keydown', esc, true); }, 0);
    el.addEventListener('click', function (ev) {
      var row = ev.target.closest('.cad-menu-item'); if (!row || row.classList.contains('off')) return;
      var it = items[+row.dataset.i];
      if (it.confirm && !row.dataset.armed) { row.dataset.armed = '1'; row.querySelector('span:last-child').textContent = it.confirm; return; }
      close(); it.run();
    });
  }
  function renameInline(row, id) {
    var nameEl = row.querySelector('.tl'); if (!nameEl || row.querySelector('input')) return;
    var models = {}; try { Sections.exportState().items.forEach(function (m) { models[m.id] = m; }); } catch (_) {}
    var cur = models[id] && models[id].name ? models[id].name : '';
    var inp = document.createElement('input'); inp.className = 'rail-rename'; inp.type = 'text'; inp.value = cur; inp.placeholder = nameEl.textContent; inp.maxLength = 40;
    nameEl.textContent = ''; nameEl.appendChild(inp); inp.focus(); inp.select();
    var done = false; var fin = function (ok) { if (done) return; done = true; if (ok) Sections.rename(id, inp.value); renderRail(); };
    inp.addEventListener('keydown', function (ev) { ev.stopPropagation(); if (ev.key === 'Enter') fin(true); else if (ev.key === 'Escape') fin(false); });
    inp.addEventListener('blur', function () { fin(true); });
    inp.addEventListener('click', function (ev) { ev.stopPropagation(); });
  }

  // ------------------------------------------------------------------ bar (in-page transitions)
  function renderSubBar() {
    var s = stepNow(); var host = document.querySelector('.ea-subwizard'); if (!host) return;
    var h = '';
    if (s === 1) {
      TREE[0].children.forEach(function (c) { h += '<button class="ea-sub-step ' + (currentView === c.view ? 'active' : '') + '" data-step="1" data-view="' + c.view + '" title="' + c.label + '"><i></i>' + (c.short || c.label) + '</button>'; });
    } else if (SECTION_STEPS.indexOf(s) >= 0) {
      SECTION_STEPS.forEach(function (k) { var oc = openCount(k); h += '<button class="ea-sub-step ' + (k === s ? 'active' : '') + (k < s ? ' completed' : '') + (oc && k < s ? ' incomplete' : '') + '" data-step="' + k + '" title="' + SECTION_LABELS[k] + (oc ? ' — ' + oc + ' open item(s)' : '') + '"><i></i>' + SECTION_LABELS[k] + '</button>'; });
    } else {
      h = '<span class="bar-page-title">' + labelOf(s) + '</span>';
    }
    host.innerHTML = h; host.style.display = '';
    host.querySelectorAll('.ea-sub-step').forEach(function (b) { b.addEventListener('click', function () { goTo(parseInt(b.dataset.step), b.dataset.view || null); }); });
  }
  function paintBackNext() {
    var nb = neighbours();
    document.querySelectorAll('.sb-nav-btn.back').forEach(function (b) { b.textContent = '← ' + (nb.back || 'Back'); b.onclick = function () { goNext(-1); }; b.disabled = !nb.back; });
    document.querySelectorAll('.sb-nav-btn.fwd').forEach(function (b) { b.textContent = (nb.next || 'Report') + ' →'; b.onclick = function () { goNext(1); }; b.disabled = !nb.next; });
  }
  function paint() { renderRail(); renderSubBar(); paintBackNext(); }

  // ------------------------------------------------------------------ page 1 carved into views
  var VIEW_OF_TITLE = [
    [/^Main Dimensions/i, 'main'], [/^Still-Water Bending/i, 'stillwater'], [/^Hull girder factors/i, 'stillwater'],
    [/^Material/i, 'materials'], [/^Zone k-value/i, 'materials'], [/^Profile Filter/i, 'profiles'], [/^Geometry \(fixed/i, 'main']
  ];
  function carveShipViews() {
    var page = $('page-1'); if (!page || page.__carved) return; page.__carved = true;
    var grid = page.querySelector('.ea-setup-grid'); if (grid) grid.setAttribute('data-views', 'identification');
    var ice = $('iceClassPanel'); if (ice) ice.setAttribute('data-views', 'draughts');
    var big = null; page.querySelectorAll('.ea-panel').forEach(function (p) { var t = p.querySelector('.ea-panel-title'); if (t && /Ship Particulars/.test(t.textContent)) big = p; });
    if (!big) return;
    var body = big.querySelector('.ea-panel-body');
    // the "Advanced" fold becomes ordinary content (its groups belong to different views)
    var adv = body.querySelector('details.ea-advanced');
    if (adv) { var ab = adv.querySelector('.ea-advanced-body') || adv; var kids = Array.prototype.slice.call(ab.children); kids.forEach(function (k) { body.insertBefore(k, adv); }); adv.remove(); }
    // wrap each section title + following siblings into a view block
    var views = []; var wrap = null;
    Array.prototype.slice.call(body.children).forEach(function (el) {
      if (el.classList.contains('ea-section-title')) {
        var v = 'main'; VIEW_OF_TITLE.forEach(function (p) { if (p[0].test(el.textContent.trim())) v = p[1]; });
        wrap = document.createElement('div'); wrap.className = 'sp-view'; wrap.setAttribute('data-view', v); body.insertBefore(wrap, el); if (views.indexOf(v) < 0) views.push(v);
      }
      if (wrap) wrap.appendChild(el);
    });
    big.setAttribute('data-views', views.join(' '));
    // the draught sits with the loading conditions
    var tField = $('T') && $('T').closest('.ea-field');
    var dr = $('draughtsPanel'); if (tField && dr) { var host = dr.querySelector('.ea-form-row-4'); if (host) host.insertBefore(tField, host.firstChild); }
    // the profile filter preference moves to the Profiles page
    var pf = body.querySelector('.sp-view[data-view="profiles"]'); var ph = $('profilesPrefHost'); if (pf && ph) ph.appendChild(pf);
  }

  // ------------------------------------------------------------------ Frame table
  // Rows: from frame → to frame at a spacing (mm); x measured from the aft
  // perpendicular, frame 0 at x0. Saved as JSON in #frameTableJson.
  var FrameTable = {
    read: function () { try { var j = JSON.parse(($('frameTableJson') || {}).value || 'null'); if (j && Array.isArray(j.rows)) return j; } catch (_) {} return { x0: 0, rows: [] }; },
    write: function (t) { var el = $('frameTableJson'); if (el) { el.value = JSON.stringify(t); el.dispatchEvent(new Event('change', { bubbles: true })); } },
    xOf: function (frame, t) {
      t = t || FrameTable.read(); var f = parseFloat(frame); if (isNaN(f) || !t.rows.length) return null;
      var x = (parseFloat(t.x0) || 0) * 1000; var rows = t.rows.slice().sort(function (a, b) { return a.from - b.from; });
      if (f < rows[0].from) return x - (rows[0].from - f) * rows[0].s;
      rows.forEach(function (r) { var hi = Math.min(f, r.to); if (hi > r.from) x += (hi - r.from) * r.s; });
      var last = rows[rows.length - 1]; if (f > last.to) x += (f - last.to) * last.s;
      return x;   // mm
    },
    render: function () {
      var host = $('frameTableBody'); if (!host) return; var t = FrameTable.read();
      var rows = t.rows.slice().sort(function (a, b) { return a.from - b.from; });
      var h = '<div class="mb-table ft-table"><div class="mb-th ft-th"><span>From fr.</span><span>To fr.</span><span>Spacing</span><span>x at end</span><span></span></div>';
      rows.forEach(function (r, i) {
        var xe = FrameTable.xOf(r.to, t);
        h += '<div class="mb-tr ft-th" data-i="' + i + '"><span><input class="ed-input ft-in" data-k="from" type="number" step="1" value="' + r.from + '"></span><span><input class="ed-input ft-in" data-k="to" type="number" step="1" value="' + r.to + '"></span><span><input class="ed-input ft-in" data-k="s" type="number" step="10" value="' + r.s + '"><em>mm</em></span><span class="ft-x">' + (xe != null ? (xe / 1000).toFixed(2) + ' m' : '—') + '</span><span><button class="ed-link-btn ft-del" title="Remove">✕</button></span></div>';
      });
      if (!rows.length) h += '<div class="mb-empty-row">no frame zones yet — add the first (e.g. frames 0 → 20 at 600 mm)</div>';
      h += '</div>';
      host.innerHTML = h;
      var x0 = $('frameX0'); if (x0) x0.value = t.x0 || 0;
      host.querySelectorAll('.ft-in').forEach(function (inp) { inp.addEventListener('change', function () { var i = +inp.closest('.mb-tr').dataset.i; var tt = FrameTable.read(); var rr = tt.rows.slice().sort(function (a, b) { return a.from - b.from; }); var v = parseFloat(inp.value); if (!isNaN(v)) rr[i][inp.dataset.k] = v; tt.rows = rr; FrameTable.write(tt); FrameTable.render(); FrameTable.syncSection(); }); });
      host.querySelectorAll('.ft-del').forEach(function (b) { b.addEventListener('click', function () { var i = +b.closest('.mb-tr').dataset.i; var tt = FrameTable.read(); var rr = tt.rows.slice().sort(function (a, b2) { return a.from - b2.from; }); rr.splice(i, 1); tt.rows = rr; FrameTable.write(tt); FrameTable.render(); FrameTable.syncSection(); }); });
    },
    add: function () {
      var t = FrameTable.read(); var rows = t.rows.slice().sort(function (a, b) { return a.from - b.from; }); var last = rows[rows.length - 1];
      var sp = parseFloat(($('transFrameSpacing') || {}).value) || 700;
      rows.push(last ? { from: last.to, to: last.to + 20, s: last.s } : { from: 0, to: 20, s: sp });
      t.rows = rows; FrameTable.write(t); FrameTable.render(); FrameTable.syncSection();
    },
    setX0: function (v) { var t = FrameTable.read(); t.x0 = parseFloat(v) || 0; FrameTable.write(t); FrameTable.render(); FrameTable.syncSection(); },
    // the active section's frame → x/L of the Main particulars
    syncSection: function () {
      try {
        var S = D().getSection(); var L = parseFloat(($('L') || {}).value); var x = S && S.frame != null ? FrameTable.xOf(S.frame) : null;
        var el = $('sectionXL'); if (el && x != null && L > 0) { var v = Math.max(0, Math.min(1, x / 1000 / L)); if (Math.abs(parseFloat(el.value) - v) > 0.0005) { el.value = v.toFixed(3); el.dispatchEvent(new Event('change', { bubbles: true })); } }
      } catch (_) {}
    }
  };

  // ------------------------------------------------------------------ Profiles page
  var Profiles = {
    fam: 'HP', q: '',
    custom: function () { try { var j = JSON.parse(($('customProfilesJson') || {}).value || '[]'); return Array.isArray(j) ? j : []; } catch (_) { return []; } },
    saveCustom: function (list) { var el = $('customProfilesJson'); if (el) { el.value = JSON.stringify(list); el.dispatchEvent(new Event('change', { bubbles: true })); } Profiles.applyCustom(); },
    // custom sizes join the catalogs (once each) so every profile dropdown offers them
    applyCustom: function () {
      var P = window.Profile; if (!P) return;
      Profiles.custom().forEach(function (c) {
        if (c.type === 'L' && !P.L_CATALOG_SIZES.some(function (s) { return s.a === c.a && s.b === c.b && s.t === c.t; })) P.L_CATALOG_SIZES.push({ a: c.a, b: c.b, t: c.t, custom: true });
        if (c.type === 'FB' && !P.FB_CATALOG_SIZES.some(function (s) { return s.h === c.h && s.t === c.t; })) P.FB_CATALOG_SIZES.push({ h: c.h, t: c.t, custom: true });
        if (c.type === 'T' && !P.T_CATALOG_SIZES.some(function (s) { return s.h === c.h && s.tw === c.tw && s.bf === c.bf && s.tf === c.tf; })) P.T_CATALOG_SIZES.push({ h: c.h, tw: c.tw, bf: c.bf, tf: c.tf, custom: true });
      });
    },
    render: function () {
      var host = $('profilesCatalog'); if (!host || !window.Profile) return;
      var P = window.Profile; var list = P.allProfiles([Profiles.fam]); var q = Profiles.q.toLowerCase();
      if (q) list = list.filter(function (p) { return p.name.toLowerCase().indexOf(q) >= 0; });
      var custom = Profiles.custom();
      var isCustom = function (p) { return custom.some(function (c) { return c.type === p.type && P['_calc' + c.type] && (c.type === 'L' ? P._calcL(c.a, c.b, c.t) : c.type === 'FB' ? P._calcFB(c.h, c.t) : P._calcT(c.h, c.tw, c.bf, c.tf)).name === p.name; }); };
      var h = '<div class="pf-tools"><span class="cad-seg">' + ['HP', 'L', 'T', 'FB'].map(function (f) { return '<button class="' + (Profiles.fam === f ? 'on' : '') + '" data-fam="' + f + '">' + f + '</button>'; }).join('') + '</span><input class="ed-input pf-q" type="text" placeholder="filter…" value="' + Profiles.q.replace(/"/g, '&quot;') + '"><em>' + list.length + ' profiles</em></div>';
      h += '<div class="mb-table pf-table"><div class="mb-th pf-th"><span>Profile</span><span>A cm²</span><span>I<sub>xx</sub> cm⁴</span><span>e cm</span><span>h cm</span><span></span></div>';
      list.forEach(function (p) { var cu = isCustom(p); h += '<div class="mb-tr pf-th ' + (cu ? 'is-custom' : '') + '"><span>' + p.name + (cu ? ' <em>custom</em>' : '') + '</span><span>' + p.area.toFixed(2) + '</span><span>' + p.Ixx.toFixed(1) + '</span><span>' + p.centroidY.toFixed(2) + '</span><span>' + p.height.toFixed(1) + '</span><span>' + (cu ? '<button class="ed-link-btn pf-del" data-name="' + p.name + '" title="Remove">✕</button>' : '') + '</span></div>'; });
      h += '</div>';
      // custom profile form
      var F = Profiles.fam;
      var fields = F === 'L' ? [['a', 'a'], ['b', 'b'], ['t', 't']] : F === 'FB' ? [['h', 'h'], ['t', 't']] : F === 'T' ? [['h', 'h'], ['tw', 't<sub>w</sub>'], ['bf', 'b<sub>f</sub>'], ['tf', 't<sub>f</sub>']] : null;
      if (fields) h += '<div class="pf-add"><span>Custom ' + F + '</span>' + fields.map(function (f) { return '<label>' + f[1] + '<input class="ed-input pf-dim" data-k="' + f[0] + '" type="number" step="0.5" min="1"></label>'; }).join('') + '<em>mm</em><button class="ed-link-btn on pf-addbtn">Add</button></div>';
      else h += '<div class="pf-note">HP bulb flats follow EN 10067 — no custom sizes.</div>';
      host.innerHTML = h;
      host.querySelectorAll('[data-fam]').forEach(function (b) { b.addEventListener('click', function () { Profiles.fam = b.dataset.fam; Profiles.render(); }); });
      var qi = host.querySelector('.pf-q'); if (qi) { qi.addEventListener('input', function () { Profiles.q = qi.value; var pos = qi.selectionStart; Profiles.render(); var q2 = host.querySelector('.pf-q'); if (q2) { q2.focus(); q2.setSelectionRange(pos, pos); } }); }
      var ab = host.querySelector('.pf-addbtn'); if (ab) ab.addEventListener('click', function () {
        var c = { type: F }; var ok = true; host.querySelectorAll('.pf-dim').forEach(function (i) { var v = parseFloat(i.value); if (!(v > 0)) ok = false; c[i.dataset.k] = v; });
        if (!ok) return; var list2 = Profiles.custom(); list2.push(c); Profiles.saveCustom(list2); Profiles.render();
      });
      host.querySelectorAll('.pf-del').forEach(function (b) { b.addEventListener('click', function () {
        var name = b.dataset.name; var P2 = window.Profile;
        var keep = Profiles.custom().filter(function (c) { var nm = c.type === 'L' ? P2._calcL(c.a, c.b, c.t).name : c.type === 'FB' ? P2._calcFB(c.h, c.t).name : P2._calcT(c.h, c.tw, c.bf, c.tf).name; return nm !== name; });
        ['L_CATALOG_SIZES', 'FB_CATALOG_SIZES', 'T_CATALOG_SIZES'].forEach(function (k) { var arr = P2[k]; for (var i = arr.length - 1; i >= 0; i--) { var s = arr[i]; if (!s.custom) continue; var nm = k[0] === 'L' ? P2._calcL(s.a, s.b, s.t).name : k[0] === 'F' ? P2._calcFB(s.h, s.t).name : P2._calcT(s.h, s.tw, s.bf, s.tf).name; if (nm === name) arr.splice(i, 1); } });
        Profiles.saveCustom(keep); Profiles.render();
      }); });
    }
  };

  // ------------------------------------------------------------------ Compartments overview
  // Every compartment of every section, type / density / air pipe editable here;
  // the boundary is drawn in the section's Compartments step.
  var Comps = {
    render: function () {
      var host = $('compsOverview'); if (!host || !window.Sections) return;
      var st; try { st = Sections.exportState(); } catch (_) { st = { items: [], active: null }; }
      var types = (window.SectionCAD && SectionCAD.COMP_TYPES) || [];
      var h = '';
      st.items.forEach(function (m) {
        var lb = Sections.label(m); var cs = m.compartments || [];
        h += '<div class="mb"><div class="mb-title"><span>' + lb.name + '</span><em class="mb-em">' + cs.length + ' compartment' + (cs.length === 1 ? '' : 's') + (m.id === st.active ? ' · active' : '') + '</em></div>';
        if (!cs.length) h += '<div class="mb-empty-row">none — draw them in the section’s Compartments step</div>';
        else {
          h += '<div class="mb-table co-table"><div class="mb-th co-th"><span>Name</span><span>Type</span><span>ρ t/m³</span><span>Air pipe mm</span><span>Test head m</span><span>Boundary</span></div>';
          cs.forEach(function (c) {
            var closed = window.SectionCAD && SectionCAD.isClosed ? SectionCAD.isClosed(m, c) : true;
            h += '<div class="mb-tr co-th" data-sec="' + m.id + '" data-c="' + c.id + '"><span><input class="ed-input co-f" data-k="name" type="text" value="' + (c.name || c.id) + '"></span><span><select class="ed-input co-f" data-k="type">' + types.map(function (t) { return '<option value="' + t.code + '" ' + (t.code === c.type ? 'selected' : '') + '>' + t.label + '</option>'; }).join('') + '</select></span><span><input class="ed-input co-f" data-k="rho" type="number" step="0.005" value="' + (c.rho != null ? c.rho : '') + '"></span><span><input class="ed-input co-f" data-k="airpipe_mm" type="number" step="10" value="' + (c.airpipe_mm != null ? c.airpipe_mm : '') + '"></span><span><input class="ed-input co-f" data-k="testHead_m" type="number" step="0.1" value="' + (c.testHead_m != null ? c.testHead_m : '') + '"></span><span style="color:' + (closed ? 'var(--success)' : 'var(--warning)') + '">' + ((c.nodes || []).length || (c.panels || []).length) + ' ' + (closed ? '✓' : '○') + '</span></div>';
          });
          h += '</div>';
        }
        h += '</div>';
      });
      host.innerHTML = h || '<div class="mb-empty">No sections yet.</div>';
      host.querySelectorAll('.co-f').forEach(function (inp) { inp.addEventListener('change', function () {
        var row = inp.closest('.mb-tr'); var sid = row.dataset.sec, cid = row.dataset.c; var k = inp.dataset.k; var v = inp.value;
        if (['rho', 'airpipe_mm', 'testHead_m'].indexOf(k) >= 0) { v = parseFloat(v); if (isNaN(v)) v = null; }
        var apply = function (m) { var c = (m.compartments || []).find(function (x) { return x.id === cid; }); if (c) c[k] = v; };
        var st2 = Sections.exportState(); var m = st2.items.find(function (x) { return x.id === sid; }); if (!m) return;
        if (sid === st2.active) { var cur = D().getSection(); apply(cur); D().setSection(cur); if (window.SectionAdapter) { try { SectionAdapter.apply(cur); } catch (_) {} } }
        else apply(m);
        try { window.Project && window.Project.saveLocal && window.Project.saveLocal(); } catch (_) {}
        Comps.render();
      }); });
    }
  };

  // ------------------------------------------------------------------ boot
  function boot() {
    carveShipViews();
    Profiles.applyCustom();
    var ft = $('frameAddRow'); if (ft) ft.addEventListener('click', FrameTable.add);
    var x0 = $('frameX0'); if (x0) x0.addEventListener('change', function () { FrameTable.setX0(x0.value); });
    wireRail();
    window.addEventListener('midship:restored', function () { Profiles.applyCustom(); FrameTable.render(); FrameTable.syncSection(); paint(); });
    window.addEventListener('midship:section-switched', function () { FrameTable.syncSection(); });
    window.addEventListener('midship:model-changed', function () { FrameTable.syncSection(); });
    // opening a project file re-reads the tables
    if (window.importFullState && !window.importFullState.__treeHooked) { var orig = window.importFullState; var w = function () { var r = orig.apply(this, arguments); try { Profiles.applyCustom(); FrameTable.render(); FrameTable.syncSection(); paint(); } catch (_) {} return r; }; w.__treeHooked = true; window.importFullState = w; }
    if (stepNow() === 1) document.body.setAttribute('data-ship-view', currentView);
    paint();
  }
  window.ProjectTree = { goTo: goTo, goNext: goNext, paint: paint, renderRail: renderRail, renderSubBar: renderSubBar, FrameTable: FrameTable, Profiles: Profiles, Comps: Comps, get view() { return currentView; } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(boot, 0); }); else setTimeout(boot, 0);
})();
