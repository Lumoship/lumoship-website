// =============================================================================
// 14-scantling-panels.js — right-hand panels for the Supports, Strakes and
// Stiffeners steps, laid out like MARS: a panel selector on top, a toolbar
// (add · copy · delete · prev · next), a table of the items along the panel,
// and the editor of the selected item below. All data is panel-level
// (SectionModel.panelData): strakes run along the panel chain, stiffener
// groups start at a distance from the panel start, supports give the span.
// 12-cad.js calls render*(ec, s, ctx) and reads `state` for highlighting.
// =============================================================================
(function () {
  'use strict';
  const M = () => window.SectionModel;
  const state = { gid: null, strake: null, group: null, exc: null };   // selection per step
  const GRADES = ['A', 'B', 'D', 'E', 'AH32', 'DH32', 'EH32', 'AH36', 'DH36', 'EH36', 'AH40', 'DH40', 'EH40'];
  const STIFF_TYPES = [['FB', 'Flat bar'], ['L', 'Angle (L)'], ['HP', 'Bulb (HP)'], ['T', 'T section']];
  const fmt = v => Math.round(v);
  const gName = (s, gid) => (s.groups && s.groups[gid]) || gid || '—';
  const sumLen = arr => arr.reduce((a, x) => a + (x.len || 0), 0);

  // Which panel is current: follow the segment selected on the drawing, else keep.
  function currentGid(s, ctx) {
    const gids = Object.keys(s.groups || {});
    if (ctx.sel.panel) { const q = s.panels.find(p => p.id === ctx.sel.panel); if (q && q.group !== state.gid) { state.gid = q.group; state.strake = null; state.group = null; state.exc = null; } }
    if (!state.gid || !gids.includes(state.gid)) state.gid = gids[0] || null;
    return state.gid;
  }
  function header(s, ctx, gid, title) {
    const gids = Object.keys(s.groups || {}); const gi = gids.indexOf(gid);
    return `<div class="mb-panelbar"><span class="mb-panelbar-title">${title}</span>
      <button data-sp="pnl-prev" ${gi > 0 ? '' : 'disabled'} title="Previous panel">‹</button>
      <select class="ed-input sp-pick" title="Panel">${gids.map(id => `<option value="${id}" ${id === gid ? 'selected' : ''}>${gi >= 0 ? gids.indexOf(id) + 1 : ''} · ${gName(s, id)}</option>`).join('')}</select>
      <button data-sp="pnl-next" ${gi < gids.length - 1 ? '' : 'disabled'} title="Next panel">›</button></div>`;
  }
  function bindHeader(ec, s, ctx) {
    const gids = Object.keys(s.groups || {});
    const pick = ec.querySelector('.sp-pick'); if (pick) pick.addEventListener('change', e => { state.gid = e.target.value; state.strake = state.group = state.exc = null; ctx.setSel({ panel: null, node: null, group: state.gid }); });
    ec.querySelectorAll('[data-sp="pnl-prev"],[data-sp="pnl-next"]').forEach(b => b.addEventListener('click', () => { const i = gids.indexOf(state.gid); const j = b.dataset.sp === 'pnl-prev' ? i - 1 : i + 1; if (gids[j]) { state.gid = gids[j]; state.strake = state.group = state.exc = null; ctx.setSel({ panel: null, node: null, group: state.gid }); } }));
  }
  const tools = (btns) => `<div class="mb-tools">${btns.map(b => `<button data-sp="${b.k}" title="${b.t}" ${b.off ? 'disabled' : ''}>${b.i}</button>`).join('')}</div>`;

  // ─────────────────────────────────────────────────────────── SUPPORTS
  function renderSupports(ec, s, ctx) {
    const gid = currentGid(s, ctx); if (!gid) { ec.innerHTML = '<div class="mb-empty">No panels yet.</div>'; return; }
    const d = M().panelData(s, gid); const sup = d.supports; const ci = M().chainInfo(s, gid);
    const frSp = parseFloat((document.getElementById('transFrameSpacing') || {}).value) || null;   // standard frame spacing, mm
    const leShip = parseFloat((document.getElementById('le') || {}).value); const shipSpan = leShip > 0 ? Math.round(leShip * 1000) : null;
    const eff = sup.span > 0 ? sup.span : shipSpan;
    let h = header(s, ctx, gid, 'Supports');
    h += `<div class="mb"><div class="mb-title">Primary supports <em class="mb-em">longitudinal</em></div>
      <div class="mb-note">Plating and longitudinals of <b>${gName(s, gid)}</b> are supported by transverse primary members at:</div>
      <div class="mb-row"><span>Aft at</span><span class="pc-inline"><input class="ed-input sp-f" data-k="aftFr" type="number" step="1" value="${sup.aftFr != null ? sup.aftFr : ''}" placeholder="Fr."><em>frame</em></span></div>
      <div class="mb-row"><span>Fore at</span><span class="pc-inline"><input class="ed-input sp-f" data-k="foreFr" type="number" step="1" value="${sup.foreFr != null ? sup.foreFr : ''}" placeholder="Fr."><em>frame</em></span></div>
      <div class="mb-row"><span>Span</span><span class="pc-inline"><input class="ed-input sp-f" data-k="span" type="number" step="10" value="${sup.span != null ? sup.span : ''}" placeholder="${shipSpan || ''}"><em>mm${sup.span ? '' : shipSpan ? ' · ship l_e' : ''}</em></span></div>
      <div class="mb-actions"><button class="ed-link-btn" data-sp="from-frames" ${frSp && sup.aftFr != null && sup.foreFr != null ? '' : 'disabled'} title="Span = (fore − aft) × standard frame spacing ${frSp || '—'} mm">from frames</button><button class="ed-link-btn" data-sp="from-ship" title="Web frame spacing l_e from the Ship page">from ship</button><button class="ed-link-btn" data-sp="to-all" title="Give every panel this span">to all panels</button></div>
    </div>`;
    // exceptions
    const ex = sup.exceptions || [];
    h += `<div class="mb"><div class="mb-title">Except the following areas <em class="mb-em">${ex.length}</em></div>
      ${tools([{ k: 'exc-add', i: '＋', t: 'Add an area' }, { k: 'exc-del', i: '✕', t: 'Delete the selected area', off: state.exc == null }])}
      <div class="mb-table"><div class="mb-th sp-exc-th"><span>#</span><span>From</span><span>To</span><span>Span</span><span>Support</span></div>`;
    ex.forEach((e, i) => { h += `<div class="mb-tr sp-exc-th ${state.exc === i ? 'is-sel' : ''}" data-exc="${i}"><span>${i + 1}</span><span>${fmt(e.from)}</span><span>${fmt(e.to)}</span><span>${e.span || '—'}</span><span>${({ primary: 'primary', frames: 'frames', diaphragm: 'diaphragm', bars: 'bars' })[e.kind] || 'primary'}</span></div>`; });
    if (!ex.length) h += `<div class="mb-empty-row">none — the whole panel uses the span above</div>`;
    h += `</div>`;
    if (state.exc != null && ex[state.exc]) {
      const e = ex[state.exc];
      h += `<div class="mb-editor">
        <div class="mb-row"><span>From</span><span class="pc-inline"><input class="ed-input sp-e" data-k="from" type="number" step="10" min="0" max="${fmt(ci.L)}" value="${fmt(e.from)}"><em>mm from panel start</em></span></div>
        <div class="mb-row"><span>To</span><span class="pc-inline"><input class="ed-input sp-e" data-k="to" type="number" step="10" min="0" max="${fmt(ci.L)}" value="${fmt(e.to)}"><em>mm</em></span></div>
        <div class="mb-row"><span>Span</span><span class="pc-inline"><input class="ed-input sp-e" data-k="span" type="number" step="10" value="${e.span || ''}" placeholder="${eff || ''}"><em>mm</em></span></div>
        <div class="mb-row"><span>Supported by</span><select class="ed-input sp-e" data-k="kind">${[['primary', 'Primary members'], ['frames', 'Transverse frames'], ['diaphragm', 'Diaphragm plates / brackets'], ['bars', 'Anti-buckling bars']].map(([k, l]) => `<option value="${k}" ${e.kind === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      </div>`;
    }
    h += `</div>`;
    ec.innerHTML = h; bindHeader(ec, s, ctx);
    const mut = fn => { const m = JSON.parse(JSON.stringify(s)); const dd = M().panelData(m, gid); fn(dd, m); ctx.commit(m); };
    ec.querySelectorAll('.sp-f').forEach(i => i.addEventListener('change', e => mut(dd => { const v = parseFloat(e.target.value); dd.supports[e.target.dataset.k] = isNaN(v) ? null : v; })));
    ec.querySelectorAll('.sp-e').forEach(i => i.addEventListener('change', e => mut(dd => { const x = dd.supports.exceptions[state.exc]; if (!x) return; const k = e.target.dataset.k; x[k] = k === 'kind' ? e.target.value : (isNaN(parseFloat(e.target.value)) ? null : parseFloat(e.target.value)); })));
    ec.querySelectorAll('[data-exc]').forEach(r => r.addEventListener('click', () => { state.exc = state.exc === +r.dataset.exc ? null : +r.dataset.exc; ctx.refresh(); }));
    ec.querySelectorAll('[data-sp]').forEach(b => b.addEventListener('click', () => {
      switch (b.dataset.sp) {
        case 'from-frames': mut(dd => { if (frSp && dd.supports.aftFr != null && dd.supports.foreFr != null) dd.supports.span = Math.round(Math.abs(dd.supports.foreFr - dd.supports.aftFr) * frSp); }); break;
        case 'from-ship': mut(dd => { dd.supports.span = shipSpan; }); break;
        case 'to-all': mut((dd, m) => { Object.keys(m.groups || {}).forEach(g => { M().panelData(m, g).supports.span = dd.supports.span || shipSpan; }); }); break;
        case 'exc-add': mut(dd => { dd.supports.exceptions.push({ from: 0, to: Math.round(ci.L / 4 / 10) * 10, span: null, kind: 'frames' }); state.exc = dd.supports.exceptions.length - 1; }); break;
        case 'exc-del': mut(dd => { if (state.exc != null) { dd.supports.exceptions.splice(state.exc, 1); state.exc = null; } }); break;
      }
    }));
  }

  // ─────────────────────────────────────────────────────────── STRAKES
  function renderStrakes(ec, s, ctx) {
    const gid = currentGid(s, ctx); if (!gid) { ec.innerHTML = '<div class="mb-empty">No panels yet.</div>'; return; }
    const d = M().panelData(s, gid); const ci = M().chainInfo(s, gid); const arr = d.strakes;
    const sum = sumLen(arr), diff = Math.round(ci.L - sum);
    let h = header(s, ctx, gid, 'Strakes');
    h += `<div class="mb"><div class="mb-title">Strakes <em class="mb-em">${arr.length} · ${fmt(ci.L)} mm</em></div>
      ${tools([{ k: 'st-add', i: '＋', t: 'Split the selected strake in two (the panel length stays)' }, { k: 'st-copy', i: '⧉', t: 'Split the selected strake keeping its thickness and grade', off: state.strake == null }, { k: 'st-del', i: '✕', t: 'Delete the selected strake (its length goes to the neighbour)', off: state.strake == null }, { k: 'st-prev', i: '‹', t: 'Previous', off: state.strake == null }, { k: 'st-next', i: '›', t: 'Next', off: state.strake == null }, { k: 'st-fit', i: '⇥', t: 'Fit the last strake so lengths add up', off: !arr.length || Math.abs(diff) <= 5 }])}
      <div class="mb-auto"><span>Auto layout</span>
        <select class="ed-input sp-autow" title="Standard plate width">${[1980, 2480, 2980].map(w => `<option value="${w}" ${(state.autoW || 2480) === w ? 'selected' : ''}>${w} mm</option>`).join('')}</select>
        <input class="ed-input sp-autoc" type="number" step="10" min="50" value="${state.autoC || 100}" title="Seam clearance from nodes and stiffeners (min 50, recommended 100 mm)"><em>mm clear</em>
        <button class="ed-link-btn on" data-sp="st-auto" title="Lay the panel out in plates of this width; seams keep clear of girders, decks and stiffeners">Apply</button></div>
      <div class="mb-table"><div class="mb-th sp-st-th"><span>ID</span><span>t (mm)</span><span>From</span><span>To</span><span>Grade</span></div>`;
    let acc = 0;
    arr.forEach((st, i) => { const from = acc; acc += st.len || 0; h += `<div class="mb-tr sp-st-th ${state.strake === i ? 'is-sel' : ''}" data-st="${i}" title="length ${fmt(st.len || 0)} mm"><span>${i + 1}</span><span style="color:${ctx.tColor(st.t)}">${st.t != null ? st.t : '—'}</span><span>${fmt(from)}</span><span>${fmt(acc)}</span><span>${st.grade || '—'}</span></div>`; });
    if (!arr.length) h += `<div class="mb-empty-row">no strakes yet — ＋ adds one, ⤓ fills from the automatic layout</div>`;
    h += `</div><div class="mb-sum ${Math.abs(diff) <= 5 ? 'ok' : diff > 0 ? 'warn' : 'bad'}">Σ ${fmt(sum)} / ${fmt(ci.L)} mm ${Math.abs(diff) <= 5 ? '✓' : diff > 0 ? '· ' + diff + ' mm short' : '· ' + (-diff) + ' mm over'}</div>`;
    // seam clearance: a seam on top of a girder / deck / stiffener cannot be built
    const obs = M().chainObstacles ? M().chainObstacles(s, gid) : []; const seamIssues = [];
    { let x = 0; arr.forEach((st, i) => { x += st.len || 0; if (i === arr.length - 1) return; let best = null; obs.forEach(o => { const d = Math.abs(o.x - x); if (!best || d < best.d) best = { d, o }; }); if (best && best.d < 100) seamIssues.push({ i, x, d: best.d, o: best.o }); }); }
    seamIssues.forEach(si => { h += `<div class="mb-sum ${si.d < 50 ? 'bad' : 'warn'}" style="padding-top:0">seam ${si.i + 1}|${si.i + 2} at ${fmt(si.x)} mm is ${fmt(si.d)} mm from ${si.o.kind === 'node' ? 'node ' + si.o.id : 'stiffener (' + si.o.id + ')'} — ${si.d < 50 ? 'cannot be built (min 50)' : 'below the recommended 100'}</div>`; });
    h += `</div>`;
    if (state.strake != null && arr[state.strake]) {
      const st = arr[state.strake]; const x0 = sumLen(arr.slice(0, state.strake)), x1 = x0 + (st.len || 0);
      const at = M().chainPointAt(s, gid, (x0 + x1) / 2); const seg = at && at.seg;
      h += `<div class="mb-editor">
        <div class="mb-row"><span>From → To</span><span>${fmt(x0)} → ${fmt(x1)} mm${seg ? ' · ' + ctx.posLabel(seg.position) : ''}</span></div>
        <div class="mb-row"><span>Thickness</span><span class="pc-inline"><input class="ed-input sp-s" data-k="t" type="number" step="0.5" min="3" value="${st.t != null ? st.t : ''}"><em>mm</em></span></div>
        <div class="mb-row"><span>Length</span><span class="pc-inline"><input class="ed-input sp-s" data-k="len" type="number" step="10" min="10" max="${fmt(ci.L)}" value="${fmt(st.len || 0)}"><em>mm · neighbour adjusts</em></span></div>
        <div class="mb-row"><span>Material</span><select class="ed-input sp-s" data-k="grade">${GRADES.map(g => `<option value="${g}" ${st.grade === g ? 'selected' : ''}>${g}</option>`).join('')}</select></div>
        <div class="mb-row"><span>User ID</span><input class="ed-input sp-s" data-k="uid" type="text" value="${st.uid || ''}" placeholder="optional"></div>
        <div class="mb-split">
          <div class="mb-box"><div class="mb-box-title">Hole</div>
            <div class="mb-row"><span>Breadth</span><span class="pc-inline"><input class="ed-input sp-h" data-k="b" type="number" step="10" min="0" value="${st.hole && st.hole.b != null ? st.hole.b : ''}" placeholder="0"><em>mm</em></span></div>
            <div class="mb-row"><span>Location</span><span class="pc-inline"><input class="ed-input sp-h" data-k="loc" type="number" step="10" min="0" value="${st.hole && st.hole.loc != null ? st.hole.loc : ''}" placeholder="0"><em>mm</em></span></div></div>
          <div class="mb-box"><div class="mb-box-title">Type</div>
            ${[['ordinary', 'Ordinary strake'], ['sheer', 'Sheer strake'], ['keel', 'Keel plate']].map(([k, l]) => `<label class="mb-radio"><input type="radio" name="spStType" class="sp-type" value="${k}" ${(st.type || 'ordinary') === k ? 'checked' : ''}> ${l}</label>`).join('')}</div>
        </div>
      </div>`;
    }
    ec.innerHTML = h; bindHeader(ec, s, ctx);
    const mut = fn => { const m = JSON.parse(JSON.stringify(s)); fn(M().panelData(m, gid), m); ctx.commit(m); };
    ec.querySelectorAll('[data-st]').forEach(r => r.addEventListener('click', () => { state.strake = state.strake === +r.dataset.st ? null : +r.dataset.st; ctx.refresh(); }));
    ec.querySelectorAll('.sp-s').forEach(i => i.addEventListener('change', e => mut(dd => {
      const st = dd.strakes[state.strake]; if (!st) return; const k = e.target.dataset.k;
      if (k === 'grade' || k === 'uid') { st[k] = e.target.value; return; }
      const v = parseFloat(e.target.value);
      if (k !== 'len') { st[k] = isNaN(v) ? null : v; return; }
      // the panel length is fixed: what one strake gains its neighbour gives (next, else previous)
      if (isNaN(v)) return;
      const nb = dd.strakes[state.strake + 1] || dd.strakes[state.strake - 1]; const old = st.len || 0;
      let nv = Math.max(10, Math.round(v / 10) * 10);
      if (nb) { const room = (nb.len || 0) - 10; nv = Math.min(nv, old + room); nb.len = (nb.len || 0) - (nv - old); }
      else nv = Math.round(ci.L);
      st.len = nv;
    })));
    ec.querySelectorAll('.sp-h').forEach(i => i.addEventListener('change', e => mut(dd => { const st = dd.strakes[state.strake]; if (!st) return; st.hole = st.hole || { b: 0, loc: 0 }; st.hole[e.target.dataset.k] = parseFloat(e.target.value) || 0; if (!st.hole.b) st.hole = null; })));
    ec.querySelectorAll('.sp-type').forEach(i => i.addEventListener('change', e => mut(dd => { const st = dd.strakes[state.strake]; if (st) st.type = e.target.value; })));
    ec.querySelectorAll('[data-sp]').forEach(b => b.addEventListener('click', () => {
      const k = b.dataset.sp; if (k.startsWith('pnl')) return;
      const grade = ctx.defaultGrade(s, gid);
      switch (k) {
        case 'st-add': mut(dd => {
          if (!dd.strakes.length) { dd.strakes.push({ len: Math.round(ci.L), t: null, grade, type: 'ordinary', hole: null }); state.strake = 0; return; }
          // split: the selected (else the last) strake becomes two halves — no length is added
          const i = state.strake != null ? state.strake : dd.strakes.length - 1; const st = dd.strakes[i];
          const a = Math.max(10, Math.round((st.len || 0) / 2 / 10) * 10); const b = (st.len || 0) - a; if (b < 10) return;
          st.len = a; dd.strakes.splice(i + 1, 0, { len: b, t: st.t, grade: st.grade, type: st.type || 'ordinary', hole: null }); state.strake = i + 1;
        }); break;
        case 'st-copy': mut(dd => { const i = state.strake; const st = dd.strakes[i]; if (!st) return; const a = Math.max(10, Math.round((st.len || 0) / 2 / 10) * 10); const b = (st.len || 0) - a; if (b < 10) return; const c = JSON.parse(JSON.stringify(st)); st.len = a; c.len = b; dd.strakes.splice(i + 1, 0, c); state.strake = i + 1; }); break;
        case 'st-del': mut(dd => { if (state.strake == null) return; const i = state.strake; const gone = dd.strakes.splice(i, 1)[0]; const nb = dd.strakes[i] || dd.strakes[i - 1]; if (nb && gone) nb.len = (nb.len || 0) + (gone.len || 0); state.strake = null; }); break;
        case 'st-prev': if (state.strake > 0) { state.strake--; ctx.refresh(); } break;
        case 'st-next': if (state.strake < arr.length - 1) { state.strake++; ctx.refresh(); } break;
        case 'st-fit': mut(dd => { const last = dd.strakes[dd.strakes.length - 1]; if (!last) return; const others = sumLen(dd.strakes) - (last.len || 0); last.len = Math.max(10, Math.round(ci.L - others)); }); break;
        case 'st-auto': mut((dd, m) => {
          const W = parseFloat((ec.querySelector('.sp-autow') || {}).value) || 2480, C = Math.max(50, parseFloat((ec.querySelector('.sp-autoc') || {}).value) || 100);
          state.autoW = W; state.autoC = C;
          const keel = ctx.keelHalfFor(gid);
          dd.strakes = M().autoStrakes(m, gid, { width: W, clear: C, keel, grade: ctx.defaultGrade(m, gid) });
          state.strake = null;
          const obs = M().chainObstacles(m, gid).length;
          ctx.toast(dd.strakes.length + ' plates of ' + W + ' mm' + (obs ? ' · seams kept ' + C + ' mm clear of ' + obs + ' member' + (obs > 1 ? 's' : '') : ''));
        }); break;
      }
    }));
  }

  // ─────────────────────────────────────────────────────────── STIFFENERS
  function renderStiffs(ec, s, ctx) {
    const gid = currentGid(s, ctx); if (!gid) { ec.innerHTML = '<div class="mb-empty">No panels yet.</div>'; return; }
    const d = M().panelData(s, gid); const ci = M().chainInfo(s, gid); const groups = d.stiffGroups;
    const defSpan = s.stiffDefaultSpan || (parseFloat((document.getElementById('le') || {}).value) * 1000) || null;
    // positions of every group (prev-reference chains through the list)
    let prevEnd = null; const placedBy = {}; let total = 0, dropped = 0;
    groups.forEach(g => { const r = M().groupPositions(s, gid, g, prevEnd); placedBy[g.id] = r; if (r.placed.length) prevEnd = Math.max(...r.placed); total += r.placed.length; dropped += r.dropped.length; });
    const g = state.group ? groups.find(x => x.id === state.group) : null;
    let h = header(s, ctx, gid, 'Stiffeners');
    h += `<div class="mb"><div class="mb-title">Group definition <em class="mb-em">${groups.length} grp · ${total} stiff${dropped ? ' · ' + dropped + ' ✕' : ''}</em></div>
      ${tools([{ k: 'sg-add', i: '＋', t: 'New group' }, { k: 'sg-copy', i: '⧉', t: 'Duplicate the selected group', off: !g }, { k: 'sg-del', i: '✕', t: 'Delete the selected group', off: !g }, { k: 'sg-fill', i: '⤓', t: 'Fill this panel with one group at the engine spacing', off: groups.length > 0 }])}
      <div class="mb-table"><div class="mb-th sp-sg-th"><span>ID</span><span>Start</span><span>Spacing</span><span>N</span><span>Type</span><span>Fit</span></div>`;
    groups.forEach(x => { const r = placedBy[x.id]; h += `<div class="mb-tr sp-sg-th ${state.group === x.id ? 'is-sel' : ''}" data-sg="${x.id}"><span>${x.id}</span><span>${fmt(x.start || 0)}${x.fromEnd === 'end' ? '↤' : ''}</span><span>${x.spacing || '—'}</span><span>${x.count || 0}</span><span>${x.type}${x.dir === 'trans' ? ' ⟂' : ''}</span><span style="color:${r.dropped.length ? 'var(--warning)' : 'var(--success)'}">${r.dropped.length ? r.dropped.length + ' ✕' : '✓'}</span></div>`; });
    if (!groups.length) h += `<div class="mb-empty-row">no groups yet — ＋ adds one, ⤓ fills the panel at the engine spacing</div>`;
    h += `</div></div>`;
    if (g) {
      const r = placedBy[g.id]; const names = ctx.profileNames(g.type);
      const need = g.count ? Math.round((g.start || 0) + ((g.count || 1) - 1) * (g.spacing || 0)) : 0;
      h += `<div class="mb-editor">
        <div class="mb-row"><span>Group ID</span><span class="pc-inline"><input class="ed-input sp-g" data-k="id" type="text" value="${g.id}" style="width:60px"><em>${r.placed.length} placed${r.dropped.length ? ' · ' + r.dropped.length + ' do not fit (needs ' + need + ' mm, panel ' + fmt(ci.L) + ')' : ''}</em></span></div>
        <div class="mb-row"><span>Start</span><span class="pc-inline"><input class="ed-input sp-g" data-k="start" type="number" step="10" value="${g.start != null ? g.start : ''}"><em>mm</em></span></div>
        <div class="mb-row"><span>Spacing</span><span class="pc-inline"><input class="ed-input sp-g" data-k="spacing" type="number" step="5" value="${g.spacing != null ? g.spacing : ''}"><em>mm</em></span></div>
        <div class="mb-row"><span>Number</span><span class="pc-inline"><input class="ed-input sp-g" data-k="count" type="number" step="1" min="0" value="${g.count != null ? g.count : ''}"><button class="ed-link-btn" data-sp="sg-max" title="As many as fit">max</button></span></div>
        <div class="mb-row"><span>Along</span><select class="ed-input sp-g" data-k="fromEnd"><option value="start" ${g.fromEnd !== 'end' ? 'selected' : ''}>from ${ci.startNode || 'start'} (panel start)</option><option value="end" ${g.fromEnd === 'end' ? 'selected' : ''}>from ${ci.endNode || 'end'} (panel end)</option></select></div>
        <div class="mb-row"><span>Reference</span><select class="ed-input sp-g" data-k="ref"><option value="node" ${g.ref !== 'prev' ? 'selected' : ''}>panel node</option><option value="prev" ${g.ref === 'prev' ? 'selected' : ''}>previous stiffener</option></select></div>
        <div class="mb-row"><span>Direction</span><select class="ed-input sp-g" data-k="dir"><option value="long" ${g.dir !== 'trans' ? 'selected' : ''}>longitudinal</option><option value="trans" ${g.dir === 'trans' ? 'selected' : ''}>transverse</option></select></div>
        <div class="mb-row"><span>Side</span><select class="ed-input sp-g" data-k="side"><option value="in" ${g.side !== 'out' ? 'selected' : ''}>interior (hold side)</option><option value="out" ${g.side === 'out' ? 'selected' : ''}>other side (tank / outboard)</option></select></div>
        <div class="mb-row"><span>Span</span><span class="pc-inline"><input class="ed-input sp-g" data-k="span" type="number" step="10" value="${g.span != null ? g.span : ''}" placeholder="${M().spanAt(s, gid, r.placed[0] || 0) || defSpan || ''}"><em>mm · blank = supports</em></span></div>
        <div class="mb-box" style="margin:6px 8px 2px"><div class="mb-box-title">Scantling</div>
          <div class="mb-row"><span>Profile</span><span class="pc-inline"><input class="ed-input sp-g" data-k="profile" list="spProfList" type="text" value="${g.profile || ''}" placeholder="${names[0] || 'size'}" style="flex:1"><datalist id="spProfList">${names.map(n => `<option value="${n}">`).join('')}</datalist></span></div>
          <div class="mb-row"><span>Material</span><select class="ed-input sp-g" data-k="grade">${GRADES.map(x => `<option value="${x}" ${g.grade === x ? 'selected' : ''}>${x}</option>`).join('')}</select></div>
          <div class="mb-row"><span>Type</span><span class="cad-seg sp-types">${STIFF_TYPES.map(([k, l]) => `<button class="${g.type === k ? 'on' : ''}" data-sp="type-${k}" title="${l}">${k}</button>`).join('')}</span></div>
        </div>
        <div class="mb-table" style="margin-top:6px"><div class="mb-th sp-list-th"><span>#</span><span>at (mm)</span><span>Y</span><span>Z</span><span>span</span></div>
          ${r.placed.map((x, i) => { const at = M().chainPointAt(s, gid, x); const sp = (g.spanOverrides && g.spanOverrides[i]) || g.span || M().spanAt(s, gid, x) || defSpan; return `<div class="mb-tr sp-list-th"><span>${i + 1}</span><span>${fmt(x)}</span><span>${at ? fmt(at.y) : ''}</span><span>${at ? fmt(at.z) : ''}</span><span><input class="ed-input sp-ov" data-i="${i}" type="number" step="10" value="${(g.spanOverrides || {})[i] || ''}" placeholder="${sp || ''}"></span></div>`; }).join('')}
        </div>
      </div>`;
    }
    ec.innerHTML = h; bindHeader(ec, s, ctx);
    const mut = fn => { const m = JSON.parse(JSON.stringify(s)); fn(M().panelData(m, gid), m); ctx.commit(m); };
    const cur = dd => dd.stiffGroups.find(x => x.id === state.group);
    ec.querySelectorAll('[data-sg]').forEach(r => r.addEventListener('click', () => { state.group = state.group === r.dataset.sg ? null : r.dataset.sg; ctx.refresh(); }));
    ec.querySelectorAll('.sp-g').forEach(i => i.addEventListener('change', e => mut(dd => { const x = cur(dd); if (!x) return; const k = e.target.dataset.k; let v = e.target.value;
      if (['start', 'spacing', 'count', 'span'].includes(k)) { v = parseFloat(v); if (isNaN(v)) v = k === 'span' ? null : 0; if (k === 'count') v = Math.max(0, Math.round(v)); }
      if (k === 'id') { v = v.trim() || x.id; if (dd.stiffGroups.some(o => o !== x && o.id === v)) return; state.group = v; }
      x[k] = v; })));
    ec.querySelectorAll('.sp-ov').forEach(i => i.addEventListener('change', e => mut(dd => { const x = cur(dd); if (!x) return; x.spanOverrides = x.spanOverrides || {}; const v = parseFloat(e.target.value); if (v > 0) x.spanOverrides[e.target.dataset.i] = v; else delete x.spanOverrides[e.target.dataset.i]; })));
    ec.querySelectorAll('[data-sp]').forEach(b => b.addEventListener('click', () => {
      const k = b.dataset.sp; if (k.startsWith('pnl')) return;
      if (k === 'sg-add' || k === 'sg-fill') { mut(dd => { const sp = ctx.spacingFor(gid); let n = 1; while (dd.stiffGroups.some(x => x.id === 'G' + n)) n++; const count = Math.max(0, Math.floor((ci.L - sp) / sp) + (((ci.L - sp) % sp) > 0.5 ? 1 : 0)); dd.stiffGroups.push({ id: 'G' + n, start: sp, spacing: sp, count: k === 'sg-fill' ? count : Math.min(count, 4), fromEnd: 'start', ref: 'node', dir: 'long', type: ctx.profTypeFor(gid), profile: '', grade: ctx.defaultGrade(s, gid), side: ctx.defaultSide(gid), span: null, spanOverrides: {} }); state.group = 'G' + n; }); return; }
      if (k === 'sg-copy') { mut(dd => { const x = cur(dd); if (!x) return; const c = JSON.parse(JSON.stringify(x)); let n = 1; while (dd.stiffGroups.some(o => o.id === 'G' + n)) n++; c.id = 'G' + n; c.ref = 'prev'; c.start = x.spacing; dd.stiffGroups.push(c); state.group = c.id; }); return; }
      if (k === 'sg-del') { mut(dd => { dd.stiffGroups = dd.stiffGroups.filter(x => x.id !== state.group); state.group = null; }); return; }
      if (k === 'sg-max') { mut(dd => { const x = cur(dd); if (!x || !(x.spacing > 0)) return; x.count = Math.max(0, Math.floor((ci.L - (x.start || 0) - 0.5) / x.spacing) + 1); }); return; }
      const set = (kk, v) => mut(dd => { const x = cur(dd); if (x) x[kk] = v; });
      if (k === 'along-start') set('fromEnd', 'start'); if (k === 'along-end') set('fromEnd', 'end');
      if (k === 'ref-node') set('ref', 'node'); if (k === 'ref-prev') set('ref', 'prev');
      if (k === 'dir-long') set('dir', 'long'); if (k === 'dir-trans') set('dir', 'trans');
      if (k === 'side-in') set('side', 'in'); if (k === 'side-out') set('side', 'out');
      if (k.startsWith('type-')) mut(dd => { const x = cur(dd); if (x) { x.type = k.slice(5); x.profile = ''; } });
    }));
  }

  window.ScantlingPanels = { state, renderSupports, renderStrakes, renderStiffs, GRADES };
})();
