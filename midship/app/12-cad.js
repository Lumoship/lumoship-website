// =============================================================================
// 12-cad.js — Section CAD (step 2). Draws the SectionModel neutrally — lines
// and nodes only, no thickness / profile / colour — and lets the user shape
// it like a drawing: select, line, arc, add node (split), delete, plus the
// parametric "Ship Geometry" inputs and an "Add panel" list for the common
// members. Per-panel bending / shear efficiency and WT flag live here too.
//
// Active while VIEW_MODE === 'section' (the step-2 view). 10-draw.js hands
// over render() and renderEditor() to this module in that mode through
// window.Draw.__cad (X/Y transforms, svg element, GEOMETRY, view helpers).
// =============================================================================
(function () {
  'use strict';
  const M = () => window.SectionModel;
  const B = () => window.Draw && window.Draw.__cad;   // bridge to 10-draw internals

  const TOOLS = [
    { key: 'select', label: 'Select', hint: 'Select a panel or node', k: 'S' },
    { key: 'line',   label: 'Line',   hint: 'Two points; snaps to nodes and panels, else 10 mm grid. Type y,z · @dy,dz · distance', k: 'L' },
    { key: 'arc',    label: 'Arc',    hint: 'Two nodes, then a radius', k: 'A' },
    { key: 'split',  label: 'Node',   hint: 'Insert a node on a panel', k: 'N' },
    { key: 'delete', label: 'Delete', hint: 'Remove a panel', k: 'D' },
  ];
  let tool = 'select';
  let ortho = false;         // F8 — constrain the second point to horizontal / vertical
  let pendingGroup = null;   // panel that newly drawn lines join (set by the Panels ＋ button)
  let mode = 'section';      // 'section' (step 2: draw) | 'positions' (step 3: name panels) | 'strakes' (step 4)
  const GRADES = ['A', 'B', 'D', 'E', 'AH32', 'DH32', 'EH32', 'AH36', 'DH36', 'EH36', 'AH40', 'DH40', 'EH40'];
  const STIFF_TYPES = ['HP', 'L', 'T', 'FB'];
  let selComp = null;        // id of the selected compartment (compartments mode)
  let compPick = false;      // true while the two corners of the selected compartment's box are being picked
  let compPickA = null;      // first corner (real coordinates)
  // Compartment types with their LR inputs. Heads are resolved per element by the
  // rule engine (60-scantling-rules.js): tanks use the air pipe / overflow height
  // (LR Pt 4 Ch 1 Table 1.9.1 deep-tank formula, Sec 8.4.4 for a DB common with a
  // tank), holds use the cargo stowage load on the inner bottom (Sec 8.4).
  const COMP_TYPES = [
    { code: 'ballast',    label: 'Ballast tank',     rho: 1.025, tank: true,  hint: 'Sea water. Head to the air pipe / overflow top; test head 2.4 m above tank top (IACS).' },
    { code: 'fuel',       label: 'Fuel oil tank',    rho: 0.90,  tank: true,  hint: 'Heavy fuel. Head to the air pipe top; test head per tank top / overflow.' },
    { code: 'freshwater', label: 'Fresh water tank', rho: 1.00,  tank: true,  hint: 'Fresh / drinking water.' },
    { code: 'cargo',      label: 'Cargo hold',       rho: 0.80,  tank: false, hint: 'Dry cargo: stowage load on the inner bottom (t/m²) drives the IB plating; bulk density for the hopper / bulkheads.' },
    { code: 'liquidCargo',label: 'Liquid cargo',     rho: 0.85,  tank: true,  hint: 'Cargo oil / chemicals: deep-tank head with the cargo density.' },
    { code: 'void',       label: 'Void / cofferdam', rho: 0,     tank: false, hint: 'No liquid head; only the adjacent compartments load its boundaries.' },
    { code: 'machinery',  label: 'Machinery space',  rho: 0,     tank: false, hint: 'Engine room: deck loads and machinery casing rules, no tank head.' },
    { code: 'accommodation', label: 'Accommodation / stores', rho: 0, tank: false, hint: 'Deck loads only.' },
  ];
  const compType = code => COMP_TYPES.find(t => t.code === code) || COMP_TYPES[0];
  // Deck loads (kN/m²) per deck panel. 60-scantling-rules.js turns them into the
  // Pt 3 Ch 3 Table 3.5.1 design heads for the deck longitudinal checks
  // (SectionAdapter.deckLoadFor).
  const DECK_LOAD_TYPES = [
    { code: 'none',          label: '— none —',                 p: null },
    { code: 'weather',       label: 'Weather deck (rule head)', p: null },
    { code: 'cargo',         label: 'Cargo deck',               p: 25 },
    { code: 'stores',        label: 'Stores / provisions',      p: 20 },
    { code: 'accommodation', label: 'Accommodation',            p: 3.5 },
    { code: 'machinery',     label: 'Machinery flat',           p: 12 },
    { code: 'vehicles',      label: 'Vehicle deck (wheel loads)', p: null },
    { code: 'custom',        label: 'Custom',                   p: null },
  ];
  const DECK_POS = ['upperDeck', 'deck', 'tweenDeck', 'stringer', 'coamingTop'];
  const COMP_COLORS = ['#3b82f6', '#22c55e', '#a855f7', '#f97316', '#06b6d4', '#ec4899', '#eab308', '#14b8a6'];
  const compColor = (s, id) => COMP_COLORS[Math.max(0, (window.ShipComps ? ShipComps.list() : []).findIndex(c => c.id === id)) % COMP_COLORS.length];
  const CS = () => window.ShipComps;
  const compsHere = s => CS() ? CS().forSection(s) : [];
  // A compartment is a box: its outline on the section and the panels on / inside it.
  function compLoop(s, c) { return CS() && CS().hasSize(c) ? CS().polyOf(c) : null; }
  function compPanels(s, c) { return CS() ? CS().panelsOf(s, c) : []; }
  function polyArea(pts) { let a = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p.y * q.z - q.y * p.z; } return Math.abs(a) / 2; }
  function polyCentroid(pts) { let cy = 0, cz = 0; pts.forEach(p => { cy += p.y; cz += p.z; }); return { y: cy / pts.length, z: cz / pts.length }; }
  function pointInPoly(pts, p) { let inside = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const a = pts[i], b = pts[j]; if ((a.z > p.z) !== (b.z > p.z) && p.y < (b.y - a.y) * (p.z - a.z) / (b.z - a.z) + a.y) inside = !inside; } return inside; }
  function distToEdges(pts, p) { let d = Infinity; for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; const vy = b.y - a.y, vz = b.z - a.z; const L2 = vy * vy + vz * vz || 1; const t = Math.max(0, Math.min(1, ((p.y - a.y) * vy + (p.z - a.z) * vz) / L2)); d = Math.min(d, Math.hypot(p.y - a.y - t * vy, p.z - a.z - t * vz)); } return d; }
  // Free distance from p to the boundary along a direction (dy, dz), unit
  function freeExtent(pts, p, dy, dz) {
    let best = Infinity;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length]; const ey = b.y - a.y, ez = b.z - a.z;
      const den = dy * ez - dz * ey; if (Math.abs(den) < 1e-9) continue;
      const t = ((a.y - p.y) * ez - (a.z - p.z) * ey) / den; const u = ((a.y - p.y) * dz - (a.z - p.z) * dy) / den;
      if (t > 1e-6 && u >= -1e-6 && u <= 1 + 1e-6) best = Math.min(best, t);
    }
    return best === Infinity ? 0 : best;
  }
  // Where a label sits inside a space: the interior point farthest from the boundary
  // (an L-shaped wing tank gets its label in the tank, not on the hold side of the
  // corner), recentred between the walls, with the free room around it.
  function labelSpot(pts) {
    const ys = pts.map(q => q.y), zs = pts.map(q => q.z);
    const y0 = Math.min(...ys), y1 = Math.max(...ys), z0 = Math.min(...zs), z1 = Math.max(...zs);
    let best = null, bd = -1; const N = 28;
    for (let i = 1; i < N; i++) for (let j = 1; j < N; j++) {
      const p = { y: y0 + (y1 - y0) * i / N, z: z0 + (z1 - z0) * j / N };
      if (!pointInPoly(pts, p)) continue; const d = distToEdges(pts, p); if (d > bd) { bd = d; best = p; }
    }
    if (!best) return { p: polyCentroid(pts), w: 0, h: 0 };
    // recentre between the walls the label will sit between
    let l = freeExtent(pts, best, -1, 0), r = freeExtent(pts, best, 1, 0); best = { y: best.y + (r - l) / 2, z: best.z };
    let dn = freeExtent(pts, best, 0, -1), up = freeExtent(pts, best, 0, 1); best = { y: best.y, z: best.z + (up - dn) / 2 };
    l = freeExtent(pts, best, -1, 0); r = freeExtent(pts, best, 1, 0); dn = freeExtent(pts, best, 0, -1); up = freeExtent(pts, best, 0, 1);
    return { p: best, w: 2 * Math.min(l, r), h: 2 * Math.min(dn, up) };
  }
  function inStiffs() { return mode === 'stiffeners'; }
  function inComps() { return mode === 'compartments'; }
  // Muted colour per position, used only in the Positions view.
  const POS_COLOR = { bottom:'#f97316', bilge:'#fb923c', side:'#ef4444', innerBottom:'#3b82f6', innerSide:'#22c55e',
    centreGirder:'#a78bfa', sideGirder:'#a855f7', stringer:'#06b6d4', tweenDeck:'#14b8a6', upperDeck:'#eab308',
    coaming:'#84cc16', coamingTop:'#facc15', longBhd:'#ec4899', deck:'#e879f9', other:'#94a3b8' };
  let sel = { panel: null, node: null, group: null };   // group: highlighted panel (Section step)
  let hover = null;          // { y, z, kind:'node'|'panel'|'free', nodeId, panelId }
  let hoverSg = null;        // stiffener group under the pointer (Stiffeners view): { gid, sg }
  let hoverComp = null;      // compartment under the pointer (Compartments view)
  let pending = [];          // clicked points for line / arc
  let arcAsk = null;         // { a, b } waiting for a radius
  let addForm = null;        // which "Add panel" form is open
  let regenAsk = false;

  // ------------------------------------------------------------ helpers
  const S = () => { const m = B().getSection(); if (m && (!m.groups || m.panels.some(p => !p.group)) && M().assignGroups) M().assignGroups(m); return m; };
  const gName = (s, gid) => (s.groups && s.groups[gid]) || gid || '—';
  const G = () => B().GEOMETRY();
  const fmt = v => Math.round(v);
  const nodeById = (s, id) => s.nodes.find(n => n.id === id);
  const posLabel = code => (M().POS[code] ? M().POS[code].label : (code || '—'));
  const SHORT = { bottom:'BTM', bilge:'BLG', side:'SS', innerBottom:'IB', innerSide:'IS', centreGirder:'CG', sideGirder:'SG',
    stringer:'STR', tweenDeck:'TD', upperDeck:'UD', coaming:'HC', coamingTop:'HCT', longBhd:'LBH', deck:'DK', other:'—' };
  const shortPos = code => SHORT[code] || code;

  // Segments of a panel in chain order (walk from a free end; fall back to geometric sort).
  function orderedSegments(s, gid) {
    const segs = s.panels.filter(p => p.group === gid); if (segs.length < 2) return segs;
    const deg = {}; segs.forEach(p => { deg[p.from] = (deg[p.from] || 0) + 1; deg[p.to] = (deg[p.to] || 0) + 1; });
    const ends = Object.keys(deg).filter(k => deg[k] === 1);
    const byKey = q => { const ln = M().panelLine(q, s.nodes); return Math.min(ln.a.z, ln.b.z) * 1e6 + Math.min(ln.a.y, ln.b.y); };
    let start = ends.length ? ends.map(id => nodeById(s, id)).sort((a, b) => (a.z - b.z) || (a.y - b.y))[0].id : null;
    if (!start) return segs.sort((a, b) => byKey(a) - byKey(b));
    const out = []; const left = segs.slice(); let at = start, guard = 0;
    while (left.length && guard++ < 500) {
      const i = left.findIndex(p => p.from === at || p.to === at); if (i < 0) break;
      const p = left.splice(i, 1)[0]; out.push(p); at = p.from === at ? p.to : p.from;
    }
    return out.concat(left.sort((a, b) => byKey(a) - byKey(b)));
  }

  // Extents of the current model (fallback: parametric geometry).
  function extents() {
    const s = S(); const g = G();
    if (!s || !s.nodes.length) return { yMax: g.B_half, zMax: g.UD, IB: g.IB, IS: g.IS, UD: g.UD };
    const ys = s.nodes.map(n => n.y), zs = s.nodes.map(n => n.z);
    const ib = s.panels.filter(p => p.position === 'innerBottom').map(p => nodeById(s, p.from).z)[0];
    const isY = s.panels.filter(p => p.position === 'innerSide').map(p => nodeById(s, p.from).y)[0];
    const ud = s.panels.filter(p => p.position === 'upperDeck').map(p => nodeById(s, p.from).z)[0];
    return { yMax: Math.max(...ys), zMax: Math.max(...zs), IB: ib != null ? ib : g.IB, IS: isY != null ? isY : g.IS, UD: ud != null ? ud : g.UD };
  }

  // Every model mutation also refreshes the legacy engine state (07-adapter.js),
  // so the analysis views and the Check page never lag behind the drawing.
  let saveT = null;
  function pushLegacy(s) {
    if (window.SectionAdapter) { try { SectionAdapter.apply(s); } catch (e) { console.warn('[SectionAdapter]', e); } }
    try { window.dispatchEvent(new Event('midship:model-changed')); } catch (_) {}
    // autosave soon after a model edit (the project timer alone is 30 s)
    clearTimeout(saveT); saveT = setTimeout(() => { try { window.Project && window.Project.saveLocal && window.Project.saveLocal(); } catch (_) {} }, 800);
  }
  function commit(s) {
    s.manual = true;
    if (s.__idMap && sel.panel && s.__idMap[sel.panel]) sel.panel = s.__idMap[sel.panel];
    delete s.__idMap;
    B().setSection(s); pushLegacy(s);
    if (window.HistoryManager && typeof window.HistoryManager.recordChange === 'function') { try { window.HistoryManager.recordChange(); } catch (_) {} }
    B().render();
    renderPanel();
    if (typeof window.refreshStepStrip === 'function') window.refreshStepStrip();
  }

  // Screen → real mm
  function realFromEvent(e) {
    const svg = B().svg();
    const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
    const ctm = svg.getScreenCTM(); if (!ctm) return null;
    const p = pt.matrixTransform(ctm.inverse());
    return { y: p.x / B().SCALE, z: (B().BASELINE_Y - p.y) / B().SCALE };
  }
  // px → mm at current zoom
  // Nearest panel to a point (mm): { panel, dist } — lines by projection, arcs sampled
  function nearestPanel(s, p) {
    let best = null;
    s.panels.forEach(pl => {
      const ln = M().panelLine(pl, s.nodes); let d;
      if (ln.curve) { d = Infinity; for (let i = 0; i <= 24; i++) { const q = M().pointAt(ln, i / 24); d = Math.min(d, Math.hypot(q.y - p.y, q.z - p.z)); } }
      else { const vy = ln.b.y - ln.a.y, vz = ln.b.z - ln.a.z; const L2 = vy * vy + vz * vz || 1; const t = Math.max(0, Math.min(1, ((p.y - ln.a.y) * vy + (p.z - ln.a.z) * vz) / L2)); d = Math.hypot(p.y - ln.a.y - t * vy, p.z - ln.a.z - t * vz); }
      if (!best || d < best.dist) best = { panel: pl, dist: d };
    });
    return best;
  }
  // What a click at p (mm) means in the scantling steps: the stiffener group whose tick
  // is nearest, the strake under the point, or just the panel. Pure geometry.
  function pickScantling(s, p) {
    const tol = 12 * mmPerPx();
    if (inStiffs()) {
      let best = null;
      Object.keys(s.groups || {}).forEach(gid => {
        const d = M().panelData(s, gid); let prev = null;
        d.stiffGroups.forEach(g => {
          const r = M().groupPositions(s, gid, g, prev); if (r.placed.length) prev = Math.max(...r.placed);
          r.placed.forEach(x => {
            const at = M().chainPointAt(s, gid, x); if (!at) return;
            const sgn = (g.side === 'out' ? -1 : 1) * interiorSide(at.seg, s) * (chainFwd(s, gid, at.seg) ? 1 : -1);
            const a = { y: at.y, z: at.z }, b = g.dir === 'trans' ? { y: at.y + at.ty * 120, z: at.z + at.tz * 120 } : { y: at.y - at.tz * sgn * 260, z: at.z + at.ty * sgn * 260 };
            const vy = b.y - a.y, vz = b.z - a.z; const L2 = vy * vy + vz * vz || 1; const t = Math.max(0, Math.min(1, ((p.y - a.y) * vy + (p.z - a.z) * vz) / L2));
            const dist = Math.hypot(p.y - a.y - t * vy, p.z - a.z - t * vz);
            if (dist <= tol && (!best || dist < best.dist)) best = { gid, group: g.id, panel: at.seg.id, dist };
          });
        });
      });
      if (best) return best;
    }
    const np = nearestPanel(s, p); if (!np || np.dist > tol * 1.5) return null;
    const out = { gid: np.panel.group, panel: np.panel.id, dist: np.dist };
    if (inStrakes()) {
      const x = M().chainDistanceOf(s, np.panel.group, (() => { const ln = M().panelLine(np.panel, s.nodes); if (ln.curve) { let bq = null, bd = Infinity; for (let i = 0; i <= 24; i++) { const q = M().pointAt(ln, i / 24); const d = Math.hypot(q.y - p.y, q.z - p.z); if (d < bd) { bd = d; bq = q; } } return bq; } const vy = ln.b.y - ln.a.y, vz = ln.b.z - ln.a.z; const L2 = vy * vy + vz * vz || 1; const t = Math.max(0, Math.min(1, ((p.y - ln.a.y) * vy + (p.z - ln.a.z) * vz) / L2)); return { y: ln.a.y + t * vy, z: ln.a.z + t * vz }; })());
      if (x != null) { const d = M().panelData(s, np.panel.group); let acc = 0; for (let i = 0; i < d.strakes.length; i++) { acc += d.strakes[i].len || 0; if (x <= acc + 0.5) { out.strake = i; break; } } }
    }
    return out;
  }
  function mmPerPx() {
    const svg = B().svg(); const v = B().view();
    return (v.w / svg.getBoundingClientRect().width) / B().SCALE;
  }

  // Snap: node within 12 px, else panel within 8 px, else free (10 mm grid).
  function snap(p, shiftFrom) {
    const s = S(); if (!s) return { ...p, kind: 'free' };
    const tolN = (compPick ? 18 : 12) * mmPerPx(), tolP = 8 * mmPerPx();
    let best = null;
    s.nodes.forEach(n => { const d = Math.hypot(n.y - p.y, n.z - p.z); if (d <= tolN && (!best || d < best.d)) best = { d, y: n.y, z: n.z, kind: 'node', nodeId: n.id }; });
    if (best) return best;
    let q = p;
    if (shiftFrom) { // orthogonal constraint from the pending point
      q = Math.abs(p.y - shiftFrom.y) > Math.abs(p.z - shiftFrom.z) ? { y: p.y, z: shiftFrom.z } : { y: shiftFrom.y, z: p.z };
    }
    s.panels.forEach(pl => {
      const ln = M().panelLine(pl, s.nodes);
      // project q on the panel: sample-based for arcs, exact for straights
      let cand = null;
      if (ln.curve) {
        for (let i = 0; i <= 32; i++) { const pt = M().pointAt(ln, i / 32); const d = Math.hypot(pt.y - q.y, pt.z - q.z); if (!cand || d < cand.d) cand = { d, ...pt }; }
      } else {
        const dy = ln.b.y - ln.a.y, dz = ln.b.z - ln.a.z, L2 = dy * dy + dz * dz;
        let t = L2 ? ((q.y - ln.a.y) * dy + (q.z - ln.a.z) * dz) / L2 : 0; t = Math.max(0, Math.min(1, t));
        // round the along-panel distance to 10 mm so snapped points land on clean coordinates
        const Lp = Math.sqrt(L2); if (Lp > 0) t = Math.max(0, Math.min(1, Math.round(t * Lp / 10) * 10 / Lp));
        const pt = { y: ln.a.y + t * dy, z: ln.a.z + t * dz };
        cand = { d: Math.hypot(pt.y - q.y, pt.z - q.z), ...pt };
      }
      if (cand && cand.d <= tolP && (!best || cand.d < best.d)) best = { ...cand, kind: 'panel', panelId: pl.id };
    });
    if (best) return best;
    return { y: Math.round(q.y / 10) * 10, z: Math.round(q.z / 10) * 10, kind: 'free' };
  }

  // ------------------------------------------------------------ SVG render
  // Labels keep a constant screen size whatever the zoom: authored sizes are
  // screen pixels, converted to SVG units from the current viewBox. Also called by
  // 10-draw.js applyView() on zoom / pan in the drawing modes.
  // One number does it: --cad-u = SVG units per screen pixel (preserveAspectRatio meet →
  // the smaller of the two ratios). refine.css sizes every label class as
  // calc(N px × var(--cad-u)). No label carries an inline font-size.
  function scaleLabels(svg) {
    svg = svg || (B() && B().svg()); if (!svg) return;
    const vb = (svg.getAttribute('viewBox') || '').split(/\s+/).map(Number); const vw = vb[2] || 700, vh = vb[3] || 720;
    const ppu = Math.min(svg.clientWidth / vw, svg.clientHeight / vh); if (!(ppu > 0)) return;
    svg.style.setProperty('--cad-u', (1 / ppu).toFixed(5));
    guardLabels(svg);
  }
  // Anything else that writes an inline font-size on a cad-* label is undone before the
  // frame paints (MutationObserver callbacks run before rendering).
  let guardOn = null;
  function guardLabels(svg) {
    if (guardOn === svg) return; guardOn = svg;
    const strip = t => { if (t.tagName === 'text' && /(^|\s)cad-/.test(t.getAttribute('class') || '') && t.style && t.style.fontSize) t.style.removeProperty('font-size'); };
    new MutationObserver(ms => { ms.forEach(m => { if (m.type === 'attributes') strip(m.target); else m.addedNodes.forEach(n => { if (n.nodeType === 1) { strip(n); if (n.querySelectorAll) n.querySelectorAll('text').forEach(strip); } }); }); })
      .observe(svg, { attributes: true, attributeFilter: ['style'], subtree: true, childList: true });
  }
  // ---------------------------------------------------------------- dimension overlay
  // HTML labels over the drawing, placed through the SVG's screen matrix. Their size is
  // plain CSS; only their position follows the view. Re-placed on every render and on
  // zoom / pan (10-draw.js applyView → SectionCAD.placeLabels).
  let dimLabels = [];
  function placeLabels() {
    const host = document.getElementById('svgContainer'); const svg = B() && B().svg(); if (!host || !svg) return;
    let ov = document.getElementById('cadDims');
    if (!ov) { ov = document.createElement('div'); ov.id = 'cadDims'; ov.className = 'cad-dims'; host.appendChild(ov); }
    if (!active() || !dimLabels.length) { ov.innerHTML = ''; return; }
    const ctm = svg.getScreenCTM(); if (!ctm) return;
    const hr = host.getBoundingClientRect(); const X = B().X, Y = B().Y; const pt = svg.createSVGPoint();
    ov.innerHTML = dimLabels.map(l => {
      pt.x = X(l.y); pt.y = Y(l.z); const p = pt.matrixTransform(ctm);
      const left = p.x - hr.left, top = p.y - hr.top;
      const tx = l.anchor === 'end' ? '-100%' : l.anchor === 'middle' ? '-50%' : '0';
      return `<span class="cad-dims-l ${l.cls}" style="left:${left.toFixed(1)}px;top:${top.toFixed(1)}px;transform:translate(${tx},-50%)">${l.text}</span>`;
    }).join('');
  }
  function renderSvg() {
    const s = S(); const X = B().X, Y = B().Y;
    const svg = B().svg(); if (!svg || !s) return;
    const ex = extents();
    let h = '';
    // Reference lines: baseline and centreline
    h += `<line x1="${X(-300)}" y1="${Y(0)}" x2="${X(ex.yMax + 1200)}" y2="${Y(0)}" stroke="#334155" stroke-dasharray="6 4" vector-effect="non-scaling-stroke"/>`;
    h += `<line x1="${X(0)}" y1="${Y(-300)}" x2="${X(0)}" y2="${Y(ex.zMax + 600)}" stroke="#334155" stroke-dasharray="6 4" vector-effect="non-scaling-stroke"/>`;

    const pathOf = pl => {
      const ln = M().panelLine(pl, s.nodes);
      if (ln.curve) {
        const pts = []; for (let i = 0; i <= 24; i++) { const p = M().pointAt(ln, i / 24); pts.push(`${X(p.y)},${Y(p.z)}`); }
        return `<polyline points="${pts.join(' ')}" fill="none"`;
      }
      return `<line x1="${X(ln.a.y)}" y1="${Y(ln.a.z)}" x2="${X(ln.b.y)}" y2="${Y(ln.b.z)}"`;
    };
    // Panels (hit area first, then the visible stroke)
    s.panels.forEach(pl => {
      const isSel = sel.panel === pl.id, isHov = hover && hover.panelId === pl.id;
      if (inStrakes() || inStiffs() || inSupports()) {
        // scantling steps: hit area + a quiet base line; the panel-level runs are drawn below
        const cur = SP() && SP().state.gid;
        const dim = cur && pl.group !== cur;
        const hasRun = inStrakes() && (M().panelData(s, pl.group).strakes || []).length;
        if (!hasRun) h += `${pathOf(pl)} stroke="transparent" stroke-width="14" vector-effect="non-scaling-stroke" data-panel="${pl.id}" style="cursor:pointer"/>`;
        if (!inStrakes() || dim) h += `${pathOf(pl)} stroke="${dim ? '#475569' : (pl.group === cur ? '#93c5fd' : '#94a3b8')}" stroke-width="${pl.group === cur && !inStrakes() ? 2.5 : 1.5}" ${pl.wt ? '' : 'stroke-dasharray="10 5"'} vector-effect="non-scaling-stroke" pointer-events="none"/>`;
        return;
      }
      const inGrp = !!(sel.group && pl.group === sel.group && !inPositions());
      let col = isSel ? '#3b82f6' : isHov ? '#93c5fd' : inGrp ? '#60a5fa' : (pl.wt ? '#cbd5e1' : '#94a3b8');
      if (inPositions() && !isSel && !isHov) col = pl.position ? (POS_COLOR[pl.position] || '#94a3b8') : '#f59e0b';
      if (sel.group && !inGrp && !isSel && !isHov && !inPositions()) col = pl.wt ? '#64748b' : '#475569';   // dim the rest
      const w = isSel ? 3.5 : isHov ? 3 : inGrp ? 3 : (inPositions() ? 2.5 : 2);
      h += `${pathOf(pl)} stroke="transparent" stroke-width="14" vector-effect="non-scaling-stroke" data-panel="${pl.id}" style="cursor:pointer"/>`;
      h += `${pathOf(pl)} stroke="${col}" stroke-width="${w}" ${pl.wt ? '' : 'stroke-dasharray="10 5"'} vector-effect="non-scaling-stroke" pointer-events="none"/>`;
    });
    // Compartments view: the boxes the section cuts, their boundary panels, a label inside
    if (inComps()) {
      compsHere(s).forEach(c => {
        const col = compColor(s, c.id); const isSel = selComp === c.id, isHovC = hoverComp === c.id; const loop = compLoop(s, c);
        if (!loop) return;
        h += `<polygon points="${loop.map(q => `${X(q.y)},${Y(q.z)}`).join(' ')}" fill="${col}" fill-opacity="${isSel ? 0.22 : isHovC ? 0.17 : 0.10}" stroke="${col}" stroke-width="${isSel ? 2 : isHovC ? 1.6 : 1}" stroke-dasharray="${isSel ? '' : '4 3'}" vector-effect="non-scaling-stroke" data-comp="${c.id}" style="cursor:pointer"/>`;
        // boundary panels
        compPanels(s, c).forEach(id => { const pl = s.panels.find(p => p.id === id); if (pl) h += `${pathOf(pl)} stroke="${col}" stroke-width="${isSel ? 4 : 2.5}" vector-effect="non-scaling-stroke" pointer-events="none" opacity="${isSel ? 1 : 0.8}"/>`; });
        // corner handles of the selected box
        if (isSel) loop.forEach(q => { h += `<rect x="${X(q.y) - 3.5}" y="${Y(q.z) - 3.5}" width="7" height="7" fill="#0f172a" stroke="${col}" stroke-width="1.5" pointer-events="none"/>`; });
        // label inside the box: horizontal when the room allows, else along the longer side
        const spot = labelSpot(loop); const m = spot.p; const sc = Math.abs(X(1000) - X(0)) / 1000 || 1e-3;
        const name = c.name || c.id, sub = compType(c.type).label + (c.rho ? ' · ρ ' + c.rho : '');
        const roomW = spot.w * sc - 6, roomH = spot.h * sc - 6;
        const CH = 0.62; let fs = 9, vert = false, showSub = false;
        const fits = (f, w, hh) => name.length * CH * f <= w && f * 1.1 <= hh;
        const trySize = f => { if (fits(f, roomW, roomH)) { fs = f; vert = false; return true; } if (fits(f, roomH, roomW)) { fs = f; vert = true; return true; } return false; };
        if (!trySize(9) && !trySize(8) && !trySize(7)) { trySize(6); }
        if (!vert && fs >= 8) { const subW = sub.length * CH * 7; showSub = subW <= roomW && fs * 1.1 + 9 <= roomH; }
        else if (vert && fs >= 8) { const subW = sub.length * CH * 7; showSub = subW <= roomH && fs * 1.1 + 9 <= roomW; }
        const lx = X(m.y), ly = Y(m.z); const tr = vert ? ` transform="rotate(-90 ${lx} ${ly})"` : '';
        const dy0 = showSub ? -3 : 3;
        h += `<text x="${lx}" y="${ly + dy0}" class="cad-comp" fill="${col}" style="--fs:${fs}px" text-anchor="middle" data-comp="${c.id}" style="cursor:pointer"${tr}>${name}</text>`;
        if (showSub) h += `<text x="${lx}" y="${ly + 8}" class="cad-comp-sub" fill="${col}" text-anchor="middle" pointer-events="none"${tr}>${sub}</text>`;
      });
      // picking the corners: first corner marked, rubber box to the pointer
      if (compPick && selComp && compPickA && hover) {
        const a = compPickA; h += `<rect x="${Math.min(X(a.y), X(hover.y))}" y="${Math.min(Y(a.z), Y(hover.z))}" width="${Math.abs(X(hover.y) - X(a.y))}" height="${Math.abs(Y(hover.z) - Y(a.z))}" fill="rgba(59,130,246,0.10)" stroke="#3b82f6" stroke-width="1.2" stroke-dasharray="5 4" vector-effect="non-scaling-stroke" pointer-events="none"/>`;
        h += `<circle cx="${X(a.y)}" cy="${Y(a.z)}" r="4" fill="#3b82f6" pointer-events="none"/>`;
      }
    }
    // Scantling steps: panel-level runs along each panel chain
    if (inStrakes() || inStiffs() || inSupports()) {
      const st = SP() ? SP().state : {}; const cur = st.gid;
      const chainPts = (gid, x0, x1) => M().chainPolyline(s, gid, x0, x1).map(q => `${X(q.y)},${Y(q.z)}`).join(' ');
      Object.keys(s.groups || {}).forEach(gid => {
        const d = M().panelData(s, gid); const ci = M().chainInfo(s, gid); if (!ci.L) return;
        const isCur = gid === cur;
        if (inStrakes()) {
          if (!d.strakes.length) { h += `<polyline points="${chainPts(gid, 0, ci.L)}" fill="none" stroke="${isCur ? '#f59e0b' : '#7c5a1a'}" stroke-width="${isCur ? 2.5 : 1.5}" stroke-dasharray="8 5" vector-effect="non-scaling-stroke" pointer-events="none"/>`; }
          else {
            let x = 0;
            d.strakes.forEach((sk, i) => {
              const x0 = x, x1 = Math.min(ci.L, x + (sk.len || 0)); x += (sk.len || 0); if (x1 <= x0) return;
              const selS = isCur && st.strake === i;
              const pts = chainPts(gid, x0, x1); const segId = firstSegIdAt(s, gid, (x0 + x1) / 2);
              // wide invisible hit line so a strake can be picked, then the visible run (alternating shade)
              h += `<polyline points="${pts}" fill="none" stroke="transparent" stroke-width="16" vector-effect="non-scaling-stroke" data-panel="${segId}" data-strake="${i}" data-gid="${gid}" style="cursor:pointer"/>`;
              h += `<polyline points="${pts}" fill="none" stroke="${selS ? '#3b82f6' : tColor(sk.t)}" stroke-width="${selS ? 6 : isCur ? 4 : 2.5}" opacity="${selS ? 1 : isCur ? (i % 2 ? 0.75 : 1) : 0.5}" vector-effect="non-scaling-stroke" pointer-events="none"/>`;
              // boundary tick at the start of every strake but the first
              if (x0 > 0.5) { const b = M().chainPointAt(s, gid, x0); const cl = seamClearance(s, gid, x0); const cc = cl < 100 ? '#f59e0b' : (isCur ? '#e2e8f0' : '#64748b');
                if (b) h += `<line x1="${X(b.y - b.tz * (cl < 100 ? 240 : 160))}" y1="${Y(b.z + b.ty * (cl < 100 ? 240 : 160))}" x2="${X(b.y + b.tz * (cl < 100 ? 240 : 160))}" y2="${Y(b.z - b.ty * (cl < 100 ? 240 : 160))}" stroke="${cc}" stroke-width="${cl < 100 ? 2.2 : 1.4}" vector-effect="non-scaling-stroke" pointer-events="none"/>`;
                // seam too close to a member: a red (cannot be built) / amber (below recommended) badge on the outer side, picking the strake
                if (b && cl < 100 && isCur) { const sg = interiorSide(b.seg, s) * (chainFwd(s, gid, b.seg) ? 1 : -1); const bx = X(b.y - b.tz * sg * 560 + b.ty * 330), by = Y(b.z + b.ty * sg * 560 + b.tz * 330);
                  h += `<g data-panel="${segId}" data-strake="${i}" data-gid="${gid}" style="cursor:pointer"><title>seam ${i}|${i + 1} at ${fmt(x0)} mm is ${Math.round(cl)} mm from a member — ${cl < 50 ? 'under the 50 mm minimum' : 'below the recommended 100'}</title><circle cx="${bx}" cy="${by}" r="6.5" fill="${cc}" stroke="#0f172a" stroke-width="1.5"/><text x="${bx}" y="${by + 3.2}" font-size="9" font-weight="700" fill="#0f172a" text-anchor="middle" font-family="var(--font-mono)" pointer-events="none">!</text></g>`; } }
              const at = M().chainPointAt(s, gid, (x0 + x1) / 2); if (at && (isCur || (x1 - x0) > 900)) {
                // thickness label on the interior side of the plate, clear of the AB / CL dimension labels
                const sg = interiorSide(at.seg, s) * (chainFwd(s, gid, at.seg) ? 1 : -1); const nx = -at.tz * sg, nz = at.ty * sg;
                h += `<text x="${X(at.y + nx * 230)}" y="${Y(at.z + nz * 230) + 3}" class="cad-pos" fill="${selS ? '#3b82f6' : tColor(sk.t)}" text-anchor="middle" pointer-events="none">${sk.t != null ? sk.t : '?'}</text>`;
              }
            });
            if (x < ci.L - 5) h += `<polyline points="${chainPts(gid, x, ci.L)}" fill="none" stroke="#f59e0b" stroke-width="2" stroke-dasharray="6 4" vector-effect="non-scaling-stroke" pointer-events="none"/>`;
          }
        }
        if (inStrakes() && d.stiffGroups.length) {
          let prevEnd = null;
          d.stiffGroups.forEach(g => {
            const r = M().groupPositions(s, gid, g, prevEnd); if (r.placed.length) prevEnd = Math.max(...r.placed);
            r.placed.forEach(x => {
              const at = M().chainPointAt(s, gid, x); if (!at) return;
              const sideSign = (g.side === 'out' ? -1 : 1) * interiorSide(at.seg, s) * (chainFwd(s, gid, at.seg) ? 1 : -1);
              const nx = -at.tz * sideSign, nz = at.ty * sideSign;
              h += `<line x1="${X(at.y)}" y1="${Y(at.z)}" x2="${X(at.y + nx * 180)}" y2="${Y(at.z + nz * 180)}" stroke="${isCur ? '#3f6b4a' : '#2f4a38'}" stroke-width="1.2" vector-effect="non-scaling-stroke" pointer-events="none"/>`;
            });
          });
        }
        if (inStiffs()) {
          let prevEnd = null;
          d.stiffGroups.forEach(g => {
            const r = M().groupPositions(s, gid, g, prevEnd); if (r.placed.length) prevEnd = Math.max(...r.placed);
            const gSel = isCur && st.group === g.id; const gHov = hoverSg && hoverSg.gid === gid && hoverSg.sg === g.id;
            const col = gSel ? '#3b82f6' : gHov ? '#93c5fd' : g.dir === 'trans' ? '#a855f7' : (isCur ? '#22c55e' : '#3f6b4a');
            const tick = 260;
            r.placed.forEach(x => {
              const at = M().chainPointAt(s, gid, x); if (!at) return;
              const sideSign = (g.side === 'out' ? -1 : 1) * interiorSide(at.seg, s) * (chainFwd(s, gid, at.seg) ? 1 : -1);
              const nx = -at.tz * sideSign, nz = at.ty * sideSign;
              // wide invisible hit line: hovering lights the group, clicking opens it in the list
              const hx1 = g.dir === 'trans' ? at.y - at.ty * 120 : at.y, hz1 = g.dir === 'trans' ? at.z - at.tz * 120 : at.z, hx2 = g.dir === 'trans' ? at.y + at.ty * 120 : at.y + nx * tick, hz2 = g.dir === 'trans' ? at.z + at.tz * 120 : at.z + nz * tick;
              h += `<line x1="${X(hx1)}" y1="${Y(hz1)}" x2="${X(hx2)}" y2="${Y(hz2)}" stroke="transparent" stroke-width="12" vector-effect="non-scaling-stroke" data-panel="${at.seg.id}" data-gid="${gid}" data-sg="${g.id}" style="cursor:pointer"/>`;
              if (g.dir === 'trans') {
                h += `<line x1="${X(at.y - at.ty * 120)}" y1="${Y(at.z - at.tz * 120)}" x2="${X(at.y + at.ty * 120)}" y2="${Y(at.z + at.tz * 120)}" stroke="${col}" stroke-width="${gSel ? 2.5 : 1.6}" vector-effect="non-scaling-stroke" pointer-events="none"/>`;
              } else {
                h += `<line x1="${X(at.y)}" y1="${Y(at.z)}" x2="${X(at.y + nx * tick)}" y2="${Y(at.z + nz * tick)}" stroke="${col}" stroke-width="${gSel ? 2.5 : 1.6}" vector-effect="non-scaling-stroke" pointer-events="none"/>`;
                if (g.type === 'L' || g.type === 'HP') h += `<line x1="${X(at.y + nx * tick)}" y1="${Y(at.z + nz * tick)}" x2="${X(at.y + nx * tick + at.ty * 90)}" y2="${Y(at.z + nz * tick + at.tz * 90)}" stroke="${col}" stroke-width="${gSel ? 2.5 : 1.6}" vector-effect="non-scaling-stroke" pointer-events="none"/>`;
                if (g.type === 'T') h += `<line x1="${X(at.y + nx * tick - at.ty * 70)}" y1="${Y(at.z + nz * tick - at.tz * 70)}" x2="${X(at.y + nx * tick + at.ty * 70)}" y2="${Y(at.z + nz * tick + at.tz * 70)}" stroke="${col}" stroke-width="${gSel ? 2.5 : 1.6}" vector-effect="non-scaling-stroke" pointer-events="none"/>`;
              }
            });
            r.dropped.forEach(x => { const at = M().chainPointAt(s, gid, x); if (at) h += `<text x="${X(at.y)}" y="${Y(at.z) + 3}" class="cad-pos" fill="#f59e0b" text-anchor="middle" pointer-events="none">✕</text>`; });
          });
        }
        if (inSupports() && isCur) {
          // exception areas as amber bands, span text at the panel middle
          (d.supports.exceptions || []).forEach((e, i) => { const x0 = Math.min(e.from, e.to), x1 = Math.max(e.from, e.to); if (x1 > x0) h += `<polyline points="${chainPts(gid, x0, x1)}" fill="none" stroke="${st.exc === i ? '#3b82f6' : '#f59e0b'}" stroke-width="7" opacity="0.55" vector-effect="non-scaling-stroke" pointer-events="none"/>`; });

        }
      });
    }
    // Nodes
    s.nodes.forEach(n => {
      const isSel = sel.node === n.id, isHov = hover && hover.nodeId === n.id;
      h += `<circle cx="${X(n.y)}" cy="${Y(n.z)}" r="${isSel || isHov ? 5 : 3.2}" fill="${isSel ? '#3b82f6' : '#0f172a'}" stroke="${isSel || isHov ? '#3b82f6' : '#cbd5e1'}" stroke-width="1.6" vector-effect="non-scaling-stroke" data-node="${n.id}" style="cursor:pointer"/>`;
    });
    // Dimension labels live in the HTML overlay (placeLabels), not in the SVG
    dimLabels = [{ y: -160, z: -40, text: 'BL 0', anchor: 'end', cls: 'axis' }, { y: 60, z: ex.zMax + 480, text: 'CL', anchor: 'start', cls: 'axis' }];
    const zs = [...new Set(s.nodes.map(n => n.z))].filter(z => z > 0 && (s.nodes.filter(n => n.z === z).length >= 2 || z === ex.zMax));
    zs.forEach(z => dimLabels.push({ y: ex.yMax + 260, z, text: fmt(z) + ' AB', anchor: 'start', cls: 'dim' }));
    const ys = [...new Set(s.nodes.map(n => n.y))].filter(y => y > 0 && (s.nodes.filter(n => n.y === y).length >= 2 || y === ex.yMax)).sort((a, b) => a - b);
    // one row; neighbours closer than a label width lean away from each other instead of stacking
    ys.forEach((y, i) => {
      const prevClose = i > 0 && y - ys[i - 1] < 2400, nextClose = i < ys.length - 1 && ys[i + 1] - y < 2400;
      const anchor = prevClose && !nextClose ? 'start' : nextClose && !prevClose ? 'end' : 'middle';
      dimLabels.push({ y, z: -720, text: fmt(y) + ' CL', anchor, cls: 'dim' });
    });
    // Positions view: code chip at every panel midpoint (amber "?" when unnamed)
    if (inPositions()) {
      s.panels.forEach(pl => {
        const ln = M().panelLine(pl, s.nodes); const m = M().pointAt(ln, 0.5);
        const vert = Math.abs(ln.a.y - ln.b.y) < 1;
        const txt = pl.position ? shortPos(pl.position) : '?';
        const col = pl.position ? (POS_COLOR[pl.position] || '#94a3b8') : '#f59e0b';
        const dx = vert ? 6 : 0, dy = vert ? 3 : -6;
        h += `<text x="${X(m.y) + dx}" y="${Y(m.z) + dy}" class="cad-pos" fill="${col}" ${vert ? '' : 'text-anchor="middle"'} data-panel="${pl.id}" style="cursor:pointer">${txt}</text>`;
      });
    }
    // Selected panel id (section mode only — the strake / stiffener views carry their own values)
    if (sel.panel && (mode === 'section' || mode === 'positions')) {
      const pl = s.panels.find(p => p.id === sel.panel);
      if (pl) {
        const ln = M().panelLine(pl, s.nodes); const m = M().pointAt(ln, 0.5);
        const q2 = M().pointAt(ln, 0.51); let ty = q2.y - m.y, tz = q2.z - m.z; const nl = Math.hypot(ty, tz) || 1; ty /= nl; tz /= nl;
        const sgn = interiorSide(pl, s); const nx = -tz * sgn, nz = ty * sgn;   // normal towards the interior
        const off = 230; const lx = X(m.y + nx * off), ly = Y(m.z + nz * off);
        let ang = -Math.atan2(tz, ty) * 180 / Math.PI; if (ang > 90 || ang < -90) ang += 180;   // keep text upright
        h += `<text x="${lx}" y="${ly}" class="cad-sel" text-anchor="middle" dominant-baseline="middle" transform="rotate(${ang.toFixed(1)} ${lx} ${ly})">${pl.id}</text>`;
      }
    }
    // Rubber band for the line / arc tool
    if (pending.length && hover) {
      const a = pending[0];
      h += `<line x1="${X(a.y)}" y1="${Y(a.z)}" x2="${X(hover.y)}" y2="${Y(hover.z)}" stroke="#f59e0b" stroke-width="1.5" stroke-dasharray="6 4" vector-effect="non-scaling-stroke" pointer-events="none"/>`;
      h += `<text x="${X(hover.y) + 10}" y="${Y(hover.z) - 10}" class="cad-sel" fill="#f59e0b">${fmt(Math.hypot(hover.y - a.y, hover.z - a.z))} mm</text>`;
    }
    // Cursor marker + coordinates next to it (the point that will be placed)
    if (hover && tool !== 'select' && mode === 'section') {
      const c = hover.kind === 'node' ? '#22c55e' : hover.kind === 'panel' ? '#f59e0b' : '#64748b';
      h += `<rect x="${X(hover.y) - 5}" y="${Y(hover.z) - 5}" width="10" height="10" fill="none" stroke="${c}" stroke-width="1.5" vector-effect="non-scaling-stroke" pointer-events="none"/>`;
      h += `<text x="${X(hover.y) + 9}" y="${Y(hover.z) + 14}" class="cad-cursor" fill="${c}" pointer-events="none">${fmt(hover.y)}, ${fmt(hover.z)}${hover.kind === 'node' ? ' · ' + hover.nodeId : ''}</text>`;
    }
    svg.innerHTML = h;
    scaleLabels(svg);
    placeLabels();
    // Coordinates readout in the drawing header (reuse zoom info neighbour)
    const ro = document.getElementById('cadReadout');
    if (ro) ro.textContent = hover ? `Y ${fmt(hover.y)} · Z ${fmt(hover.z)}${hover.kind === 'node' ? ' · ' + hover.nodeId : hover.kind === 'panel' ? ' · ' + hover.panelId : ''}` : '';
  }

  // ------------------------------------------------------------ toolbar (floating, over the drawing)
  function ensureToolbar() {
    const host = document.getElementById('svgContainer'); if (!host) return;
    let tb = document.getElementById('cadToolbar');
    if (!tb) {
      tb = document.createElement('div'); tb.id = 'cadToolbar'; tb.className = 'cad-toolbar';
      host.appendChild(tb);
      tb.addEventListener('click', e => {
        const o = e.target.closest('[data-ortho]'); if (o) { ortho = !ortho; ensureToolbar(); renderSvg(); return; }
        const b = e.target.closest('[data-tool]'); if (!b) return;
        setTool(b.dataset.tool);
      });
      const ro = document.createElement('div'); ro.id = 'cadReadout'; ro.className = 'cad-readout'; host.appendChild(ro);
    }
    const drawing = tool === 'line' || tool === 'arc' || tool === 'split';
    tb.innerHTML = TOOLS.map(t => `<button data-tool="${t.key}" class="${tool === t.key ? 'on' : ''}" title="${t.hint} (${t.k})">${t.label}</button>`).join('') +
      `<span class="cad-sep"></span><button data-ortho="1" class="${ortho ? 'on' : ''}" title="Ortho — horizontal / vertical only (F8)">Ortho</button>` +
      (drawing ? `<input class="cad-cmd" id="cadCmd" placeholder="${pending.length ? 'y,z · @dy,dz · distance' : 'y,z'}" title="Type a point: y,z absolute · @dy,dz from the last point · a distance along the cursor direction. Enter to place." spellcheck="false">` : '');
    const cmd = tb.querySelector('#cadCmd');
    if (cmd) cmd.addEventListener('keydown', ev => {
      if (ev.key === 'Enter') { const hp = typedPoint(cmd.value); if (hp) { placePoint(hp); cmd.value = ''; ensureToolbar(); const c2 = document.getElementById('cadCmd'); if (c2) c2.focus(); } else toast('Point not understood — y,z · @dy,dz · distance'); ev.preventDefault(); }
      if (ev.key === 'Escape') { pending = []; setTool('select'); }
      ev.stopPropagation();
    });
  }
  function setTool(t) { if (mode !== 'section') t = 'select'; tool = t; pending = []; arcAsk = null; B().svg().style.cursor = t === 'select' ? '' : 'crosshair'; ensureToolbar(); renderSvg(); renderPanel(); }
  const CAD_MODES = ['section', 'positions', 'supports', 'strakes', 'stiffeners', 'compartments'];
  function inSupports() { return mode === 'supports'; }
  const SP = () => window.ScantlingPanels;
  // Helpers the scantling panels need (kept here: they use the CAD state and 10-draw bridge)
  function defaultSpanFromShip() { const le = parseFloat((document.getElementById('le') || {}).value); if (le > 0) return Math.round(le * 1000); const tf = parseFloat((document.getElementById('transFrameSpacing') || {}).value); return tf > 0 ? Math.round(tf) : 2400; }
  function firstSeg(s, gid) { const c = M().chainOf(s, gid); return c.find(q => q.position) || c[0] || null; }
  function spacingForGroup(s, gid) { const P = B().PARAMS() || {}; const q = firstSeg(s, gid); const pos = q ? q.position : null;
    if (['bottom', 'bilge', 'innerBottom'].includes(pos)) return P.dbSpacing || 700;
    if (['side', 'innerSide', 'longBhd'].includes(pos)) return P.sideSpacing || 700;
    return P.deckSpacing || P.dbSpacing || 700; }
  function profTypeForGroup(s, gid) { const P = B().PARAMS() || {}; const q = firstSeg(s, gid); const map = { bottom: 'profTypeBottom', bilge: 'profTypeBottom', innerBottom: 'profTypeIB', side: 'profTypeSide', innerSide: 'profTypeIS', upperDeck: 'profTypeDeck', tweenDeck: 'profTypeTween', stringer: 'profTypeStringer', coamingTop: 'profTypeCoaming' };
    const t = q ? P[map[q.position]] : null; return ['HP', 'L', 'T', 'FB'].includes(t) ? t : 'HP'; }
  function defaultSideForGroup(s, gid) { const q = firstSeg(s, gid); return q && ['innerBottom', 'innerSide'].includes(q.position) ? 'out' : 'in'; }
  function profileNames(type) { try { return window.Profile.allProfiles([type]).map(p => p.name); } catch (_) { return []; } }
  function defaultGradeGroup(s, gid) { const q = firstSeg(s, gid); return q ? defaultGrade(s, q) : 'AH36'; }
  function hasLegacy() { const L = window.Draw && window.Draw.STRAKES; return !!(L && Object.keys(L).some(k => Array.isArray(L[k]) && L[k].length)); }
  // Fill one panel's strakes from the engine's automatic layout (same legacy key).
  function seedStrakesFor(gid) {
    const m = JSON.parse(JSON.stringify(S())); const key = window.SectionAdapter && SectionAdapter.legacyKeyOfGroup ? SectionAdapter.legacyKeyOfGroup(m, gid) : null;
    const src = key && window.Draw.STRAKES[key]; if (!src || !src.length) { toast('No automatic layout for this panel.'); return; }
    const d = M().panelData(m, gid); const L = M().chainInfo(m, gid).L;
    d.strakes = src.map(st => ({ len: Math.round(st.width || 0), t: st.thickness != null ? st.thickness : null, grade: st.materialFamily || defaultGradeGroup(m, gid), type: 'ordinary', hole: null }));
    const sum = d.strakes.reduce((a, x) => a + x.len, 0); if (d.strakes.length) d.strakes[d.strakes.length - 1].len += Math.round(L - sum);
    commitNames(m);
  }
  function panelsCtx() {
    return { sel, setSel: o => { sel = o; renderSvg(); renderPanel(); }, commit: commitNames, refresh: () => { renderSvg(); renderPanel(); },
      tColor, posLabel, defaultGrade: defaultGradeGroup, hasLegacy, seedStrakes: seedStrakesFor, profileNames, popupMenu,
      spacingFor: gid => spacingForGroup(S(), gid), profTypeFor: gid => profTypeForGroup(S(), gid), defaultSide: gid => defaultSideForGroup(S(), gid), toast,
      // keel plate half-width for the shell panel (first strake starts at CL), 0 elsewhere
      keelHalfFor: gid => { const q = firstSeg(S(), gid); return q && q.position === 'bottom' ? (G().keel_half || 0) : 0; } };
  }
  function active() { const v = B() && B().viewMode(); return CAD_MODES.includes(v); }
  function inPositions() { return mode === 'positions'; }
  function inStrakes() { return mode === 'strakes'; }
  // Distance from a seam to the nearest node / stiffener on the panel (mm)
  function seamClearance(s, gid, x) { const obs = M().chainObstacles ? M().chainObstacles(s, gid) : []; let d = Infinity; obs.forEach(o => { d = Math.min(d, Math.abs(o.x - x)); }); return d; }
  function firstSegIdAt(s, gid, x) { const at = M().chainPointAt(s, gid, x); return at ? at.seg.id : ''; }
  function chainFwd(s, gid, seg) { const ci = M().chainInfo(s, gid); const it = ci.items.find(i => i.seg.id === seg.id); return it ? it.fwd : true; }
  // Which side of the panel (from→to) the hull interior lies on: +1 = left of travel.
  function interiorSide(pl, s) {
    const ln = M().panelLine(pl, s.nodes); const m = M().pointAt(ln, 0.5);
    const ys = s.nodes.map(n => n.y), zs = s.nodes.map(n => n.z);
    const c = { y: Math.max(...ys) * 0.5, z: (Math.max(...zs) + Math.min(...zs)) * 0.5 };  // rough centroid of the half section
    const dy = ln.b.y - ln.a.y, dz = ln.b.z - ln.a.z;
    const cross = dy * (c.z - m.z) - dz * (c.y - m.y);
    return cross >= 0 ? 1 : -1;
  }
  // Default grade for a new strake: the Setup zone resolver at the panel's mid height.
  function defaultGrade(s, pl) {
    try { const m = M().pointAt(M().panelLine(pl, s.nodes), 0.5); const g = window.getZoneMaterialAt ? window.getZoneMaterialAt(m.z) : null; if (g && GRADES.includes(g)) return g; } catch (_) {}
    return 'AH36';
  }
  // Thickness colour ramp (mm → colour), shared by the drawing and the list.
  function tColor(t) {
    if (t == null || !(t > 0)) return '#f59e0b';
    const stops = [[8, '#22d3ee'], [12, '#22c55e'], [16, '#eab308'], [20, '#f97316'], [26, '#ef4444']];
    for (const [v, c] of stops) if (t <= v) return c;
    return '#dc2626';
  }
  const sumLen = pl => (pl.strakes || []).reduce((a, x) => a + (x.len || 0), 0);
  // In the CAD steps the drawing header (title + view pills) duplicates the step
  // nav, so it is hidden and the zoom bar moves up into the mode bar.
  function placeZoomBar(on) {
    const zb = document.querySelector('.zoom-bar-inline'); if (!zb) return;
    if (on) { const host = document.querySelector('.draw-bridge-bar:not(.form-bar) > div:first-child'); if (host && zb.parentElement !== host) { host.appendChild(zb); zb.classList.add('in-bridge'); } }
    else { const home = document.querySelector('.ea-panel-header'); if (home && zb.parentElement !== home) { home.appendChild(zb); zb.classList.remove('in-bridge'); } }
  }
  function show(on) {
    placeZoomBar(on);
    const tb = document.getElementById('cadToolbar'), ro = document.getElementById('cadReadout');
    if (tb) tb.style.display = (on && mode === 'section') ? '' : 'none';
    if (ro) ro.style.display = on ? '' : 'none';
    document.body.classList.toggle('cad-mode', !!on);
  }

  // ------------------------------------------------------------ mouse
  let moved = false, downAt = null;
  function onDown(e) { downAt = { x: e.clientX, y: e.clientY }; moved = false; }
  function onMove(e) {
    if (!active()) return;
    if (downAt && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 4) moved = true;
    const p = realFromEvent(e); if (!p) return;
    hover = snap(p, ((e.shiftKey || ortho) && pending.length) ? pending[0] : null);
    if (inComps()) { const t = e.target; hoverComp = t && t.getAttribute ? t.getAttribute('data-comp') : null; }
    if (inStiffs()) { const t = e.target; const sg = t && t.getAttribute ? t.getAttribute('data-sg') : null; const nh = sg ? { gid: t.getAttribute('data-gid'), sg } : null; if ((nh && nh.sg) !== (hoverSg && hoverSg.sg) || (nh && nh.gid) !== (hoverSg && hoverSg.gid)) hoverSg = nh; }
    renderSvg();
  }
  function onClick(e) {
    if (!active()) return;
    e.stopImmediatePropagation();          // keep the legacy pick logic out of this mode
    if (moved) { moved = false; return; }  // it was a pan
    const p = realFromEvent(e); if (!p) return;
    let hp = snap(p, ((e.shiftKey || ortho) && pending.length) ? pending[0] : null);
    const lbl = e.target && e.target.getAttribute && e.target.getAttribute('data-panel');
    if (lbl && hp.kind !== 'node') hp = { ...hp, kind: 'panel', panelId: lbl };
    const s = JSON.parse(JSON.stringify(S()));
    if (inPositions()) {
      sel = hp.kind === 'panel' ? { panel: hp.panelId, node: null } : { panel: null, node: null };
      renderSvg(); renderPanel(); scrollToRow(); return;
    }
    if (inComps()) {
      let cid = e.target && e.target.getAttribute && e.target.getAttribute('data-comp');
      if (!cid) { const under = document.elementFromPoint(e.clientX, e.clientY); cid = under && under.getAttribute ? under.getAttribute('data-comp') : null; }
      const pid = lbl || (hp.kind === 'panel' ? hp.panelId : null);
      if (compPick && selComp) {
        // two corners define the box (snapped to nodes / panels / grid)
        const c = CS().get(selComp); if (!c) { compPick = false; return; }
        if (!compPickA) { compPickA = { y: hp.y, z: hp.z }; renderSvg(); renderPanel(); return; }
        CS().update(selComp, { y0: Math.round(Math.min(compPickA.y, hp.y)), y1: Math.round(Math.max(compPickA.y, hp.y)), z0: Math.round(Math.min(compPickA.z, hp.z)), z1: Math.round(Math.max(compPickA.z, hp.z)) });
        compPick = false; compPickA = null; pushLegacy(s); renderSvg(); renderPanel(); return;
      }
      if (cid) selComp = cid; else if (pid) { const owner = compsHere(s).find(c => compPanels(s, c).includes(pid)); selComp = owner ? owner.id : selComp; }
      else selComp = null;
      renderSvg(); renderPanel();
      if (selComp) { const row = document.querySelector(`.pos-row[data-row="${selComp}"]`); if (row) row.scrollIntoView({ block: 'nearest' }); }
      return;
    }
    if (inStiffs() || inStrakes() || inSupports()) {
      // geometry first (a click near a tick / run / plate), the DOM target only as a fallback
      const pk = pickScantling(s, p);
      const pid = pk ? pk.panel : (lbl || (hp.kind === 'panel' ? hp.panelId : null));
      const q = pid ? s.panels.find(x => x.id === pid) : null;
      const st = SP() ? SP().state : null;
      if (q && st) { if (st.gid !== q.group) { st.gid = q.group; st.strake = null; st.group = null; st.exc = null; }
        if (inStrakes()) { if (pk && pk.strake != null) st.strake = pk.strake; else { let tgt = e.target; if (!(tgt && tgt.getAttribute && tgt.getAttribute('data-strake'))) { const under = document.elementFromPoint(e.clientX, e.clientY); if (under && under.getAttribute && under.getAttribute('data-strake')) tgt = under; } const si = tgt && tgt.getAttribute && tgt.getAttribute('data-strake'); st.strake = si != null ? parseInt(si) : null; } }
        if (inStiffs()) { if (pk && pk.group) st.group = pk.group; else { let tg = e.target; if (!(tg && tg.getAttribute && tg.getAttribute('data-sg'))) { const under = document.elementFromPoint(e.clientX, e.clientY); if (under && under.getAttribute && under.getAttribute('data-sg')) tg = under; } const sg = tg && tg.getAttribute && tg.getAttribute('data-sg'); st.group = sg || null; } } }
      sel = q ? { panel: q.id, node: null, group: q.group } : { panel: null, node: null, group: st ? st.gid : null };
      renderSvg(); renderPanel();
      if (st && st.strake != null) { const row = document.querySelector(`.mb-tr[data-st="${st.strake}"]`); if (row) row.scrollIntoView({ block: 'nearest' }); }
      if (st && inStiffs() && st.group) { const row = document.querySelector(`.mb-tr[data-sg="${st.group}"]`); if (row) row.scrollIntoView({ block: 'nearest' }); }
      return;
    }
    placePoint(hp, s);
  }
  // One tool action at a (snapped) point — from a click or from the typed command box.
  function placePoint(hp, s) {
    s = s || JSON.parse(JSON.stringify(S()));
    switch (tool) {
      case 'select': {
        const g = hp.kind === 'panel' ? (s.panels.find(q => q.id === hp.panelId) || {}).group : null;
        sel = hp.kind === 'node' ? { panel: null, node: hp.nodeId, group: null } : hp.kind === 'panel' ? { panel: hp.panelId, node: null, group: g } : { panel: null, node: null, group: null };
        renderSvg(); renderPanel(); scrollToSeg(); break; }
      case 'line':
        pending.push({ y: hp.y, z: hp.z });
        if (pending.length === 2) {
          if (Math.hypot(pending[1].y - pending[0].y, pending[1].z - pending[0].z) >= 10) M().addLine(s, pending[0], pending[1], { position: null, group: pendingGroup || undefined });
          pending = []; commit(s);
        } else ensureToolbar();
        break;
      case 'arc':
        if (hp.kind !== 'node') { toast('Arc: pick two existing nodes (add nodes first with Line / Node).'); break; }
        pending.push({ y: hp.y, z: hp.z });
        if (pending.length === 2) { arcAsk = { a: pending[0], b: pending[1] }; pending = []; renderPanel(); }
        else ensureToolbar();
        break;
      case 'split':
        if (hp.kind === 'panel') { M().splitPanel(s, hp.panelId, { y: hp.y, z: hp.z }); commit(s); }
        else toast('Node: click on a panel line.');
        break;
      case 'delete':
        if (hp.kind === 'node') { const r = M().removeNode(s, hp.nodeId); if (r.ok) { sel = { panel: null, node: null }; commit(s); } else toast('Node: ' + r.why); }
        else if (hp.kind === 'panel') { M().removePanel(s, hp.panelId); if (sel.panel === hp.panelId) sel.panel = null; commit(s); }
        break;
    }
  }
  // Typed input (AutoCAD style): "y,z" absolute · "@dy,dz" relative to the last
  // point · "d" a distance along the rubber band (or the ortho axis) from it.
  function typedPoint(txt) {
    txt = (txt || '').trim().replace(/\s+/g, ''); if (!txt) return null;
    const last = pending.length ? pending[0] : null;
    let pt = null;
    if (txt.startsWith('@')) { const m = txt.slice(1).split(/[,;]/).map(Number); if (m.length === 2 && m.every(isFinite) && last) pt = { y: last.y + m[0], z: last.z + m[1] }; }
    else if (/[,;]/.test(txt)) { const m = txt.split(/[,;]/).map(Number); if (m.length === 2 && m.every(isFinite)) pt = { y: m[0], z: m[1] }; }
    else { const d = Number(txt); if (isFinite(d) && last) {
      let dir = null;
      if (hover && (hover.y !== last.y || hover.z !== last.z)) { let dy = hover.y - last.y, dz = hover.z - last.z; if (ortho) { if (Math.abs(dy) > Math.abs(dz)) dz = 0; else dy = 0; } const n = Math.hypot(dy, dz) || 1; dir = { y: dy / n, z: dz / n }; }
      if (!dir) dir = { y: 1, z: 0 };
      pt = { y: last.y + dir.y * d, z: last.z + dir.z * d };
    } }
    if (!pt) return null;
    // snap to an existing node if one is within 5 mm, otherwise keep the exact typed value
    const sN = S(); const n = sN.nodes.find(q => Math.hypot(q.y - pt.y, q.z - pt.z) <= 5);
    return n ? { y: n.y, z: n.z, kind: 'node', nodeId: n.id } : { y: Math.round(pt.y), z: Math.round(pt.z), kind: 'free' };
  }
  function onKey(e) {
    if (!active()) return;
    if (e.key === 'F8' && mode === 'section') { ortho = !ortho; ensureToolbar(); renderSvg(); e.preventDefault(); return; }
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;
    const k = e.key.toLowerCase();
    if (e.key === 'Escape') { pending = []; arcAsk = null; if (compPick) { compPick = false; compPickA = null; renderSvg(); renderPanel(); return; } setTool('select'); return; }
    if (mode !== 'section') return;
    const t = TOOLS.find(x => x.k.toLowerCase() === k); if (t) { setTool(t.key); e.preventDefault(); return; }
    if ((e.key === 'Delete' || e.key === 'Backspace') && sel.panel) { const s = JSON.parse(JSON.stringify(S())); M().removePanel(s, sel.panel); sel.panel = null; commit(s); }
    else if ((e.key === 'Delete' || e.key === 'Backspace') && sel.node) { const s = JSON.parse(JSON.stringify(S())); const r = M().removeNode(s, sel.node); if (r.ok) { sel.node = null; commit(s); } else toast('Node: ' + r.why); }
  }
  function toast(msg) { if (typeof window.eaToast === 'function') window.eaToast(msg); else console.log('[CAD]', msg); }

  // ------------------------------------------------------------ right panel
  // Shell height at a given y (bottom, or on the bilge arc) — for girders that
  // always run from the shell up to the tank top.
  function shellZAt(y) {
    const g = G(); const R = g.R_B || 0, B_ = g.B_half;
    if (y <= B_ - R) return 0;
    const dy = y - (B_ - R); return R - Math.sqrt(Math.max(0, R * R - dy * dy));
  }
  function shellYAt(z) {
    const g = G(); const R = g.R_B || 0, B_ = g.B_half;
    if (z >= R) return B_;
    return (B_ - R) + Math.sqrt(Math.max(0, R * R - (R - z) * (R - z)));
  }
  const ADD_TYPES = {
    girder:  { label: 'Girder',         fields: [['y', 'Y from CL', 'mm']],                                   make: (v, ex) => ({ a: { y: v.y, z: shellZAt(v.y) }, b: { y: v.y, z: ex.IB }, position: v.y <= 1 ? 'centreGirder' : 'sideGirder' }) },
    tankTop: { label: 'Tank top',       fields: [['z', 'Z above BL', 'mm']],                                  make: v => ({ a: { y: 0, z: v.z }, b: { y: shellYAt(v.z), z: v.z }, position: 'innerBottom' }) },
    deck:    { label: 'Deck',           fields: [['z', 'Z above BL', 'mm'], ['y1', 'From Y', 'mm'], ['y2', 'To Y', 'mm']], make: v => ({ a: { y: v.y1, z: v.z }, b: { y: v.y2, z: v.z }, position: 'deck' }) },
    longBhd: { label: 'Long. bulkhead', fields: [['y', 'Y from CL', 'mm'], ['z1', 'From Z', 'mm'], ['z2', 'To Z', 'mm']],  make: v => ({ a: { y: v.y, z: v.z1 }, b: { y: v.y, z: v.z2 }, position: 'longBhd' }) },
  };
  function addDefaults(type) {
    const ex = extents(); const g = G();
    switch (type) {
      case 'girder':  return { y: Math.round((g.duct_half + ex.IS) / 2 / 50) * 50 };
      case 'tankTop': return { z: ex.IB || 1800 };
      case 'deck':    return { z: Math.round((ex.IB + ex.UD) / 2 / 50) * 50, y1: ex.IS, y2: ex.yMax };
      case 'longBhd': return { y: Math.round(ex.IS / 2 / 50) * 50, z1: ex.IB, z2: ex.UD };
    }
    return {};
  }

  let panelDirty = false;
  function renderPanel() {
    const ec = document.getElementById('edContent'); if (!ec || !active()) return;
    // A rebuild would steal the caret: defer until the field blurs.
    const ae = document.activeElement;
    if (ae && ec.contains(ae) && (ae.tagName === 'INPUT' || ae.tagName === 'SELECT')) {
      if (!panelDirty) { panelDirty = true; ae.addEventListener('blur', () => { panelDirty = false; renderPanel(); }, { once: true }); }
      return;
    }
    const s = S(); if (!s) return;
    renderMsgPane();
    if (inPositions()) { renderPositionsPanel(ec, s); return; }
    if (SP()) { M().migratePanelData(s);
      if (inStrakes()) { SP().renderStrakes(ec, s, panelsCtx()); return; }
      if (inStiffs()) { SP().renderStiffs(ec, s, panelsCtx()); return; }
      if (inSupports()) { SP().renderSupports(ec, s, panelsCtx()); return; } }
    if (inComps()) { renderCompsPanel(ec, s); return; }
    const g = G(); const meta = B().GEOMETRY_META().filter(m => m.key !== 'TT' && m.key !== 'duct_half');
    const issues = M().validate(s).filter(i => i.level !== 'info');
    const shipType = (document.getElementById('shipType') || {}).value || 'general_cargo';
    if (s.isMidship == null) s.isMidship = true;
    const parametric = shipType === 'general_cargo' && s.isMidship !== false;
    let h = '';

    // Section identity: frame + midship flag. The parametric Ship Geometry only
    // describes a general-cargo midship; elsewhere the section is drawn.
    h += `<div class="ed-group"><div class="ed-group-header"><span style="color:#f59e0b">Section</span></div>
      <div class="ed-row"><span class="ed-id" style="min-width:96px">Frame</span><input class="ed-input cad-sec" data-k="frame" type="text" value="${s.frame != null ? s.frame : ''}" placeholder="e.g. 70" style="width:72px"><span class="ed-label" style="color:#475569;margin-left:4px">Fr.</span></div>
      <div class="ed-row"><span class="ed-id" style="min-width:96px">Midship</span><span class="cad-seg"><button class="${s.isMidship !== false ? 'on' : ''}" data-cad="mid-on">Midship</button><button class="${s.isMidship === false ? 'on' : ''}" data-cad="mid-off">Other</button></span></div>
    </div>`;

    // Status / regenerate
    h += `<div class="cad-status ${s.manual ? 'manual' : ''}" style="flex-wrap:wrap">
      <span>${s.nodes.length} nodes · ${s.panels.length} panels${s.manual ? ' · hand-edited' : ''}</span>
      ${s.manual && parametric ? (regenAsk
        ? `<span class="cad-inline"><span>Discard hand edits?</span><button class="ed-link-btn on" data-cad="regen-go">Regenerate</button><button class="ed-link-btn" data-cad="regen-cancel">Cancel</button></span>`
        : `<button class="ed-link-btn" data-cad="regen-ask" title="Rebuild the section from the Ship Geometry parameters (hand edits are lost)">⟲ Reset to parameters</button>`) : ''}
    </div>`;

    // Ship geometry (general-cargo midship only)
    if (parametric) {
    h += `<div class="ed-group" data-cad-group="geom"><div class="ed-group-header"><span style="color:#f59e0b">Ship Geometry</span>${s.manual ? '<span class="ed-count" title="The section is hand-edited; parameters only apply after Regenerate">locked</span>' : ''}</div>`;
    meta.forEach(m => {
      const v = g[m.key];
      h += `<div class="ed-row"><span class="ed-id" style="min-width:150px;font-size:0.68rem;white-space:nowrap">${m.label}</span>
        <input class="ed-input cad-geom" type="number" value="${v == null ? '' : v}" data-key="${m.key}" min="${m.min}" max="${m.max}" step="${m.step}" ${s.manual ? 'disabled' : ''}>
        <span class="ed-label" style="color:#475569;font-size:0.65rem">mm</span></div>`;
    });
    h += `<div class="ed-row"><span class="ed-id" style="min-width:150px;font-size:0.68rem;white-space:nowrap" title="Hatch coaming top plate width (0 = no coaming)">Coaming top width</span>
        <input class="ed-input cad-param" type="number" value="${B().PARAMS().coamingTop || 0}" data-key="coamingTop" min="0" max="2000" step="50" ${s.manual ? 'disabled' : ''}>
        <span class="ed-label" style="color:#475569;font-size:0.65rem">mm</span></div>`;
    // Centre girder or duct keel (with its half-width)
    const duct = g.duct_half > 0;
    h += `<div class="ed-row"><span class="ed-id" style="min-width:150px;font-size:0.68rem;white-space:nowrap">Centre structure</span>
        <select class="ed-input cad-centre" style="flex:1" ${s.manual ? 'disabled' : ''}><option value="cg" ${duct ? '' : 'selected'}>Centre girder</option><option value="duct" ${duct ? 'selected' : ''}>Duct keel</option></select></div>`;
    if (duct) h += `<div class="ed-row"><span class="ed-id" style="min-width:150px;font-size:0.68rem;white-space:nowrap">Duct keel half-width</span>
        <input class="ed-input cad-geom" type="number" value="${g.duct_half}" data-key="duct_half" min="200" max="3000" step="50" ${s.manual ? 'disabled' : ''}><span class="ed-label" style="color:#475569;font-size:0.65rem">mm</span></div>`;
    h += `</div>`;
    }

    // Add panel
    h += `<div class="ed-group"><div class="ed-group-header"><span style="color:#22c55e">Add panel</span></div><div class="cad-add-btns">`;
    Object.keys(ADD_TYPES).forEach(k => { h += `<button class="ed-add-btn ${addForm === k ? 'on' : ''}" data-cad-add="${k}">+ ${ADD_TYPES[k].label}</button>`; });
    h += `</div>`;
    if (addForm && ADD_TYPES[addForm]) {
      const d = addDefaults(addForm);
      h += `<div class="cad-form" data-cad-form="${addForm}">`;
      ADD_TYPES[addForm].fields.forEach(([k, label, unit]) => {
        h += `<div class="ed-row"><span class="ed-id" style="min-width:150px;font-size:0.68rem;white-space:nowrap">${label}</span><input class="ed-input" type="number" data-f="${k}" value="${d[k] != null ? d[k] : ''}" step="10"><span class="ed-label" style="color:#475569;font-size:0.65rem">${unit}</span></div>`;
      });
      h += `<div class="ed-row" style="justify-content:flex-end;gap:6px"><button class="ed-link-btn on" data-cad="add-go">Add</button><button class="ed-link-btn" data-cad="add-cancel">Cancel</button></div></div>`;
    }
    h += `</div>`;

    // ── Panels ─────────────────────────────────────────────────────────────
    // MARS layout: a Panels block (toolbar · name · bending / shear efficiency) and a
    // Segments block (toolbar · node table) with the selected node / segment editor.
    {
      const gids = Object.keys(s.groups || {});
      if (!sel.group && sel.panel) { const q = s.panels.find(x => x.id === sel.panel); if (q) sel.group = q.group; }
      if (!sel.group && gids.length) sel.group = gids[0];
      const gi = Math.max(0, gids.indexOf(sel.group)); const gid = gids[gi];
      const segs = gid ? orderedSegments(s, gid) : [];
      const Ltot = segs.reduce((a_, q) => a_ + M().panelLength(q, s.nodes), 0);
      const effB = segs.length ? segs[0].effB : 100, effS = segs.length ? segs[0].effS : 100;
      const mixed = segs.some(q => q.effB !== effB || q.effS !== effS);
      h += `<div class="mb"><div class="mb-title">Panels <span class="ed-count">${gi + 1} / ${gids.length}</span></div>
        <div class="mb-tools">
          <button data-mb="pnl-add" title="New panel — the next lines you draw belong to it">＋</button>
          <button data-mb="pnl-del" title="Delete this panel with all its segments" ${gid ? '' : 'disabled'}>✕</button>
          <span class="mb-sep"></span>
          <button data-mb="pnl-prev" title="Previous panel" ${gi > 0 ? '' : 'disabled'}>‹</button>
          <button data-mb="pnl-next" title="Next panel" ${gi < gids.length - 1 ? '' : 'disabled'}>›</button>
          <select class="ed-input mb-pick" title="Pick a panel">${gids.map(id => `<option value="${id}" ${id === gid ? 'selected' : ''}>${gName(s, id)}</option>`).join('')}</select>
        </div>
        <div class="mb-row"><span>Name</span><input class="ed-input mb-name" type="text" value="${gid ? gName(s, gid) : ''}" ${gid ? '' : 'disabled'}></div>
        <div class="mb-row"><span title="Share of this panel's area in the hull girder section modulus">Bending eff.</span><span class="pc-inline"><input class="ed-input mb-eff" data-k="effB" type="number" min="0" max="100" step="5" value="${effB}" ${gid ? '' : 'disabled'}><em>%${mixed ? ' · mixed' : ''}</em></span></div>
        <div class="mb-row"><span title="Share of this panel's thickness carrying hull girder shear">Shear eff.</span><span class="pc-inline"><input class="ed-input mb-eff" data-k="effS" type="number" min="0" max="100" step="5" value="${effS}" ${gid ? '' : 'disabled'}><em>%</em></span></div>
        <div class="mb-row"><span>Length</span><span>${fmt(Ltot)} mm · ${segs.length} segment${segs.length === 1 ? '' : 's'}</span></div>
      </div>`;

      // Segments: node rows (first node, then each segment ending at a node)
      const chainNodes = []; if (segs.length) { let at = (segs[0].from === (segs[1] ? (segs[1].from === segs[0].to || segs[1].to === segs[0].to ? segs[0].from : segs[0].to) : segs[0].from)) ? segs[0].from : segs[0].from; chainNodes.push(at); segs.forEach(q => { at = q.from === at ? q.to : q.from; chainNodes.push(at); }); }
      h += `<div class="mb"><div class="mb-title">Segments <span class="ed-count">${segs.length}</span></div>
        <div class="mb-tools">
          <button data-mb="seg-add" title="Insert a node in the middle of the selected segment" ${sel.panel ? '' : 'disabled'}>＋</button>
          <button data-mb="seg-del" title="Delete the selected node (free end: its segment · between collinear segments: merge) or segment" ${sel.panel || sel.node ? '' : 'disabled'}>✕</button>
          <span class="mb-sep"></span>
          <button data-mb="seg-prev" title="Previous segment" ${sel.panel ? '' : 'disabled'}>‹</button>
          <button data-mb="seg-next" title="Next segment" ${sel.panel ? '' : 'disabled'}>›</button>
        </div>
        <div class="mb-table"><div class="mb-th"><span>Node</span><span>Y</span><span>Z</span><span>Position</span><span title="Watertight">WT</span></div>`;
      chainNodes.forEach((nid, i) => {
        const n = nodeById(s, nid); const q = i > 0 ? segs[i - 1] : null;
        const isSel = q ? q.id === sel.panel : (sel.node === nid && !sel.panel);
        h += `<div class="mb-tr ${isSel ? 'is-sel' : ''}" data-mb-node="${nid}" ${q ? `data-mb-seg="${q.id}"` : ''}>
          <span>${nid}</span><span>${n ? n.y : ''}</span><span>${n ? n.z : ''}</span>
          <span>${q ? `<button class="mb-pos-inline" data-seg="${q.id}" style="color:${q.position ? (POS_COLOR[q.position] || '#94a3b8') : '#f59e0b'}" title="${q.position ? posLabel(q.position) : 'Undefined — click to set'}">${q.position ? shortPos(q.position) : '—'} <i>▾</i></button>` : ''}</span>
          <span>${q ? `<input type="checkbox" class="mb-wt" data-seg="${q.id}" ${q.wt ? 'checked' : ''} title="Watertight">` : ''}</span></div>`;
      });
      h += `</div>`;

      // Selected segment / node editor
      const q = sel.panel ? s.panels.find(x => x.id === sel.panel) : null;
      const nd = sel.node ? nodeById(s, sel.node) : (q ? nodeById(s, q.to) : null);
      if (q || nd) {
        const posOpts = `<option value="">Undefined</option>` + M().POSITIONS.map(o => `<option value="${o.code}" ${q && q.position === o.code ? 'selected' : ''}>${o.label}</option>`).join('');
        h += `<div class="mb-editor">`;
        if (nd) h += `<div class="mb-row4"><span>Node</span><span>Y (mm)</span><span>Z (mm)</span><span></span>
            <span class="mb-chip">${nd.id}</span><input class="ed-input cad-node" data-node="${nd.id}" data-k="y" type="number" step="10" value="${nd.y}"><input class="ed-input cad-node" data-node="${nd.id}" data-k="z" type="number" step="10" value="${nd.z}"><span></span></div>`;
        if (q) {
          const L = M().panelLength(q, s.nodes);
          h += `<div class="mb-row"><span>From node</span><span class="pc-inline"><span class="mb-chip">${q.from}</span><em>to node</em><span class="mb-chip">${q.to}</span><em>· ${fmt(L)} mm</em></span></div>
            <div class="mb-row"><span>Curve type</span><span class="cad-seg"><button class="${q.curve ? '' : 'on'}" data-mb="curve-line" title="Straight">╱ line</button><button class="${q.curve ? 'on' : ''}" data-mb="curve-arc" title="Arc through both nodes">◝ arc</button></span></div>
            ${q.curve ? `<div class="mb-row"><span>Radius</span><span class="pc-inline"><input class="ed-input mb-radius" type="number" step="50" min="${Math.ceil(Math.hypot(nodeById(s, q.to).y - nodeById(s, q.from).y, nodeById(s, q.to).z - nodeById(s, q.from).z) / 2)}" value="${fmt(q.curve.r)}"><em>mm</em></span></div>` : ''}
            <div class="mb-row"><span>Panel</span><select class="ed-input cad-group">${gids.map(id => `<option value="${id}" ${q.group === id ? 'selected' : ''}>${gName(s, id)}</option>`).join('')}<option value="__new">+ new panel…</option></select></div>
            <div class="mb-row" data-cad-newgroup hidden><span>Name</span><span class="pc-inline"><input class="ed-input" id="cadNewGroup" type="text" placeholder="e.g. Hopper"><button class="ed-link-btn on" data-cad="group-new">Create</button></span></div>`;
        }
        h += `</div>`;
      }
    }

    // Arc radius prompt
    if (arcAsk) {
      const d = Math.hypot(arcAsk.b.y - arcAsk.a.y, arcAsk.b.z - arcAsk.a.z);
      h += `<div class="ed-group cad-form"><div class="ed-group-header"><span style="color:#f59e0b">Arc radius</span></div>
        <div class="ed-row"><span class="ed-id" style="min-width:150px;font-size:0.68rem">Chord ${fmt(d)} mm · R ≥ ${fmt(d / 2)}</span></div>
        <div class="ed-row"><span class="ed-id" style="min-width:150px;font-size:0.68rem">Radius</span><input class="ed-input" type="number" id="cadArcR" value="${fmt(d / Math.SQRT2)}" step="50"><span class="ed-label" style="color:#475569;font-size:0.65rem">mm</span></div>
        <div class="ed-row" style="justify-content:flex-end;gap:6px"><button class="ed-link-btn on" data-cad="arc-go">Add arc</button><button class="ed-link-btn" data-cad="arc-cancel">Cancel</button></div></div>`;
    }

    // Issues (only when there are any)
    if (issues.length) {
      h += `<div class="ed-group"><div class="ed-group-header"><span style="color:${issues.some(i => i.level === 'error') ? 'var(--error)' : 'var(--warning)'}">Issues <span class="ed-count">(${issues.length})</span></span></div>`;
      issues.slice(0, 12).forEach(i => { h += `<div class="ed-row" style="color:${i.level === 'error' ? 'var(--error)' : 'var(--warning)'};cursor:pointer" ${i.panel ? `data-cad-goto="${i.panel}"` : ''}>${i.text}</div>`; });
      h += `</div>`;
    }

    ec.innerHTML = h;
    bindPanel(ec);
  }

  function bindPanel(ec) {
    ec.querySelectorAll('.cad-group').forEach(el => el.addEventListener('change', e => {
      if (e.target.value === '__new') { const r = ec.querySelector('[data-cad-newgroup]'); if (r) { r.hidden = false; const i = r.querySelector('input'); i && i.focus(); } return; }
      const m = JSON.parse(JSON.stringify(S())); M().setGroup(m, [sel.panel], e.target.value); commit(m);
    }));
    ec.querySelectorAll('.cad-gname').forEach(el => el.addEventListener('change', e => { const m = JSON.parse(JSON.stringify(S())); M().renameGroup(m, e.target.dataset.gid, e.target.value.trim()); commit(m); }));
    // MARS-style blocks
    const gidsNow = Object.keys(S().groups || {});
    const pick = ec.querySelector('.mb-pick'); if (pick) pick.addEventListener('change', e => { sel = { panel: null, node: null, group: e.target.value }; renderSvg(); renderPanel(); });
    const nameI = ec.querySelector('.mb-name'); if (nameI) nameI.addEventListener('change', e => { const m = JSON.parse(JSON.stringify(S())); M().renameGroup(m, sel.group, e.target.value.trim()); commit(m); });
    ec.querySelectorAll('.mb-eff').forEach(i => i.addEventListener('change', e => { const m = JSON.parse(JSON.stringify(S())); const v = Math.max(0, Math.min(100, parseFloat(e.target.value) || 0)); m.panels.forEach(q => { if (q.group === sel.group) q[e.target.dataset.k] = v; }); commit(m); }));
    ec.querySelectorAll('.mb-tr').forEach(tr => tr.addEventListener('click', e => {
      if (e.target.tagName === 'INPUT') return;
      const seg = tr.dataset.mbSeg, nid = tr.dataset.mbNode;
      if ((seg && sel.panel === seg) || (!seg && sel.node === nid)) sel = { panel: null, node: null, group: sel.group };   // click again → deselect
      else sel = seg ? { panel: seg, node: null, group: sel.group } : { panel: null, node: nid, group: sel.group };
      renderSvg(); renderPanel();
    }));
    ec.querySelectorAll('.mb-wt').forEach(cb => cb.addEventListener('change', e => { const m = JSON.parse(JSON.stringify(S())); const q = m.panels.find(x => x.id === e.target.dataset.seg); if (q) { q.wt = e.target.checked; commit(m); } }));
    ec.querySelectorAll('.mb-pos-inline').forEach(el => el.addEventListener('click', e => {
      e.stopPropagation();
      const segId = el.dataset.seg; const q0 = S().panels.find(x => x.id === segId);
      const items = [{ value: '', label: 'Undefined', color: '#f59e0b' }].concat(M().POSITIONS.map(o => ({ value: o.code, label: o.label, short: shortPos(o.code), color: POS_COLOR[o.code] || '#94a3b8' })));
      popupMenu(el, items, q0 ? q0.position : null, v => { const m = JSON.parse(JSON.stringify(S())); const q = m.panels.find(x => x.id === segId); if (q) { q.position = v || null; const def = M().POS[q.position]; if (def) q.wt = def.wt; commit(m); } });
    }));
    const radI = ec.querySelector('.mb-radius'); if (radI) radI.addEventListener('change', e => { const m = JSON.parse(JSON.stringify(S())); const r = parseFloat(e.target.value); const q = m.panels.find(x => x.id === sel.panel); if (!q) return; const ok = M().setCurve(m, q.id, r); if (!ok) { toast('Radius must be at least half the chord.'); return; } const nq = m.panels.find(x => x.from === q.from && x.to === q.to) || m.panels.find(x => x.curve && Math.abs(x.curve.r - r) < 1); sel.panel = nq ? nq.id : null; commit(m); });
    ec.querySelectorAll('[data-mb]').forEach(b => b.addEventListener('click', () => {
      const act = b.dataset.mb; const m = JSON.parse(JSON.stringify(S())); const gids2 = Object.keys(m.groups || {}); const gi = gids2.indexOf(sel.group);
      switch (act) {
        case 'pnl-prev': if (gi > 0) { sel = { panel: null, node: null, group: gids2[gi - 1] }; renderSvg(); renderPanel(); } return;
        case 'pnl-next': if (gi < gids2.length - 1) { sel = { panel: null, node: null, group: gids2[gi + 1] }; renderSvg(); renderPanel(); } return;
        case 'pnl-add': { let k = gids2.length; let id; do { k++; id = 'G' + k; } while (m.groups[id]); m.groups[id] = 'Panel ' + k; m.manual = true; B().setSection(m); pendingGroup = id; sel = { panel: null, node: null, group: id }; setTool('line'); renderPanel(); toast('New panel: draw its lines (Line tool).'); return; }
        case 'pnl-del': { if (!sel.group) return; const ids = m.panels.filter(q => q.group === sel.group).map(q => q.id); let lines = M().panelLine ? null : null; ids.forEach(id => M().removePanel(m, id)); delete m.groups[sel.group]; sel = { panel: null, node: null, group: null }; commit(m); return; }
        case 'seg-add': { const q = m.panels.find(x => x.id === sel.panel); if (q) { M().splitPanel(m, q.id, 0.5); commit(m); } return; }
        case 'seg-del': { if (sel.node && !sel.panel) { const r = M().removeNode(m, sel.node); if (r.ok) { sel.node = null; commit(m); } else toast('Node: ' + r.why); } else if (sel.panel) { M().removePanel(m, sel.panel); sel.panel = null; commit(m); } return; }
        case 'seg-prev': case 'seg-next': { const segs = orderedSegments(m, sel.group); const i = segs.findIndex(x => x.id === sel.panel); const j = act === 'seg-prev' ? i - 1 : i + 1; if (segs[j]) { sel.panel = segs[j].id; sel.node = null; renderSvg(); renderPanel(); } return; }
        case 'curve-line': { const q = m.panels.find(x => x.id === sel.panel); if (q && q.curve) { M().setCurve(m, q.id, null); const nq = m.panels.find(x => x.from === q.from && x.to === q.to); sel.panel = nq ? nq.id : null; commit(m); } return; }
        case 'curve-arc': { const q = m.panels.find(x => x.id === sel.panel); if (q && !q.curve) { const a = m.nodes.find(n => n.id === q.from), b2 = m.nodes.find(n => n.id === q.to); const d = Math.hypot(b2.y - a.y, b2.z - a.z); if (!M().setCurve(m, q.id, Math.round(d / Math.SQRT2))) return; const nq = m.panels.find(x => x.curve && x.from === q.from && x.to === q.to) || m.panels.find(x => x.curve && (x.from === q.from || x.to === q.to)); sel.panel = nq ? nq.id : null; commit(m); } return; }
      }
    }));
    ec.querySelectorAll('.cad-sec').forEach(inp => inp.addEventListener('change', e => { const m = JSON.parse(JSON.stringify(S())); m[e.target.dataset.k] = e.target.value; B().setSection(m); renderPanel(); }));
    ec.querySelectorAll('.cad-centre').forEach(sel_ => sel_.addEventListener('change', e => {
      const g = G(); g.duct_half = e.target.value === 'duct' ? (g.duct_half > 0 ? g.duct_half : 900) : 0;
      B().syncSectionModel(true); B().render(); renderPanel();
    }));
    ec.querySelectorAll('.cad-geom').forEach(inp => inp.addEventListener('change', e => {
      const v = parseFloat(e.target.value); if (isNaN(v)) return;
      G()[e.target.dataset.key] = v;
      B().syncSectionModel(true); B().render(); B().fitView(); renderPanel();
    }));
    ec.querySelectorAll('.cad-param').forEach(inp => inp.addEventListener('change', e => {
      const v = parseFloat(e.target.value); if (isNaN(v)) return;
      B().PARAMS()[e.target.dataset.key] = v;
      B().syncSectionModel(true); B().render(); renderPanel();
    }));
    ec.querySelectorAll('.cad-eff').forEach(inp => inp.addEventListener('change', e => {
      const s = JSON.parse(JSON.stringify(S())); const pl = s.panels.find(p => p.id === sel.panel); if (!pl) return;
      pl[e.target.dataset.k] = Math.max(0, Math.min(100, parseFloat(e.target.value) || 0)); commit(s);
    }));
    ec.querySelectorAll('.cad-node').forEach(inp => inp.addEventListener('change', e => {
      const s = JSON.parse(JSON.stringify(S())); const n = nodeById(s, e.target.dataset.node || sel.node); if (!n) return;
      const v = parseFloat(e.target.value); if (isNaN(v)) return;
      const y = e.target.dataset.k === 'y' ? v : n.y, z = e.target.dataset.k === 'z' ? v : n.z;
      M().moveNode(s, n.id, y, z);
      const moved = s.nodes.find(q => Math.abs(q.y - y) <= 1 && Math.abs(q.z - z) <= 1);
      if (!sel.panel) sel.node = moved ? moved.id : null; else sel.panel = null;
      commit(s);
    }));
    ec.querySelectorAll('[data-cad-add]').forEach(b => b.addEventListener('click', () => { addForm = addForm === b.dataset.cadAdd ? null : b.dataset.cadAdd; renderPanel(); }));
    ec.querySelectorAll('[data-cad-goto]').forEach(r => r.addEventListener('click', () => { sel = { panel: r.dataset.cadGoto, node: null }; renderSvg(); renderPanel(); }));
    ec.querySelectorAll('[data-cad]').forEach(b => b.addEventListener('click', () => {
      const act = b.dataset.cad; const s = JSON.parse(JSON.stringify(S()));
      const pl = s.panels.find(p => p.id === sel.panel);
      switch (act) {
        case 'group-new': { const name = ((document.getElementById('cadNewGroup') || {}).value || '').trim(); if (!name) { toast('Give the panel a name.'); return; } const m = JSON.parse(JSON.stringify(S())); M().setGroup(m, [sel.panel], name); commit(m); break; }
        case 'mid-on': { const m = JSON.parse(JSON.stringify(S())); m.isMidship = true; B().setSection(m); renderPanel(); break; }
        case 'mid-off': { const m = JSON.parse(JSON.stringify(S())); m.isMidship = false; B().setSection(m); renderPanel(); break; }
        case 'regen-ask': regenAsk = true; renderPanel(); break;
        case 'regen-cancel': regenAsk = false; renderPanel(); break;
        case 'regen-go': regenAsk = false; sel = { panel: null, node: null }; B().syncSectionModel(true); B().render(); B().fitView(); renderPanel(); break;
        case 'add-cancel': addForm = null; renderPanel(); break;
        case 'add-go': {
          const form = ec.querySelector('[data-cad-form]'); const v = {};
          form.querySelectorAll('[data-f]').forEach(i => { v[i.dataset.f] = parseFloat(i.value); });
          if (Object.values(v).some(x => isNaN(x))) { toast('Fill in every field.'); return; }
          const spec = ADD_TYPES[addForm].make(v, extents());
          if (Math.hypot(spec.b.y - spec.a.y, spec.b.z - spec.a.z) < 10) { toast('Zero-length panel.'); return; }
          M().addLine(s, spec.a, spec.b, { position: spec.position, tag: null });
          addForm = null; commit(s); break;
        }
        case 'arc-go': {
          const r = parseFloat((document.getElementById('cadArcR') || {}).value);
          const d = Math.hypot(arcAsk.b.y - arcAsk.a.y, arcAsk.b.z - arcAsk.a.z);
          if (isNaN(r) || r < d / 2) { toast('Radius must be at least half the chord.'); return; }
          M().addArc(s, arcAsk.a, arcAsk.b, r, { position: 'bilge' }); arcAsk = null; commit(s); break;
        }
        case 'arc-cancel': arcAsk = null; renderPanel(); break;
        case 'del-panel': if (pl) { M().removePanel(s, pl.id); sel.panel = null; commit(s); } break;
        case 'del-node': if (sel.node) { const r = M().removeNode(s, sel.node); if (r.ok) { sel.node = null; commit(s); } else toast('Node: ' + r.why); } break;
        case 'wt-on': if (pl) { pl.wt = true; commit(s); } break;
        case 'wt-off': if (pl) { pl.wt = false; commit(s); } break;
        case 'split-at': {
          if (!pl) break;
          const at = parseFloat((document.getElementById('cadSplitAt') || {}).value); const L = M().panelLength(pl, s.nodes);
          if (isNaN(at) || at <= 0 || at >= L) { toast('Distance must be inside the panel.'); return; }
          M().splitPanel(s, pl.id, at / L); commit(s); break;
        }
      }
    }));
  }

  // ------------------------------------------------------------ compartments panel (step 6)
  function renderCompsPanel(ec, s) {
    const all = CS() ? CS().list() : []; const here = compsHere(s); const fr = CS() ? CS().frameOf(s) : null;
    let h = `<div class="cad-status">
      <span style="white-space:normal">${here.length} compartment${here.length === 1 ? '' : 's'} at this section${fr == null ? ' · <b style="color:var(--warning)">no frame — every compartment applies</b>' : ''}${all.length > here.length ? ' · ' + (all.length - here.length) + ' elsewhere' : ''}</span>
      <span class="cad-inline"><button class="ed-link-btn on" data-cp="add">+ compartment</button></span>
    </div>`;
    const c = selComp ? all.find(x => x.id === selComp) : null;
    if (c) {
      const T = compType(c.type); const col = compColor(s, c.id); const pls = compPanels(s, c);
      const opt = (k, v, list, labels) => `<select class="ed-input cp-f" data-k="${k}" style="flex:1">${list.map((x, i) => `<option value="${x}" ${x === v ? 'selected' : ''}>${labels ? labels[i] : x}</option>`).join('')}</select>`;
      const num = (k, v, step, w, ph) => `<input class="ed-input cp-f" data-k="${k}" type="number" step="${step}" value="${v == null ? '' : v}" placeholder="${ph || ''}" style="width:${w || 74}px">`;
      const R = (label, inner, tip) => `<div class="mb-row" title="${tip || ''}"><span>${label}</span><span class="pc-inline">${inner}</span></div>`;
      const inHere = here.some(x => x.id === c.id);
      h += `<div class="mb" style="border-left:3px solid ${col}"><div class="mb-title"><span style="color:${col}">${c.name || c.id}</span><em class="mb-em">${CS().hasSize(c) ? ((c.y1 - c.y0) * (c.z1 - c.z0) / 1e6).toFixed(1) + ' m² (half)' : 'no size'}${inHere ? '' : ' · not at this frame'}</em><button class="mb-x" data-cp="del" title="Delete">✕</button></div>
        ${R('Name', `<input class="ed-input cp-f" data-k="name" value="${c.name || ''}" style="flex:1">`)}
        ${R('Type', opt('type', c.type, COMP_TYPES.map(t => t.code), COMP_TYPES.map(t => t.label)))}
        ${R('Frames', num('frFrom', c.frFrom, 1, 58, 'aft') + '<em>→</em>' + num('frTo', c.frTo, 1, 58, 'fwd') + '<em>blank = whole length</em>', 'Frame range the compartment spans; blank ends run to the ship\u2019s ends')}
        ${R('Y', num('y0', c.y0, 10, 66) + '<em>→</em>' + num('y1', c.y1, 10, 66) + '<em>mm from CL</em>', 'Transverse extent on the half section')}
        ${R('Z', num('z0', c.z0, 10, 66) + '<em>→</em>' + num('z1', c.z1, 10, 66) + '<em>mm AB</em>', 'Vertical extent above baseline')}
        <div class="mb-row"><span>Box</span><span class="pc-inline mb-wrap"><button class="ed-link-btn ${compPick ? 'on' : ''}" data-cp="pick" title="Click two opposite corners on the drawing (snaps to nodes)">${compPick ? (compPickA ? 'second corner…' : 'first corner…') : 'Pick corners'}</button><span style="color:var(--text-muted)">${pls.length} panel${pls.length === 1 ? '' : 's'} on the boundary</span></span></div>
        ${T.rho || T.tank ? R('Density ρ', num('rho', c.rho, 0.005, 62) + '<em>t/m³</em>', 'Contents density') : ''}
        ${T.tank ? R('Air pipe top', num('airpipe_mm', c.airpipe_mm, 10, 62, c.z1 ? String(c.z1 + 760) : '') + '<em>mm AB</em>', 'Top of the air pipe / overflow — deep-tank head h4 (LR Pt 4 Ch 1 Table 1.9.1)') : ''}
        ${T.tank ? R('Test head', num('testHead_m', c.testHead_m, 0.1, 62, '2.4') + '<em>m above top</em>', 'Hydrostatic test head; blank = 2.4 m') : ''}
        ${c.type === 'cargo' ? R('Cargo load', num('cargoLoad', c.cargoLoad, 0.5, 62, '20') + '<em>t/m² on IB</em>', 'Stowage load on the inner bottom (LR Pt 4 Ch 1 Sec 8.4)') : ''}
      </div>`;
    }
    // Deck loads
    const decks = s.panels.filter(p => DECK_POS.includes(p.position));
    if (decks.length) {
      const nLoaded = decks.filter(p => p.deckLoad && p.deckLoad.type && p.deckLoad.type !== 'none').length;
      h += `<div class="ed-group ${nLoaded ? '' : 'collapsed'}"><div class="ed-group-header"><span style="color:#eab308">Deck loads <span class="ed-count">(${nLoaded}/${decks.length})</span></span></div>
        <div class="ed-row st-head"><span style="width:34px">Panel</span><span style="flex:1">Type</span><span style="width:60px">kN/m²</span></div>`;
      decks.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true })).forEach(p => {
        const dl = p.deckLoad || { type: 'none', p: null }; const T = DECK_LOAD_TYPES.find(t => t.code === dl.type) || DECK_LOAD_TYPES[0];
        h += `<div class="ed-row" style="gap:6px"><span class="ed-id" style="width:34px;min-width:34px;color:${POS_COLOR[p.position] || '#94a3b8'}" title="${posLabel(p.position)}">${p.id}</span>
          <select class="ed-input dl-type" data-panel="${p.id}" style="flex:1">${DECK_LOAD_TYPES.map(t => `<option value="${t.code}" ${t.code === dl.type ? 'selected' : ''}>${t.label}</option>`).join('')}</select>
          <input class="ed-input dl-p" data-panel="${p.id}" type="number" step="0.5" min="0" value="${dl.p != null ? dl.p : ''}" placeholder="${T.p != null ? T.p : '—'}" style="width:56px" ${dl.type === 'none' || dl.type === 'weather' ? 'disabled' : ''}></div>`;
      });
      h += `</div>`;
    }
    // list: the ship's compartments, those at this section first
    if (all.length) {
      h += `<div class="ed-group"><div class="ed-group-header"><span style="color:var(--text-secondary)">Compartments <span class="ed-count">(${all.length})</span></span></div>
        <div class="ed-row st-head cmp-head"><span>Name</span><span>Type</span><span>Frames</span><span>Y</span><span>Z</span></div>`;
      all.slice().sort((x, y) => (here.includes(y) ? 1 : 0) - (here.includes(x) ? 1 : 0)).forEach(x => {
        const col = compColor(s, x.id); const at = here.includes(x);
        h += `<div class="ed-row pos-row cmp-row ${selComp === x.id ? 'is-sel' : ''} ${at ? '' : 'is-off'}" data-row="${x.id}" style="border-left:3px solid ${col};cursor:pointer" title="${at ? 'at this section' : 'not at this frame'}">
          <span class="ed-id" style="color:${col}">${x.name || x.id}</span><span>${compType(x.type).label}</span><span>${x.frFrom == null && x.frTo == null ? 'all' : (x.frFrom == null ? '…' : x.frFrom) + '–' + (x.frTo == null ? '…' : x.frTo)}</span><span>${fmt(x.y0)}–${fmt(x.y1)}</span><span>${fmt(x.z0)}–${fmt(x.z1)}</span></div>`;
      });
      h += `</div>`;
    }
    ec.innerHTML = h;

    const after = () => { pushLegacy(S()); renderSvg(); renderPanel(); };
    const mutM = fn => { const m = JSON.parse(JSON.stringify(S())); fn(m); commitNames(m); };
    ec.querySelectorAll('.cp-f').forEach(i => i.addEventListener('change', e => {
      if (!c) return; const k = e.target.dataset.k; let v = e.target.value; const patch = {};
      if (['rho', 'airpipe_mm', 'testHead_m', 'cargoLoad', 'frFrom', 'frTo', 'y0', 'y1', 'z0', 'z1'].includes(k)) { v = parseFloat(v); if (isNaN(v)) v = null; }
      if (k === 'type') { const T = compType(v); patch.rho = T.rho || null; if (!T.tank) { patch.airpipe_mm = null; patch.testHead_m = null; } if (v !== 'cargo') patch.cargoLoad = null; }
      patch[k] = v; CS().update(c.id, patch); after();
    }));
    ec.querySelectorAll('.pos-row').forEach(r => r.addEventListener('click', () => { selComp = r.dataset.row; compPick = false; compPickA = null; renderSvg(); renderPanel(); }));
    ec.querySelectorAll('.dl-type').forEach(el => el.addEventListener('change', e => mutM(m => { const q = m.panels.find(x => x.id === e.target.dataset.panel); if (!q) return; const T = DECK_LOAD_TYPES.find(t => t.code === e.target.value); q.deckLoad = { type: e.target.value, p: T && T.p != null ? T.p : (q.deckLoad ? q.deckLoad.p : null) }; })));
    ec.querySelectorAll('.dl-p').forEach(el => el.addEventListener('change', e => mutM(m => { const q = m.panels.find(x => x.id === e.target.dataset.panel); if (!q || !q.deckLoad) return; const v = parseFloat(e.target.value); q.deckLoad.p = isNaN(v) ? null : v; })));
    ec.querySelectorAll('[data-cp]').forEach(b => b.addEventListener('click', () => {
      const act = b.dataset.cp;
      if (act === 'add') { const f = CS().frameOf(S()); const id = CS().add({ frFrom: f, frTo: f }); selComp = id; compPick = true; compPickA = null; renderSvg(); renderPanel(); toast('Click two opposite corners of the space.'); return; }
      if (act === 'del') { if (selComp) CS().remove(selComp); selComp = null; compPick = false; compPickA = null; after(); return; }
      if (act === 'pick') { compPick = !compPick; compPickA = null; renderSvg(); renderPanel(); return; }
    }));
  }
  function hasLegacyComps() { return !!(window.Draw && Array.isArray(window.Draw.COMPARTMENTS) && window.Draw.COMPARTMENTS.length); }
  // Older files: the engine's compartments (boxes or node index lists) → ship boxes
  function seedCompsInto(m, legacy) { const nodesL = (window.Draw.computeNodes && window.Draw.computeNodes()) || []; return CS() ? CS().fromLegacy(legacy, nodesL) : 0; }

  // ------------------------------------------------------------ positions panel (step 3)
  function renderPositionsPanel(ec, s) {
    const opts = M().POSITIONS.map(p => `<option value="${p.code}">${p.label}</option>`).join('');
    const unnamed = s.panels.filter(p => !p.position).length;
    const groups = {}; s.panels.forEach(p => { (groups[p.position || ''] = groups[p.position || ''] || []).push(p); });
    let h = `<div class="cad-status ${unnamed ? 'manual' : ''}">
      <span>${s.panels.length} panels · ${unnamed ? unnamed + ' unnamed' : 'all named'}</span>
      <span class="cad-inline">${unnamed ? `<button class="ed-link-btn on" data-pos="guess" title="Assign a position to every unnamed panel from its geometry">Guess unnamed</button>` : ''}<button class="ed-link-btn" data-pos="guess-all" title="Re-guess every panel from its geometry (overwrites)">Guess all</button></span>
    </div>`;
    const selP = sel.panel ? s.panels.find(p => p.id === sel.panel) : null;
    if (selP) {
      const a = nodeById(s, selP.from), b = nodeById(s, selP.to);
      h += `<div class="ed-group cad-sel-box"><div class="ed-group-header"><span style="color:#3b82f6">${gName(s, selP.group)} · ${selP.id}</span><span class="ed-count">${fmt(M().panelLength(selP, s.nodes))} mm</span></div>
        <div class="ed-row"><span class="ed-id" style="min-width:90px;font-size:0.68rem">Position</span><select class="ed-input pos-select" data-panel="${selP.id}" style="flex:1"><option value="">— unnamed —</option>${opts}</select></div>
        <div class="ed-row"><span class="ed-id" style="min-width:90px;font-size:0.68rem">Same for</span><button class="ed-link-btn" data-pos="same-line" title="Give this position to every panel on the same straight line / arc">collinear panels</button></div>
      </div>`;
    }
    // By panel: each named run, its segments in geometric order, one position each
    const gids = Object.keys(s.groups || {});
    gids.forEach(gid => {
      const segs = s.panels.filter(p => p.group === gid).sort((a, b) => { const la = M().panelLine(a, s.nodes), lb = M().panelLine(b, s.nodes); const ka = Math.min(la.a.z, la.b.z) * 1e6 + Math.min(la.a.y, la.b.y), kb = Math.min(lb.a.z, lb.b.z) * 1e6 + Math.min(lb.a.y, lb.b.y); return ka - kb; });
      const un = segs.filter(p => !p.position).length;
      const hasSel = segs.some(p => p.id === sel.panel);
      const posSet = [...new Set(segs.map(p => p.position).filter(Boolean))];
      h += `<div class="ed-group ${hasSel || un ? '' : 'collapsed'}" data-pos-group="${gid}"><div class="ed-group-header"><span style="color:${un ? '#f59e0b' : 'var(--text-primary)'}">${gName(s, gid)} <span class="ed-count">(${segs.length}${un ? ' · ' + un + ' unnamed' : ''})</span></span>
        <select class="ed-input pos-setall" data-gid="${gid}" title="Set every segment of this panel" style="width:112px;font-size:0.6rem"><option value="">set all…</option>${opts}</select></div>`;
      segs.forEach(p => {
        const a = nodeById(s, p.from), b = nodeById(s, p.to); const col = p.position ? (POS_COLOR[p.position] || '#94a3b8') : '#f59e0b';
        h += `<div class="ed-row pos-row ${sel.panel === p.id ? 'is-sel' : ''}" data-row="${p.id}" style="border-left:3px solid ${col};cursor:pointer" title="${a.y},${a.z} → ${b.y},${b.z}">
          <span class="ed-id" style="min-width:28px;color:${col}">${p.id}</span>
          <span style="color:var(--text-muted);white-space:nowrap">${fmt(M().panelLength(p, s.nodes))} mm</span>
          <span style="flex:1"></span>
          <select class="ed-input pos-select" data-panel="${p.id}" style="width:118px;font-size:0.62rem"><option value="">—</option>${opts}</select>
        </div>`;
      });
      h += `</div>`;
    });
    ec.innerHTML = h;
    ec.querySelectorAll('.pos-select').forEach(el => {
      const p = s.panels.find(x => x.id === el.dataset.panel); el.value = (p && p.position) || '';
      el.addEventListener('change', e => {
        const m = JSON.parse(JSON.stringify(S())); const pl = m.panels.find(x => x.id === e.target.dataset.panel); if (!pl) return;
        pl.position = e.target.value || null;
        const def = M().POS[pl.position]; if (def) pl.wt = def.wt;
        commitNames(m);
      });
      el.addEventListener('click', e => e.stopPropagation());
    });
    ec.querySelectorAll('.pos-row').forEach(r => r.addEventListener('click', () => { sel = { panel: r.dataset.row, node: null }; renderSvg(); renderPanel(); }));
    ec.querySelectorAll('.pos-setall').forEach(el => { el.addEventListener('click', e => e.stopPropagation()); el.addEventListener('change', e => {
      if (!e.target.value) return; const m = JSON.parse(JSON.stringify(S())); const def = M().POS[e.target.value];
      m.panels.forEach(p => { if (p.group === e.target.dataset.gid) { p.position = e.target.value; if (def) p.wt = def.wt; } }); commitNames(m);
    }); });
    ec.querySelectorAll('[data-pos]').forEach(b => b.addEventListener('click', () => {
      const m = JSON.parse(JSON.stringify(S()));
      if (b.dataset.pos === 'guess') m.panels.forEach(p => { if (!p.position) p.position = M().guessPosition(m, p); });
      if (b.dataset.pos === 'guess-all') m.panels.forEach(p => { p.position = M().guessPosition(m, p); });
      if (b.dataset.pos === 'same-line' && selP) {
        const ref = M().panelLine(selP, m.nodes);
        const cross = (a, b, c) => Math.abs((b.y - a.y) * (c.z - a.z) - (b.z - a.z) * (c.y - a.y));
        m.panels.forEach(p => {
          const ln = M().panelLine(p, m.nodes);
          const same = ref.curve
            ? (ln.curve && Math.abs(ln.curve.r - ref.curve.r) < 1 && Math.abs(ln.curve.centre.y - ref.curve.centre.y) < 1 && Math.abs(ln.curve.centre.z - ref.curve.centre.z) < 1)
            : (!ln.curve && cross(ref.a, ref.b, ln.a) < 1 && cross(ref.a, ref.b, ln.b) < 1);
          if (same) p.position = selP.position;
        });
      }
      commitNames(m);
    }));
    ec.querySelectorAll('.ed-group-header').forEach(hd => hd.addEventListener('click', () => hd.parentElement.classList.toggle('collapsed')));
  }
  // Naming pins the section (manual): the names must survive, and the
  // generator would otherwise rebuild the panels with its own guesses.
  function commitNames(m) { m.manual = true; if (m.__idMap && sel.panel && m.__idMap[sel.panel]) sel.panel = m.__idMap[sel.panel]; delete m.__idMap; B().setSection(m); pushLegacy(m); B().render(); renderPanel(); if (typeof window.refreshStepStrip === 'function') window.refreshStepStrip(); }
  function scrollToSeg() { const el = sel.panel && document.querySelector(`.pc-seg[data-pc-seg="${sel.panel}"]`); if (el) el.scrollIntoView({ block: 'nearest' }); }
  function scrollToRow() {
    const r = sel.panel && document.querySelector(`.pos-row[data-row="${sel.panel}"]`);
    if (r) { const g = r.closest('.ed-group'); if (g) g.classList.remove('collapsed'); r.scrollIntoView({ block: 'nearest' }); }
  }

  // ------------------------------------------------------------ info card (strakes / stiffeners)
  // Loading · Rule minimum · Section properties as nested disclosures inside
  // the drawing, top-right. Open/closed state per section is remembered.
  const INFO_KEY = 'midship_infocard';
  function infoState() { try { return JSON.parse(localStorage.getItem(INFO_KEY) || '{}'); } catch (_) { return {}; } }
  function fmtM(n) { n = +n || 0; const a = Math.abs(n); return a >= 1e6 ? (n / 1e6).toFixed(2) + '·10⁶' : a >= 1e3 ? (n / 1e3).toFixed(1) + 'k' : n.toFixed(0); }
  // ---------------------------------------------------------------- messages pane
  // Errors (cannot be built / blocks the analysis) and warnings of the current step,
  // for every panel, with a target to select when clicked.
  function collectMessages(s) {
    const out = []; const gids = Object.keys(s.groups || {});
    const name = gid => s.groups[gid] || gid;
    if (inStrakes()) {
      gids.forEach(gid => {
        const d = M().panelData(s, gid); const ci = M().chainInfo(s, gid); if (!ci.L) return;
        if (!d.strakes.length) { out.push({ level: 'warn', where: name(gid), text: 'no strakes yet', gid }); return; }
        const sum = d.strakes.reduce((a, x) => a + (x.len || 0), 0), diff = Math.round(ci.L - sum);
        if (Math.abs(diff) > 5) out.push({ level: 'bad', where: name(gid), text: 'strakes add up to ' + fmt(sum) + ' of ' + fmt(ci.L) + ' mm (' + (diff > 0 ? diff + ' short' : (-diff) + ' over') + ')', gid, strake: d.strakes.length - 1 });
        d.strakes.forEach((st, i) => { if (st.t == null) out.push({ level: 'bad', where: name(gid), text: 'strake ' + (i + 1) + ' has no thickness', gid, strake: i }); });
        const obs = M().chainObstacles(s, gid); let x = 0;
        d.strakes.forEach((st, i) => {
          x += st.len || 0; if (i === d.strakes.length - 1) return;
          let best = null; obs.forEach(o => { const dd = Math.abs(o.x - x); if (!best || dd < best.d) best = { d: dd, o }; });
          if (best && best.d < 100) out.push({ level: 'warn', where: name(gid), text: 'seam ' + (i + 1) + '|' + (i + 2) + ' at ' + fmt(x) + ' mm is ' + fmt(best.d) + ' mm from ' + (best.o.kind === 'node' ? 'node ' + best.o.id : 'stiffener ' + best.o.id) + ' — ' + (best.d < 50 ? 'under the 50 mm minimum' : 'below the recommended 100'), gid, strake: i });
        });
      });
    } else if (inStiffs()) {
      gids.forEach(gid => {
        const d = M().panelData(s, gid); let prev = null;
        d.stiffGroups.forEach(g => {
          const r = M().groupPositions(s, gid, g, prev); if (r.placed.length) prev = Math.max(...r.placed);
          if (r.dropped.length) out.push({ level: 'warn', where: name(gid), text: g.id + ': ' + r.dropped.length + ' of ' + g.count + ' do not fit on the panel', gid, group: g.id });
          if (!g.profile) out.push({ level: 'bad', where: name(gid), text: g.id + ' has no profile size', gid, group: g.id });
          // a stiffener sitting on (or within 50 mm of) a plate seam — the same clash the Strakes step lists
          let acc = 0; d.strakes.forEach((st, i) => { acc += st.len || 0; if (i === d.strakes.length - 1) return; r.placed.forEach(px => { const dd = Math.abs(px - acc); if (dd < 50) out.push({ level: 'warn', where: name(gid), text: g.id + ': stiffener at ' + fmt(px) + ' mm is ' + fmt(dd) + ' mm from seam ' + (i + 1) + '|' + (i + 2) + ' — under the 50 mm minimum', gid, group: g.id }); }); });
        });
      });
    } else if (inComps()) {
      compsHere(s).forEach(c => {
        if (!compLoop(s, c)) out.push({ level: 'bad', where: c.name || c.id, text: 'box has no size — pick the corners or enter Y / Z', comp: c.id });
        else if (!compPanels(s, c).length) out.push({ level: 'warn', where: c.name || c.id, text: 'no panel lies on the box — check Y / Z against the section', comp: c.id });
        const T = compType(c.type); if (T.tank && !(c.airpipe_mm > 0)) out.push({ level: 'warn', where: c.name || c.id, text: 'no air pipe height — deep-tank head falls back to the tank top', comp: c.id });
      });
      if (CS() && CS().frameOf(s) == null && CS().list().length) out.push({ level: 'warn', where: 'Section', text: 'no frame number — every compartment of the ship is applied here', gid: null });
    }
    return out;
  }
  const MSG_KEY = 'midship_msgpane_v1'; const MSG_ROW = 17.5;
  let msgsClosed = false, msgsH = Math.round(MSG_ROW * 3);   // body height: three rows by default
  try { const q = JSON.parse(localStorage.getItem(MSG_KEY) || '{}'); if (q.h > 20) msgsH = q.h; msgsClosed = !!q.closed; } catch (_) {}
  const saveMsgState = () => { try { localStorage.setItem(MSG_KEY, JSON.stringify({ h: msgsH, closed: msgsClosed })); } catch (_) {} };
  function renderMsgPane() {
    const host = document.getElementById('svgContainer'); if (!host) return;
    let pane = document.getElementById('cadMsgPane');
    const s = S(); const msgs = s ? collectMessages(s) : [];
    if (!pane) {
      pane = document.createElement('div'); pane.id = 'cadMsgPane'; pane.className = 'cad-msgs'; host.appendChild(pane);
      // header drags the pane taller / shorter
      let drag = null;
      pane.addEventListener('mousedown', e => {
        const head = e.target.closest('.cad-msgs-head'); if (!head || e.target.closest('.cad-msgs-x') || pane.classList.contains('closed')) return;
        drag = { y0: e.clientY, h0: msgsH }; e.preventDefault();
        const mv = ev => { msgsH = Math.max(MSG_ROW, Math.min(host.clientHeight * 0.6, drag.h0 + (drag.y0 - ev.clientY))); pane.querySelector('.cad-msgs-body').style.height = msgsH + 'px'; };
        const up = () => { document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); drag = null; saveMsgState(); };
        document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up);
      });
      pane.addEventListener('click', e => {
        if (e.target.closest('.cad-msgs-x')) { msgsClosed = true; saveMsgState(); renderMsgPane(); return; }
        if (e.target.closest('.cad-msgs-pill')) { msgsClosed = false; saveMsgState(); renderMsgPane(); return; }
        const row = e.target.closest('.cad-msg'); if (!row) return;
        const m = pane.__msgs[+row.dataset.i]; if (!m) return;
        const st = SP() ? SP().state : null;
        if (m.gid && st) { if (st.gid !== m.gid) { st.gid = m.gid; st.strake = null; st.group = null; st.exc = null; } if (m.strake != null) st.strake = m.strake; if (m.group) st.group = m.group; sel = { panel: null, node: null, group: m.gid }; }
        if (m.comp) selComp = m.comp;
        renderSvg(); renderPanel();
        const target = m.strake != null ? `.mb-tr[data-st="${m.strake}"]` : m.group ? `.mb-tr[data-sg="${m.group}"]` : m.comp ? `.pos-row[data-row="${m.comp}"]` : null;
        if (target) { const r = document.querySelector(target); if (r) r.scrollIntoView({ block: 'nearest' }); }
      });
    }
    pane.__msgs = msgs; pane.style.display = ''; pane.classList.toggle('closed', msgsClosed);
    const nb = msgs.filter(m => m.level === 'bad').length, nw = msgs.length - nb;
    const counts = msgs.length ? `${nb ? `<b class="n-bad">${nb} error${nb > 1 ? 's' : ''}</b>` : ''}${nw ? `<b class="n-warn">${nw} warning${nw > 1 ? 's' : ''}</b>` : ''}` : `<b class="n-ok">No warnings or errors</b>`;
    if (msgsClosed) { pane.innerHTML = `<div class="cad-msgs-pill" title="Show the messages"><span>Messages</span>${counts}</div>`; return; }
    pane.innerHTML = `<div class="cad-msgs-head" title="Drag to resize"><span>Messages</span>${counts}<span class="cad-msgs-x" title="Close">×</span></div>
      <div class="cad-msgs-body" style="height:${msgsH}px">${msgs.length ? '' : '<div class="cad-msg ok"><span class="dot"></span><span class="txt">Nothing to fix in this step.</span></div>'}${msgs.map((m, i) => `<div class="cad-msg ${m.level}" data-i="${i}"><span class="dot"></span><span class="where">${m.where}</span><span class="txt">${m.text}</span></div>`).join('')}</div>`;
  }
  function renderInfoCard() {
    const host = document.getElementById('svgContainer'); if (!host) return;
    let card = document.getElementById('cadInfoCard');
    const want = inStrakes() || inStiffs();
    document.body.classList.toggle('has-info-card', !!want);   // the drawing keeps clear of the card
    if (!want) { if (card) card.style.display = 'none'; return; }
    if (!card) {
      card = document.createElement('div'); card.id = 'cadInfoCard'; card.className = 'cad-info'; host.appendChild(card);
      card.addEventListener('toggle', e => { const d = e.target; if (d.tagName !== 'DETAILS') return; const st = infoState(); st[d.dataset.k] = d.open; try { localStorage.setItem(INFO_KEY, JSON.stringify(st)); } catch (_) {} }, true);
    }
    card.style.display = '';
    const st = infoState();
    const open = k => (st[k] == null ? (k === 'root') : !!st[k]) ? 'open' : '';
    let ls = null, props = null, P = null;
    try { ls = window.runLongStrengthAnalysis ? window.runLongStrengthAnalysis() : null; } catch (_) {}
    try { props = B().sectionProps ? B().sectionProps() : (window.Draw.sectionProps ? window.Draw.sectionProps() : null); } catch (_) {}
    try { P = typeof getParams === 'function' ? getParams() : null; } catch (_) {}
    const row = (k, v, u, cls) => `<div class="ci-row"><span>${k}</span><span class="${cls || ''}">${v}<em>${u || ''}</em></span></div>`;
    const ratioCls = (pass, r) => !pass ? 'bad' : r >= 1.05 ? 'ok' : 'tight';
    let h = `<details class="ci-root" data-k="root" ${open('root')}><summary>Results</summary>`;
    // Loading
    h += `<details data-k="load" ${open('load')}><summary>Loading <em>LR Pt 3 Ch 4 Sec 5</em></summary>`;
    if (ls && P) {
      const Ms = P.Ms_design || 0, Mh = ls.Mw_hog || 0, Msg = ls.Mw_sag || 0;
      const Mhog = Math.abs(Ms + Mh), Msag = Math.abs(Ms + Msg);
      h += row('M_s', fmtM(Ms), 'kN·m') + row('M_w hog', fmtM(Mh), 'kN·m') + row('M_w sag', fmtM(Msg), 'kN·m') + row('M_max', fmtM(Math.max(Mhog, Msag)), 'kN·m · ' + (Mhog >= Msag ? 'hog' : 'sag'), 'accent');
    } else h += `<div class="ci-row muted">not available</div>`;
    h += `</details>`;
    // Rule minimum
    h += `<details data-k="rule" ${open('rule')}><summary>Rule minimum <em>Pt 3 Ch 4 Sec 5.4 / 5.8</em></summary>`;
    if (ls && ls.compliance) {
      const c = ls.compliance;
      const line = (name, o, u) => `<div class="ci-row ci-4"><span>${name}</span><span>${o.actual_m3 != null ? o.actual_m3.toFixed(2) : o.actual_m4.toFixed(2)}</span><span class="muted">/ ${(o.required_m3 != null ? o.required_m3 : o.required_m4).toFixed(2)} ${u}</span><span class="${ratioCls(o.pass, o.ratio)}">${o.ratio.toFixed(2)} ${o.pass ? '✓' : '✗'}</span></div>`;
      h += line('Z_B', c.Z_B, 'm³') + line('Z_D', c.Z_D, 'm³') + (c.I ? line('I_NA', c.I, 'm⁴') : '');
      if (P && P.FB != null) h += row('F_B / F_D', P.FB.toFixed(3) + ' / ' + (P.FD || 1).toFixed(3), '');
    } else h += `<div class="ci-row muted">run analysis</div>`;
    h += `</details>`;
    // Section properties
    h += `<details data-k="props" ${open('props')}><summary>Section properties</summary>`;
    if (props) {
      const cm2 = v => Math.round(v / 100).toLocaleString('en-US'), cm3 = v => isFinite(v) ? Math.round(v / 1000).toLocaleString('en-US') : '∞';
      h += row('Area', cm2(props.totalArea), 'cm²') + (props.effectiveArea != null && Math.abs(props.effectiveArea - props.totalArea) > 1 ? row('Effective', cm2(props.effectiveArea), 'cm²') : '')
        + row('NA', Math.round(props.NA).toLocaleString('en-US'), 'mm AB', 'accent') + row('I_NA', (props.I_NA / 1e12).toFixed(3), 'm⁴')
        + row('Z bottom', cm3(props.Z_bottom), 'cm³') + row('Z deck', cm3(props.Z_upperDeck), 'cm³') + row('Z coaming', cm3(props.Z_hatchCoaming), 'cm³');
    } else h += `<div class="ci-row muted">not available</div>`;
    h += `</details></details>`;
    card.innerHTML = h;
  }

  // ------------------------------------------------------------ themed popup menu
  // A small list anchored to an element — replaces native <select> popups where the
  // browser styling breaks the look. Escape / outside click closes it.
  function popupMenu(anchor, items, current, onPick) {
    document.querySelectorAll('.cad-menu').forEach(m => m.remove());
    const menu = document.createElement('div'); menu.className = 'cad-menu';
    menu.innerHTML = items.map(it => `<div class="cad-menu-item ${it.value === (current || '') ? 'on' : ''}" data-v="${it.value}"><span class="cad-menu-code" style="color:${it.color || 'inherit'}">${it.short || ''}</span><span>${it.label}</span></div>`).join('');
    document.body.appendChild(menu);
    const r = anchor.getBoundingClientRect(); const mh = Math.min(menu.offsetHeight, window.innerHeight - 16);
    let top = r.bottom + 4; if (top + mh > window.innerHeight - 8) top = Math.max(8, r.top - mh - 4);
    let left = r.right - menu.offsetWidth; if (left < 8) left = 8;
    menu.style.top = top + 'px'; menu.style.left = left + 'px';
    const close = () => { menu.remove(); document.removeEventListener('mousedown', outside, true); document.removeEventListener('keydown', esc, true); };
    const outside = ev => { if (!menu.contains(ev.target)) close(); };
    const esc = ev => { if (ev.key === 'Escape') { close(); ev.stopPropagation(); } };
    setTimeout(() => { document.addEventListener('mousedown', outside, true); document.addEventListener('keydown', esc, true); }, 0);
    menu.addEventListener('click', ev => { const it = ev.target.closest('.cad-menu-item'); if (!it) return; close(); onPick(it.dataset.v); });
    const on = menu.querySelector('.on'); if (on) on.scrollIntoView({ block: 'nearest' });
  }

  // ------------------------------------------------------------ wiring
  function init() {
    const svg = B() && B().svg(); if (!svg || svg.__cadBound) return;
    svg.__cadBound = true;
    svg.addEventListener('pointerdown', onDown, true);
    svg.addEventListener('mousemove', onMove);
    svg.addEventListener('click', onClick, true);
    svg.addEventListener('mouseleave', () => { if (active()) { hover = null; renderSvg(); } });
    window.addEventListener('keydown', onKey);
    ensureToolbar(); show(false);
  }
  // Called by 10-draw.js render() when VIEW_MODE === 'section'
  function render() {
    const v = B().viewMode(); mode = CAD_MODES.includes(v) ? v : 'section';
    if (mode !== 'section') { tool = 'select'; pending = []; arcAsk = null; }
    if (mode !== 'compartments') { compPick = false; compPickA = null; }
    init(); show(true); ensureToolbar(); renderSvg(); renderInfoCard(); renderMsgPane();
    const hd = document.querySelector('.editor-header-title');
    if (hd) hd.textContent = ({ section: 'Geometry', positions: 'Positions', supports: 'Supports', strakes: 'Strakes', stiffeners: 'Stiffeners', compartments: 'Compartments' })[mode] || 'Geometry';
  }
  function leave() { if (!document.body.classList.contains('cad-mode')) return; show(false); document.body.classList.remove('has-info-card'); const dv = document.getElementById('cadDims'); if (dv) dv.innerHTML = ''; const ic = document.getElementById('cadInfoCard'); if (ic) ic.style.display = 'none'; const mp = document.getElementById('cadMsgPane'); if (mp) mp.style.display = 'none'; const hd = document.querySelector('.editor-header-title'); if (hd) hd.textContent = 'Profile Editor'; pending = []; arcAsk = null; hover = null; const svg = B() && B().svg(); if (svg) svg.style.cursor = ''; }

  function resetSelection() { sel = { panel: null, node: null, group: null }; selComp = null; compPick = false; compPickA = null; pending = []; hover = null; hoverSg = null; hoverComp = null; }
  window.SectionCAD = { COMP_TYPES, render, renderPanel, leave, setTool, scaleLabels, placeLabels, seedCompsInto, resetSelection, isClosed: (s, c) => !!compLoop(s, c), loopOf: compLoop, compPanels, get tool() { return tool; }, get selection() { return sel; } };
})();
