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
      { key: 'rules',          label: 'Applicable Rules',                 short: 'Applicable rules',   step: 1, view: 'rules' },
      { key: 'main',           label: 'Main Particulars',                 short: 'Main particulars',   step: 1, view: 'main' },
      { key: 'frames',         label: 'Frame Table',                      short: 'Frame table',        step: 1, view: 'frames' },
      { key: 'draughts',       label: 'Draughts And Loading Conditions',  short: 'Draughts & loading', step: 1, view: 'draughts' },
      { key: 'ice',            label: 'Ice Class',                        short: 'Ice class',          step: 1, view: 'ice' },
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
          if (!items.length) h += '<button class="tree-node leaf sec-new" data-newsec="1" title="Create the first cross section from the Main particulars (B, D)"><i></i><span class="tl">＋ New section</span></button>';
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
  // Delegated on the document: the rail is created later by 96-steps (after the
  // project restore), so it may not exist yet when this runs.
  function wireRail() {
    if (document.__treeWired) return; document.__treeWired = true;
    document.addEventListener('click', function (e) {
      if (!e.target.closest || !e.target.closest('#sideRail')) return;
      var g = e.target.closest('.tree-node.group'); if (g) { var k = g.dataset.group; groups[k] = groups[k] === false ? true : false; saveGroups(); renderRail(); return; }
      var nw = e.target.closest('.tree-node.sec-new'); if (nw) { if (window.Sections && Sections.create()) { groups.sections = true; saveGroups(); goTo(2); } else renderRail(); return; }
      var sec = e.target.closest('.tree-node.sec'); if (sec) { if (sec.querySelector('input')) return; if (window.Sections) Sections.activate(sec.dataset.sec); window.goToSections(); paint(); return; }
      var leaf = e.target.closest('.tree-node[data-step]'); if (leaf) { goTo(parseInt(leaf.dataset.step), leaf.dataset.view || null); }
    });
    document.addEventListener('contextmenu', function (e) {
      if (!e.target.closest || !e.target.closest('#sideRail')) return;
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
    if (s === 1) { host.innerHTML = ''; host.style.display = 'none'; return; }   // sol PROJECT ağacında zaten aynı liste var — üstte tekrar etmesin
    var h = '';
    if (SECTION_STEPS.indexOf(s) >= 0) {
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
    [/^Main Dimensions/i, 'main'], [/^Still-Water Bending/i, 'stillwater'], [/^Still-Water Shear/i, 'stillwater'], [/^Hull girder factors/i, 'stillwater'],
    [/^Material/i, 'materials'], [/^Zone k-value/i, 'materials'], [/^Profile Filter/i, 'profiles'], [/^Geometry \(fixed/i, 'main']
  ];
  function carveShipViews() {
    var page = $('page-1'); if (!page || page.__carved) return; page.__carved = true;
    var grid = page.querySelector('.ea-setup-grid'); if (grid) grid.setAttribute('data-views', 'identification');
    var ice = $('iceClassPanel'); if (ice) ice.setAttribute('data-views', 'ice');
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
    // materials reference (LR Pt 3 Ch 2 Table 2.1.1: k = 235 / σo, E = 206 000 N/mm²)
    var mv = body.querySelector('.sp-view[data-view="materials"]');
    if (mv) {
      var rows = [['A / B / D / E', 235, 400, 1.00], ['AH32 / DH32 / EH32', 315, 440, 0.78], ['AH36 / DH36 / EH36', 355, 490, 0.72], ['AH40 / DH40 / EH40', 390, 510, 0.66]];
      var tbl = document.createElement('div'); tbl.className = 'sp-view'; tbl.setAttribute('data-view', 'materials');
      tbl.innerHTML = '<div class="ea-section-title" style="margin-top:var(--spacing-md)">Hull steel grades (LR Pt 3 Ch 2)</div><div class="mb-table mat-table"><div class="mb-th mat-th"><span>Grades</span><span>σ<sub>o</sub> N/mm²</span><span>Tensile N/mm²</span><span>E N/mm²</span><span>k</span></div>' + rows.map(function (r) { return '<div class="mb-tr mat-th"><span>' + r[0] + '</span><span>' + r[1] + '</span><span>' + r[2] + '</span><span>206 000</span><span>' + r[3].toFixed(2) + '</span></div>'; }).join('') + '</div>';
      mv.parentElement.insertBefore(tbl, mv.nextSibling);
      var views = big.getAttribute('data-views'); if (views.indexOf('materials') < 0) big.setAttribute('data-views', views + ' materials');
    }
  }

  // ------------------------------------------------------------------ Frame table
  // MARS arrangement: Frame positions (first frame, its x) · zones table (from → to
  // frame at a spacing) on the left · every frame with its x on the right · a
  // longitudinal view underneath. Saved as JSON in #frameTableJson:
  // { f0, x0, rows:[{from,to,s}] }. Frames exist only where a zone defines them: the
  // list runs from the first zone to the last contiguous one (a gap ends the table).
  // x is measured from the aft perpendicular (m); frame f0 sits at x0.
  var FrameTable = {
    sel: null,
    read: function () {
      var t = null; try { t = JSON.parse(($('frameTableJson') || {}).value || 'null'); } catch (_) {}
      if (!t || !Array.isArray(t.rows)) t = { rows: [] };
      if (t.f0 == null) t.f0 = 0; if (t.x0 == null) t.x0 = 0; delete t.s0;
      t.rows = t.rows.filter(function (r) { return r && isFinite(r.from) && isFinite(r.to) && r.s > 0; }).sort(function (a, b) { return a.from - b.from; });
      return t;
    },
    write: function (t) { var el = $('frameTableJson'); if (el) { el.value = JSON.stringify(t); el.dispatchEvent(new Event('change', { bubbles: true })); } },
    // spacing of the bay that starts at frame k, or null where no zone defines it
    spacingAt: function (k, t) { for (var i = 0; i < t.rows.length; i++) { var r = t.rows[i]; if (k >= r.from && k < r.to) return r.s; } return null; },
    // web frame (primary support) aralığı, mm — zonun "her N çerçevede bir web frame" değeri × posta aralığı; hiçbiri tanımsızsa null
    zoneAt: function (k, t) { for (var i = 0; i < t.rows.length; i++) { var r = t.rows[i]; if (k >= r.from && k < r.to) return r; } return null; },
    webSpacingOf: function (r) { return (r && r.wf > 0) ? r.wf * r.s : null; },
    // gemi boyunca bir x konumunun (mm) hangi zonda olduğunu bulup o zonun web frame aralığını döndürür
    webSpacingAtX: function (xMm, t) {
      t = t || FrameTable.read(); if (!t.rows.length) return null;
      for (var i = 0; i < t.rows.length; i++) {
        var r = t.rows[i]; if (!(r.wf > 0)) continue;
        var xa = FrameTable.xOf(r.from, t), xb = FrameTable.xOf(r.to, t); if (xa == null || xb == null) continue;
        var lo = Math.min(xa, xb), hi = Math.max(xa, xb);
        if (xMm >= lo - 0.5 && xMm <= hi + 0.5) return r.wf * r.s;
      }
      return null;
    },
    // x (mm) of a frame, walking from f0 through the zones; null when a bay on the way is undefined
    xOf: function (frame, t) {
      t = t || FrameTable.read(); var f = parseFloat(frame); if (isNaN(f) || !t.rows.length) return null;
      var x = (parseFloat(t.x0) || 0) * 1000; var f0 = parseFloat(t.f0) || 0; var sp;
      if (f >= f0) { for (var k = f0; k < f; k++) { sp = FrameTable.spacingAt(k, t); if (sp == null) return null; x += sp; } }
      else { for (var k2 = f; k2 < f0; k2++) { sp = FrameTable.spacingAt(k2, t); if (sp == null) return null; x -= sp; } }
      return x;
    },
    // the frames the zones define: from the first zone to the end of the last
    // contiguous zone (a gap ends the table)
    range: function (t) {
      if (!t.rows.length) return null; var a = t.rows[0].from, b = t.rows[0].to;
      for (var i = 1; i < t.rows.length; i++) { if (t.rows[i].from > b) break; b = Math.max(b, t.rows[i].to); }
      return { from: a, to: b };
    },
    sectionFrames: function () { var out = {}; try { Sections.exportState().items.forEach(function (m) { if (m.frame != null && String(m.frame).trim() !== '') out[Math.round(parseFloat(m.frame))] = Sections.label(m).name; }); } catch (_) {} return out; },
    issues: function (t) {
      var out = []; var L = parseFloat(($('L') || {}).value) || 0;
      var f0 = parseFloat(t.f0) || 0;
      if (t.rows.length && t.rows[0].from !== f0) out.push('the first zone starts at frame ' + t.rows[0].from + ' but the first frame is ' + f0);
      t.rows.forEach(function (r, i) { if (r.to <= r.from) out.push('zone ' + (i + 1) + ': "to" must be after "from"'); var n = t.rows[i + 1]; if (n && n.from < r.to) out.push('zones ' + (i + 1) + ' and ' + (i + 2) + ' overlap (frames ' + n.from + '–' + r.to + ')'); if (n && n.from > r.to) out.push('frames ' + r.to + '–' + n.from + ' have no spacing — the table ends at frame ' + r.to); });
      var sf = FrameTable.sectionFrames(); Object.keys(sf).forEach(function (f) { var x = FrameTable.xOf(f, t); if (x == null) { if (t.rows.length) out.push(sf[f] + ' (Fr. ' + f + ') is outside the zones'); } else if (L > 0 && (x < 0 || x > L * 1000)) out.push(sf[f] + ' (Fr. ' + f + ') lies outside 0…L'); });
      return out;
    },
    render: function () {
      var host = $('frameTableHost'); if (!host) return; var t = FrameTable.read();
      var L = parseFloat(($('L') || {}).value) || 0; var sf = FrameTable.sectionFrames(); var rg = FrameTable.range(t);
      var LL = parseFloat(($('bvLoadLineLength') || {}).value) || L;   // L_LL boş = L (Ch 1 tanımı)
      var num = function (id, v, step, w, unit) { return '<label class="ft-f"><span>' + id[1] + '</span><input class="ed-input ft-p" data-k="' + id[0] + '" type="number" step="' + step + '" value="' + v + '" style="width:' + w + 'px"><em>' + unit + '</em></label>'; };
      var h = '<div class="ft-top">' +
        '<div class="mb"><div class="mb-title">Frame positions</div><div class="ft-fields">' + num(['f0', 'First frame number'], t.f0, 1, 64, '') + num(['x0', 'First frame at x'], t.x0, 0.01, 72, 'm from AP') + '</div></div>' +
        '<div class="mb"><div class="mb-title">Ship</div><div class="ft-fields"><span class="ft-ro"><span>Rule length L</span><b>' + (L ? L.toFixed(2) + ' m' : '—') + '</b></span><span class="ft-ro"><span>Frames defined</span><b>' + (rg ? rg.from + ' – ' + rg.to : 'none') + '</b></span><span class="ft-ro"><span>Sections</span><b>' + (Object.keys(sf).length ? Object.keys(sf).map(function (f) { return 'Fr. ' + f; }).join(', ') : 'none with a frame yet') + '</b></span></div></div>' +
        '<div class="mb"><div class="mb-title">Frame converter</div><div class="ft-fields">' +
        '<label class="ft-f"><span># frame</span><input class="ed-input" id="ftConvFrame" type="number" step="1" style="width:64px"></label>' +
        '<span class="ft-ro"><span>x/L</span><b id="ftConvXL">—</b></span><span class="ft-ro"><span>x (rule L)</span><b id="ftConvXRules">—</b></span><span class="ft-ro" title="Aynı orijin, L_LL ile normalize — DNV\'nin ayrı freeboard AP/FP ofseti burada uygulanmıyor"><span>x<sub>LL</sub>/L<sub>LL</sub></span><b id="ftConvXLLoLL">—</b></span><span class="ft-ro"><span>x<sub>LL</sub></span><b id="ftConvXLL">—</b></span>' +
        '</div></div></div>';
      // zones (left) · frames (right)
      h += '<div class="ft-split"><div class="mb"><div class="mb-title">Frame spacing zones <em class="mb-em">' + t.rows.length + '</em></div>' +
        '<div class="mb-tools"><button class="mb-tool" data-ft="add" title="Add a zone after the last">＋</button><button class="mb-tool" data-ft="del" title="Remove the selected zone" ' + (FrameTable.sel == null ? 'disabled' : '') + '>✕</button></div>' +
        '<div class="mb-table ft-table"><div class="mb-th ft-th ft-th6"><span>#</span><span>From fr.</span><span>To fr.</span><span>Spacing</span><span title="Web frame — primary support — every N ordinary frames; blank = none defined here">Web fr. /N</span><span>x [m]</span><span>x/L</span><span title="Aynı x, L_LL (Load-line length) ile normalize. Nauticus\'ta X_LL, freeboard AP/FP\'sine göre AYRI bir orijinden ölçülüyor olabilir (rule-length L\'nin AP\'sinden farklı) — bu tool aynı orijini kullanıyor, ayrı bir perpendicular offset uygulamıyor.">x<sub>LL</sub>/L<sub>LL</sub></span></div>';
      t.rows.forEach(function (r, i) {
        var xe = FrameTable.xOf(r.to, t);
        var xM = xe != null ? xe / 1000 : null;
        h += '<div class="mb-tr ft-th ft-th6 ' + (FrameTable.sel === i ? 'is-sel' : '') + '" data-i="' + i + '"><span>' + (i + 1) + '</span><span><input class="ed-input ft-in" data-k="from" type="number" step="1" value="' + r.from + '"></span><span><input class="ed-input ft-in" data-k="to" type="number" step="1" value="' + r.to + '"></span><span><input class="ed-input ft-in" data-k="s" type="number" step="10" value="' + r.s + '"><em>mm</em></span><span><input class="ed-input ft-in" data-k="wf" type="number" step="1" min="0" value="' + (r.wf || '') + '" placeholder="—" title="Her N çerçevede bir birincil taşıyıcı (web frame) — boyuna posta/PSM açıklığı buradan türer"></span><span class="ft-x">' + (xM != null ? xM.toFixed(3) : '—') + '</span><span class="ft-x">' + (xM != null && L ? (xM / L).toFixed(4) : '—') + '</span><span class="ft-x">' + (xM != null && LL ? (xM / LL).toFixed(4) : '—') + '</span></div>';
      });
      if (!t.rows.length) h += '<div class="mb-empty-row">no zones yet — ＋ adds one (e.g. frames 0 → 25 at 726 mm)</div>';
      h += '</div>';
      var iss = FrameTable.issues(t); iss.forEach(function (m) { h += '<div class="mb-sum warn" style="padding-top:0">' + m + '</div>'; });
      h += '</div>';
      h += '<div class="mb"><div class="mb-title">Frames <em class="mb-em">' + (rg ? (rg.to - rg.from + 1) : 0) + '</em></div><div class="mb-table ft-frames"><div class="mb-th ft-fr"><span>Frame</span><span>x / Fr.' + t.f0 + ' (m)</span><span>x / AP (m)</span><span>x / L</span><span></span></div>';
      var xf0 = (parseFloat(t.x0) || 0) * 1000;
      if (rg) for (var f = rg.from; f <= rg.to; f++) { var x = FrameTable.xOf(f, t); if (x == null) continue; var used = sf[f]; h += '<div class="mb-tr ft-fr ' + (used ? 'is-sel' : '') + '"><span>' + f + '</span><span>' + ((x - xf0) / 1000).toFixed(3) + '</span><span>' + (x / 1000).toFixed(3) + '</span><span>' + (L ? (x / 1000 / L).toFixed(3) : '—') + '</span><span class="ft-used">' + (used || '') + '</span></div>'; }
      else h += '<div class="mb-empty-row">the frames appear here as the zones are entered</div>';
      h += '</div></div></div>';
      // longitudinal view
      h += '<div class="mb"><div class="mb-title">Longitudinal view</div><div class="ft-longi">' + FrameTable.longiSvg(t, L, sf, rg) + '</div></div>';
      host.innerHTML = h;
      host.querySelectorAll('.ft-p').forEach(function (inp) { inp.addEventListener('change', function () { var tt = FrameTable.read(); var v = parseFloat(inp.value); if (isNaN(v)) return; tt[inp.dataset.k] = inp.dataset.k === 'f0' ? Math.round(v) : v; FrameTable.write(tt); FrameTable.render(); FrameTable.syncSection(); }); });
      host.querySelectorAll('.ft-in').forEach(function (inp) { inp.addEventListener('change', function () { var i = +inp.closest('.mb-tr').dataset.i; var tt = FrameTable.read(); var v = parseFloat(inp.value);
        if (inp.dataset.k === 'wf' && inp.value.trim() === '') { delete tt.rows[i].wf; }
        else if (!isNaN(v)) tt.rows[i][inp.dataset.k] = inp.dataset.k === 's' ? Math.max(1, v) : Math.round(v);
        FrameTable.write(tt); FrameTable.render(); FrameTable.syncSection(); }); inp.addEventListener('focus', function () { FrameTable.sel = +inp.closest('.mb-tr').dataset.i; host.querySelectorAll('.ft-table .mb-tr').forEach(function (r) { r.classList.toggle('is-sel', +r.dataset.i === FrameTable.sel); }); var d = host.querySelector('[data-ft="del"]'); if (d) d.disabled = false; }); });
      host.querySelectorAll('.ft-table .mb-tr').forEach(function (r) { r.addEventListener('click', function () { FrameTable.sel = +r.dataset.i; host.querySelectorAll('.ft-table .mb-tr').forEach(function (q) { q.classList.toggle('is-sel', q === r); }); var d = host.querySelector('[data-ft="del"]'); if (d) d.disabled = false; }); });
      var add = host.querySelector('[data-ft="add"]'); if (add) add.addEventListener('click', FrameTable.add);
      var del = host.querySelector('[data-ft="del"]'); if (del) del.addEventListener('click', function () { if (FrameTable.sel == null) return; var tt = FrameTable.read(); tt.rows.splice(FrameTable.sel, 1); FrameTable.sel = null; FrameTable.write(tt); FrameTable.render(); FrameTable.syncSection(); });
      var conv = host.querySelector('#ftConvFrame'); if (conv) conv.addEventListener('input', function () {
        var xl = document.getElementById('ftConvXL'), xr = document.getElementById('ftConvXRules'), xll = document.getElementById('ftConvXLLoLL'), xllm = document.getElementById('ftConvXLL');
        var x = FrameTable.xOf(conv.value, t);
        if (x == null) { [xl, xr, xll, xllm].forEach(function (e) { if (e) e.textContent = '—'; }); return; }
        if (xr) xr.textContent = (x / 1000).toFixed(3) + ' m'; if (xl) xl.textContent = L ? (x / 1000 / L).toFixed(4) : '—';
        if (xllm) xllm.textContent = (x / 1000).toFixed(3) + ' m'; if (xll) xll.textContent = LL ? (x / 1000 / LL).toFixed(4) : '—';
      });
    },
    add: function () {
      var t = FrameTable.read(); var lastRow = t.rows[t.rows.length - 1];
      var sDef = parseFloat(($('transFrameSpacing') || {}).value) || 700;
      t.rows.push(lastRow ? { from: lastRow.to, to: lastRow.to + 25, s: lastRow.s } : { from: parseFloat(t.f0) || 0, to: (parseFloat(t.f0) || 0) + 25, s: sDef });
      FrameTable.sel = t.rows.length - 1; FrameTable.write(t); FrameTable.render(); FrameTable.syncSection();
    },
    longiSvg: function (t, L, sf, rg) {
      var W = 1000, H = 120, pad = 36;
      var xEnd = rg ? FrameTable.xOf(rg.to, t) : null, xStart = rg ? FrameTable.xOf(rg.from, t) : null;
      var xMax = Math.max(L * 1000 || 0, xEnd || 0, 1); var xMin = Math.min(0, xStart || 0);
      var X = function (mm) { return pad + (mm - xMin) / (xMax - xMin) * (W - 2 * pad); };
      var yBase = 74; var h = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="ft-svg" preserveAspectRatio="xMidYMid meet">';
      // hull line: keel + deck as a plain band, AP / FP
      h += '<rect x="' + X(0) + '" y="' + (yBase - 34) + '" width="' + (X(L * 1000 || xMax) - X(0)) + '" height="34" fill="rgba(59,130,246,0.06)" stroke="#cbd5e1" stroke-width="1"/>';
      h += '<text x="' + X(0) + '" y="' + (yBase + 26) + '" class="ft-lbl" text-anchor="middle">AP</text>';
      if (L) h += '<text x="' + X(L * 1000) + '" y="' + (yBase + 26) + '" class="ft-lbl" text-anchor="middle">FP · L ' + L.toFixed(1) + ' m</text>';
      // zones as bands with the spacing written in
      t.rows.forEach(function (r, i) { var xa = FrameTable.xOf(r.from, t), xb = FrameTable.xOf(r.to, t); if (xa == null || xb == null) return; var a = X(xa), b = X(xb); h += '<rect x="' + a + '" y="' + (yBase - 34) + '" width="' + Math.max(0, b - a) + '" height="34" fill="rgba(34,197,94,' + (i % 2 ? 0.10 : 0.16) + ')"/><text x="' + ((a + b) / 2) + '" y="' + (yBase - 40) + '" class="ft-lbl" text-anchor="middle">' + r.s + ' mm</text>'; });
      // frame ticks (every frame; every 10th taller with its number)
      if (rg) for (var f = rg.from; f <= rg.to; f++) { var xm = FrameTable.xOf(f, t); if (xm == null) continue; var x = X(xm); var big = f % 10 === 0; h += '<line x1="' + x + '" y1="' + yBase + '" x2="' + x + '" y2="' + (yBase - (big ? 12 : 6)) + '" stroke="' + (big ? '#64748b' : '#94a3b8') + '" stroke-width="1"/>'; if (big) h += '<text x="' + x + '" y="' + (yBase + 12) + '" class="ft-lbl" text-anchor="middle">' + f + '</text>'; }
      // sections
      Object.keys(sf).forEach(function (f) { var xm = FrameTable.xOf(f, t); if (xm == null) return; var x = X(xm); h += '<line x1="' + x + '" y1="' + (yBase - 34) + '" x2="' + x + '" y2="' + yBase + '" stroke="#3b82f6" stroke-width="2"/><text x="' + x + '" y="' + (yBase - 40) + '" class="ft-lbl sec" text-anchor="middle">' + sf[f] + '</text>'; });
      h += '<line x1="' + X(xMin) + '" y1="' + yBase + '" x2="' + X(xMax) + '" y2="' + yBase + '" stroke="#64748b" stroke-width="1"/>';
      return h + '</svg>';
    },
    // the active section's frame → x/L of the Main particulars
    syncSection: function () {
      try {
        var S = D().getSection(); var L = parseFloat(($('L') || {}).value); var x = S && S.frame != null && String(S.frame).trim() !== '' ? FrameTable.xOf(S.frame) : null;
        var el = $('sectionXL'); if (el && x != null && L > 0) { var v = Math.max(0, Math.min(1, x / 1000 / L)); if (Math.abs(parseFloat(el.value) - v) > 0.0005) { el.value = v.toFixed(3); el.dispatchEvent(new Event('change', { bubbles: true })); } }
      } catch (_) {}
    }
  };

  // ------------------------------------------------------------------ Profiles page
  // The project's profiles only: what the sections' stiffener groups use, plus what
  // was added here (the library, #customProfilesJson). No full catalogue listing.
  // L / T / FB are added by their dimensions; HP is picked from EN 10067.
  var Profiles = {
    fam: 'HP', hpQ: '',
    custom: function () { try { var j = JSON.parse(($('customProfilesJson') || {}).value || '[]'); return Array.isArray(j) ? j : []; } catch (_) { return []; } },
    saveCustom: function (list) { var el = $('customProfilesJson'); if (el) { el.value = JSON.stringify(list); el.dispatchEvent(new Event('change', { bubbles: true })); } Profiles.applyCustom(); },
    // "FB 190x14" / "L 200x90x10" / "T 300x10/150x15" / "HP 200x10" → profile data (null if unreadable)
    parse: function (type, size) {
      var P = window.Profile; if (!P) return null; var s = String(size || '').replace(/^(hp|l|t|fb)\s*/i, '').replace(/\s+/g, '').replace(/,/g, '.'); var m;
      try {
        if (type === 'FB' && (m = /^(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)$/i.exec(s))) return P._calcFB(+m[1], +m[2]);
        if (type === 'L' && (m = /^(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)$/i.exec(s))) return P._calcL(+m[1], +m[2], +m[3]);
        if (type === 'T' && (m = /^(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)[\/x](\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)$/i.exec(s))) return P._calcT(+m[1], +m[2], +m[3], +m[4]);
        if (type === 'HP') { var hp = P.HP_CATALOG.find(function (h) { return h.name.replace(/^HP\s*/i, '') === s; }); return hp ? P._calcHP(hp) : null; }
      } catch (_) {}
      return null;
    },
    nameOf: function (type, size) { return type + ' ' + String(size || '').replace(/^(hp|l|t|fb)\s*/i, '').trim(); },
    // profiles the sections use: name → [{section, group}]
    used: function () {
      var out = {}; if (!window.Sections || !window.SectionModel) return out;
      try {
        Sections.exportState().items.forEach(function (m) {
          var lb = Sections.label(m); var pd = m.panelData || {};
          Object.keys(pd).forEach(function (gid) { (pd[gid].stiffGroups || []).forEach(function (g) { if (!g.profile) return; var nm = Profiles.nameOf(g.type || 'HP', g.profile); (out[nm] = out[nm] || []).push({ section: lb.name, group: g.id, panel: (m.groups || {})[gid] || gid }); }); });
        });
      } catch (_) {}
      return out;
    },
    // custom sizes join the catalogues (once each) so the optimizer / best-fit see them
    applyCustom: function () {
      var P = window.Profile; if (!P) return;
      Profiles.custom().forEach(function (c) {
        if (c.type === 'L' && !P.L_CATALOG_SIZES.some(function (s) { return s.a === c.a && s.b === c.b && s.t === c.t; })) P.L_CATALOG_SIZES.push({ a: c.a, b: c.b, t: c.t, custom: true });
        if (c.type === 'FB' && !P.FB_CATALOG_SIZES.some(function (s) { return s.h === c.h && s.t === c.t; })) P.FB_CATALOG_SIZES.push({ h: c.h, t: c.t, custom: true });
        if (c.type === 'T' && !P.T_CATALOG_SIZES.some(function (s) { return s.h === c.h && s.tw === c.tw && s.bf === c.bf && s.tf === c.tf; })) P.T_CATALOG_SIZES.push({ h: c.h, tw: c.tw, bf: c.bf, tf: c.tf, custom: true });
      });
    },
    customName: function (c) { var P = window.Profile; try { return c.type === 'L' ? P._calcL(c.a, c.b, c.t).name : c.type === 'FB' ? P._calcFB(c.h, c.t).name : c.type === 'T' ? P._calcT(c.h, c.tw, c.bf, c.tf).name : c.type === 'HP' ? c.name : null; } catch (_) { return null; } },
    render: function () {
      var host = $('profilesCatalog'); if (!host || !window.Profile) return;
      var used = Profiles.used(); var lib = Profiles.custom();
      // rows: union, by type
      var rows = {}; var add = function (nm, src) { if (!rows[nm]) rows[nm] = { name: nm, type: nm.split(' ')[0], size: nm.replace(/^\w+\s+/, ''), used: used[nm] || [], lib: false }; if (src === 'lib') rows[nm].lib = true; };
      Object.keys(used).forEach(function (nm) { add(nm, 'used'); }); lib.forEach(function (c) { var nm = Profiles.customName(c); if (nm) add(nm, 'lib'); });
      var order = ['HP', 'L', 'T', 'FB']; var list = Object.keys(rows).map(function (k) { return rows[k]; }).sort(function (a, b) { var d = order.indexOf(a.type) - order.indexOf(b.type); if (d) return d; var pa = Profiles.parse(a.type, a.size), pb = Profiles.parse(b.type, b.size); return (pa ? pa.height : 0) - (pb ? pb.height : 0); });
      var h = '<div class="mb"><div class="mb-title">Project profiles <em class="mb-em">' + list.length + '</em></div>';
      h += '<div class="mb-table pf-table"><div class="mb-th pf-th"><span>Profile</span><span>A cm²</span><span>I<sub>xx</sub> cm⁴</span><span>e cm</span><span>h cm</span><span>Used by</span><span></span></div>';
      if (!list.length) h += '<div class="mb-empty-row">nothing yet — the sections’ stiffeners appear here as they are given a profile; add sizes below</div>';
      list.forEach(function (r) {
        var p = Profiles.parse(r.type, r.size); var u = r.used;
        // where it is used: "Midship · Inner bottom (G2), Fr. 112 · Shell (G5)"; library entries are not used yet
        var seen = {}; var places = []; u.forEach(function (x) { var k = x.section + ' · ' + x.panel; if (!seen[k]) { seen[k] = []; places.push(k); } seen[k].push(x.group); });
        var where = u.length ? places.slice(0, 2).map(function (k) { return k + ' (' + seen[k].join(', ') + ')'; }).join(', ') + (places.length > 2 ? ' +' + (places.length - 2) + ' more' : '') : '<em>not used yet</em>';
        h += '<div class="mb-tr pf-th ' + (u.length ? '' : 'is-lib') + '" title="' + (u.length ? u.map(function (x) { return x.section + ' · ' + x.panel + ' · ' + x.group; }).join('\n') : 'added on this page, not used yet') + '"><span>' + r.name + (p ? '' : ' <em class="bad">?</em>') + '</span><span>' + (p ? p.area.toFixed(2) : '—') + '</span><span>' + (p ? p.Ixx.toFixed(1) : '—') + '</span><span>' + (p ? p.centroidY.toFixed(2) : '—') + '</span><span>' + (p ? p.height.toFixed(1) : '—') + '</span><span class="pf-where">' + where + '</span><span>' + (u.length ? '' : '<button class="ed-link-btn pf-del" data-name="' + r.name + '" title="Remove from the library">✕</button>') + '</span></div>';
      });
      h += '</div></div>';
      // add
      var F = Profiles.fam;
      h += '<div class="mb"><div class="mb-title">Add a profile</div><div class="pf-add"><span class="cad-seg">' + order.map(function (f) { return '<button class="' + (F === f ? 'on' : '') + '" data-fam="' + f + '">' + f + '</button>'; }).join('') + '</span>';
      if (F === 'HP') {
        var q = Profiles.hpQ.toLowerCase(); var hps = window.Profile.HP_CATALOG.filter(function (x) { return !q || x.name.toLowerCase().indexOf(q) >= 0; });
        h += '<input class="ed-input pf-q" type="text" placeholder="EN 10067 · e.g. 200x10" value="' + Profiles.hpQ.replace(/"/g, '&quot;') + '"><span class="pf-hp-list">' + hps.slice(0, 12).map(function (x) { return '<button class="ed-link-btn pf-hp" data-name="' + x.name + '" ' + (rows[x.name] ? 'disabled title="already in the project"' : '') + '>' + x.name.replace(/^HP\s*/, '') + '</button>'; }).join('') + (hps.length > 12 ? '<em>+' + (hps.length - 12) + ' more — type to narrow</em>' : '') + '</span>';
      } else {
        var fields = F === 'L' ? [['a', 'a'], ['b', 'b'], ['t', 't']] : F === 'FB' ? [['h', 'h'], ['t', 't']] : [['h', 'h'], ['tw', 't<sub>w</sub>'], ['bf', 'b<sub>f</sub>'], ['tf', 't<sub>f</sub>']];
        h += fields.map(function (f) { return '<label>' + f[1] + '<input class="ed-input pf-dim" data-k="' + f[0] + '" type="number" step="0.5" min="1"></label>'; }).join('') + '<em>mm</em><button class="ed-link-btn on pf-addbtn">Add</button>';
      }
      h += '</div></div>';
      host.innerHTML = h;
      host.querySelectorAll('[data-fam]').forEach(function (b) { b.addEventListener('click', function () { Profiles.fam = b.dataset.fam; Profiles.render(); }); });
      var qi = host.querySelector('.pf-q'); if (qi) qi.addEventListener('input', function () { Profiles.hpQ = qi.value; var pos = qi.selectionStart; Profiles.render(); var q2 = host.querySelector('.pf-q'); if (q2) { q2.focus(); q2.setSelectionRange(pos, pos); } });
      host.querySelectorAll('.pf-hp').forEach(function (b) { b.addEventListener('click', function () { var l2 = Profiles.custom(); if (!l2.some(function (c) { return c.type === 'HP' && c.name === b.dataset.name; })) l2.push({ type: 'HP', name: b.dataset.name }); Profiles.saveCustom(l2); Profiles.render(); }); });
      var ab = host.querySelector('.pf-addbtn'); if (ab) ab.addEventListener('click', function () {
        var c = { type: F }; var ok = true; host.querySelectorAll('.pf-dim').forEach(function (i) { var v = parseFloat(i.value); if (!(v > 0)) ok = false; c[i.dataset.k] = v; });
        if (!ok) return; var nm = Profiles.customName(c); var l2 = Profiles.custom(); if (nm && !l2.some(function (x) { return Profiles.customName(x) === nm; })) l2.push(c); Profiles.saveCustom(l2); Profiles.render();
      });
      host.querySelectorAll('.pf-del').forEach(function (b) { b.addEventListener('click', function () {
        var name = b.dataset.name; var P2 = window.Profile;
        var keep = Profiles.custom().filter(function (c) { return Profiles.customName(c) !== name; });
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
      var host = $('compsOverview'); if (!host || !window.ShipComps) return;
      var models = []; try { models = Sections.exportState().items; } catch (_) {}
      var types = (window.SectionCAD && SectionCAD.COMP_TYPES) || []; var list = ShipComps.list();
      var num = function (id, k, v, step, ph) { return '<input class="ed-input co-f" data-id="' + id + '" data-k="' + k + '" type="number" step="' + step + '" value="' + (v == null ? '' : v) + '" placeholder="' + (ph || '') + '">'; };
      var h = '<div class="mb"><div class="mb-title">Compartments <em class="mb-em">' + list.length + ' · frames × Y × Z, half section, mm</em></div>';
      h += '<div class="mb-tools"><button class="mb-tool" data-co="add" title="Add a compartment">＋</button></div>';
      h += '<div class="mb-table co-table"><div class="mb-th co-th"><span>Name</span><span>Type</span><span>Fr. from</span><span>Fr. to</span><span>Y from</span><span>Y to</span><span>Z from</span><span>Z to</span><span>ρ t/m³</span><span>Air pipe</span><span>Test head</span><span>Sections</span><span></span></div>';
      if (!list.length) h += '<div class="mb-empty-row">none yet — ＋ adds one; a compartment can also be added inside a section</div>';
      list.forEach(function (c) {
        var secs = ShipComps.sectionsOf(c, models).map(function (m) { return Sections.label(m).name; });
        h += '<div class="mb-tr co-th" data-id="' + c.id + '"><span><input class="ed-input co-f" data-id="' + c.id + '" data-k="name" type="text" value="' + (c.name || c.id) + '"></span>' +
          '<span><select class="ed-input co-f" data-id="' + c.id + '" data-k="type">' + types.map(function (t) { return '<option value="' + t.code + '" ' + (t.code === c.type ? 'selected' : '') + '>' + t.label + '</option>'; }).join('') + '</select></span>' +
          '<span>' + num(c.id, 'frFrom', c.frFrom, 1, 'aft') + '</span><span>' + num(c.id, 'frTo', c.frTo, 1, 'fwd') + '</span>' +
          '<span>' + num(c.id, 'y0', c.y0, 10) + '</span><span>' + num(c.id, 'y1', c.y1, 10) + '</span><span>' + num(c.id, 'z0', c.z0, 10) + '</span><span>' + num(c.id, 'z1', c.z1, 10) + '</span>' +
          '<span>' + num(c.id, 'rho', c.rho, 0.005) + '</span><span>' + num(c.id, 'airpipe_mm', c.airpipe_mm, 10) + '</span><span>' + num(c.id, 'testHead_m', c.testHead_m, 0.1) + '</span>' +
          '<span class="co-secs" title="' + secs.join(', ') + '">' + (secs.length ? secs.join(', ') : '<em>none</em>') + '</span><span><button class="ed-link-btn co-del" data-id="' + c.id + '" title="Delete">✕</button></span></div>';
      });
      h += '</div></div>';
      host.innerHTML = h;
      var refresh = function () { Comps.render(); try { if (window.SectionAdapter) SectionAdapter.apply(D().getSection()); } catch (_) {} };
      host.querySelectorAll('.co-f').forEach(function (inp) { inp.addEventListener('change', function () {
        var k = inp.dataset.k; var v = inp.value; var patch = {};
        if (['rho', 'airpipe_mm', 'testHead_m', 'frFrom', 'frTo', 'y0', 'y1', 'z0', 'z1'].indexOf(k) >= 0) { v = parseFloat(v); if (isNaN(v)) v = null; }
        if (k === 'type') { var T = types.find(function (t) { return t.code === v; }) || {}; patch.rho = T.rho || null; if (!T.tank) { patch.airpipe_mm = null; patch.testHead_m = null; } }
        patch[k] = v; ShipComps.update(inp.dataset.id, patch); refresh();
      }); });
      host.querySelectorAll('.co-del').forEach(function (b) { b.addEventListener('click', function () { ShipComps.remove(b.dataset.id); refresh(); }); });
      var add = host.querySelector('[data-co="add"]'); if (add) add.addEventListener('click', function () { ShipComps.add({}); refresh(); });
    }
  };

  // ------------------------------------------------------------------ boot
  function boot() {
    carveShipViews();
    Profiles.applyCustom();
    wireRail();
    var migrateComps = function () { try { if (window.ShipComps && window.Sections) { ShipComps.reload(); var st = Sections.exportState(); var n = ShipComps.migrate(st.items); var cur = D().getSection(); if (cur && cur.compartments) delete cur.compartments; if (n && window.SectionAdapter) SectionAdapter.apply(cur); } } catch (_) {} };
    window.addEventListener('midship:restored', function () { Profiles.applyCustom(); migrateComps(); FrameTable.render(); FrameTable.syncSection(); paint(); });
    window.addEventListener('midship:comps-changed', function () { if (stepNow() === 10) Comps.render(); });
    window.addEventListener('midship:section-switched', function () { FrameTable.syncSection(); });
    window.addEventListener('midship:model-changed', function () { FrameTable.syncSection(); });
    // opening a project file re-reads the tables
    if (window.importFullState && !window.importFullState.__treeHooked) { var orig = window.importFullState; var w = function () { var r = orig.apply(this, arguments); try { Profiles.applyCustom(); migrateComps(); FrameTable.render(); FrameTable.syncSection(); paint(); } catch (_) {} return r; }; w.__treeHooked = true; window.importFullState = w; }
    if (stepNow() === 1) document.body.setAttribute('data-ship-view', currentView);
    paint();
  }
  window.ProjectTree = { goTo: goTo, goNext: goNext, paint: paint, renderRail: renderRail, renderSubBar: renderSubBar, FrameTable: FrameTable, Profiles: Profiles, Comps: Comps, get view() { return currentView; } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(boot, 0); }); else setTimeout(boot, 0);
})();
