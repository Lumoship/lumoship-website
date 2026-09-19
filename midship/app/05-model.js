// =============================================================================
// 05-model.js — Section model: NODES + PANELS (MARS-style topology)
//
// A section is a set of nodes (Y, Z in mm, half section about CL) and panels.
// A panel is one plate run between two nodes: straight, or a circular arc
// (bilge). Every node that lies on a plate splits it — "two nodes = one panel"
// — so a bottom shell crossed by three girders is four panels. Positions
// (bottom / side / innerBottom / …) are what the rule mapping keys off later;
// the generator pre-assigns them, the user can rename in step 3.
//
// This file is pure data + geometry: no DOM, no rendering. 10-draw.js owns the
// live SECTION object, calls SectionModel.generate() from the parametric
// inputs while the section is not hand-edited, and persists it in the
// project JSON. Loaded before 10-draw.js.
// =============================================================================
(function () {
  'use strict';

  const TOL = 1; // mm — coincidence tolerance for nodes / on-line tests

  // Position codes — the rule mapping and the legacy STRAKES keys hang off these.
  const POSITIONS = [
    { code: 'bottom',       label: 'Bottom shell',        legacy: 'shell',       wt: true  },
    { code: 'bilge',        label: 'Bilge',               legacy: 'shell',       wt: true  },
    { code: 'side',         label: 'Side shell',          legacy: 'shell',       wt: true  },
    { code: 'innerBottom',  label: 'Inner bottom',        legacy: 'innerBottom', wt: true  },
    { code: 'innerSide',    label: 'Inner side',          legacy: 'innerSide',   wt: true  },
    { code: 'centreGirder', label: 'Centre girder / duct',legacy: null,          wt: true  },   // duct keel / centre girder is a watertight boundary
    { code: 'sideGirder',   label: 'Side girder',         legacy: 'sideGirder',  wt: false },
    { code: 'stringer',     label: 'Stringer plate',      legacy: 'stringer',    wt: false },
    { code: 'tweenDeck',    label: 'Tween deck',          legacy: 'tween',       wt: true  },
    { code: 'upperDeck',    label: 'Upper deck',          legacy: 'upperDeck',   wt: true  },
    { code: 'coaming',      label: 'Hatch coaming',       legacy: 'innerSide',   wt: true  },
    { code: 'coamingTop',   label: 'Coaming top plate',   legacy: 'coamingTop',  wt: true  },
    { code: 'longBhd',      label: 'Longitudinal bulkhead',legacy: null,         wt: true  },
    { code: 'deck',         label: 'Other deck',          legacy: null,          wt: true  },
    { code: 'other',        label: 'Other plate',         legacy: null,          wt: false },
  ];
  const POS = {}; POSITIONS.forEach(p => { POS[p.code] = p; });

  // ------------------------------------------------------------ geometry
  const near = (a, b) => Math.abs(a - b) <= TOL;
  const samePt = (p, q) => near(p.y, q.y) && near(p.z, q.z);
  const dist = (p, q) => Math.hypot(q.y - p.y, q.z - p.z);

  // Arc definition: from a to b, centre c, radius r. Sweep direction is
  // whatever gets from a to b the short way (bilge arcs are always < 180°).
  function arcAngles(a, b, c) {
    const t0 = Math.atan2(a.z - c.z, a.y - c.y);
    let t1 = Math.atan2(b.z - c.z, b.y - c.y);
    let d = t1 - t0;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    return { t0, sweep: d };
  }

  function lineLength(ln) {
    if (ln.curve && ln.curve.type === 'arc') {
      const { sweep } = arcAngles(ln.a, ln.b, ln.curve.centre);
      return Math.abs(sweep) * ln.curve.r;
    }
    return dist(ln.a, ln.b);
  }

  // Parameter t in [0,1] of point p along line ln, or null if p is not on it.
  function paramOn(ln, p) {
    if (ln.curve && ln.curve.type === 'arc') {
      const c = ln.curve.centre, r = ln.curve.r;
      if (Math.abs(dist(p, c) - r) > TOL) return null;
      const { t0, sweep } = arcAngles(ln.a, ln.b, c);
      let d = Math.atan2(p.z - c.z, p.y - c.y) - t0;
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      const t = d / sweep;
      return (t >= -1e-6 && t <= 1 + 1e-6) ? Math.min(1, Math.max(0, t)) : null;
    }
    const dy = ln.b.y - ln.a.y, dz = ln.b.z - ln.a.z;
    const L2 = dy * dy + dz * dz;
    if (L2 === 0) return null;
    const t = ((p.y - ln.a.y) * dy + (p.z - ln.a.z) * dz) / L2;
    if (t < -1e-6 || t > 1 + 1e-6) return null;
    const py = ln.a.y + t * dy, pz = ln.a.z + t * dz;
    return (Math.hypot(py - p.y, pz - p.z) <= TOL) ? Math.min(1, Math.max(0, t)) : null;
  }

  function pointAt(ln, t) {
    if (ln.curve && ln.curve.type === 'arc') {
      const c = ln.curve.centre, r = ln.curve.r;
      const { t0, sweep } = arcAngles(ln.a, ln.b, c);
      const th = t0 + t * sweep;
      return { y: c.y + r * Math.cos(th), z: c.z + r * Math.sin(th) };
    }
    return { y: ln.a.y + t * (ln.b.y - ln.a.y), z: ln.a.z + t * (ln.b.z - ln.a.z) };
  }

  // Intersections between two lines (0, 1 or 2 points), endpoints included.
  function intersect(A, B) {
    const arcA = A.curve && A.curve.type === 'arc', arcB = B.curve && B.curve.type === 'arc';
    if (!arcA && !arcB) {
      const d1y = A.b.y - A.a.y, d1z = A.b.z - A.a.z, d2y = B.b.y - B.a.y, d2z = B.b.z - B.a.z;
      const den = d1y * d2z - d1z * d2y;
      if (Math.abs(den) < 1e-9) return []; // parallel / collinear: endpoints handled as nodes anyway
      const s = ((B.a.y - A.a.y) * d2z - (B.a.z - A.a.z) * d2y) / den;
      const u = ((B.a.y - A.a.y) * d1z - (B.a.z - A.a.z) * d1y) / den;
      if (s < -1e-6 || s > 1 + 1e-6 || u < -1e-6 || u > 1 + 1e-6) return [];
      return [{ y: A.a.y + s * d1y, z: A.a.z + s * d1z }];
    }
    if (arcA && arcB) return []; // not needed for hull sections
    const ln = arcA ? B : A, arc = arcA ? A : B;
    const c = arc.curve.centre, r = arc.curve.r;
    const dy = ln.b.y - ln.a.y, dz = ln.b.z - ln.a.z;
    const fy = ln.a.y - c.y, fz = ln.a.z - c.z;
    const qa = dy * dy + dz * dz, qb = 2 * (fy * dy + fz * dz), qc = fy * fy + fz * fz - r * r;
    let disc = qb * qb - 4 * qa * qc;
    if (disc < 0) return [];
    disc = Math.sqrt(disc);
    const out = [];
    [(-qb - disc) / (2 * qa), (-qb + disc) / (2 * qa)].forEach(t => {
      if (t < -1e-6 || t > 1 + 1e-6) return;
      const p = { y: ln.a.y + t * dy, z: ln.a.z + t * dz };
      if (paramOn(arc, p) != null) out.push(p);
    });
    return out;
  }

  // ------------------------------------------------------------ build
  // lines: [{a:{y,z}, b:{y,z}, position, curve?, wt?, effB?, effS?}]
  // Returns {nodes, panels}: nodes deduplicated and numbered bottom-up /
  // left-right; each line split at every node lying on it.
  function build(lines) {
    const pts = [];
    const addPt = p => { if (!pts.some(q => samePt(p, q))) pts.push({ y: Math.round(p.y), z: Math.round(p.z) }); };
    lines.forEach(ln => { addPt(ln.a); addPt(ln.b); });
    for (let i = 0; i < lines.length; i++)
      for (let j = i + 1; j < lines.length; j++)
        intersect(lines[i], lines[j]).forEach(addPt);
    // Explicit split nodes (user-added) ride along on the line object.
    lines.forEach(ln => (ln.splitAt || []).forEach(addPt));

    pts.sort((p, q) => (Math.abs(p.z - q.z) > TOL ? p.z - q.z : p.y - q.y));
    const nodes = pts.map((p, i) => ({ id: 'N' + (i + 1), y: p.y, z: p.z }));
    const nodeAt = p => nodes.find(n => samePt(n, p));

    const panels = [];
    lines.forEach(ln => {
      const hits = [];
      nodes.forEach(n => { const t = paramOn(ln, n); if (t != null) hits.push({ t, n }); });
      hits.sort((a, b) => a.t - b.t);
      for (let k = 0; k + 1 < hits.length; k++) {
        const A = hits[k], B = hits[k + 1];
        if (A.n === B.n) continue;
        const seg = { from: A.n.id, to: B.n.id, position: ln.position || null,
                      effB: ln.effB != null ? ln.effB : 100, effS: ln.effS != null ? ln.effS : 100,
                      wt: ln.wt != null ? ln.wt : (POS[ln.position] ? POS[ln.position].wt : true),
                      curve: null, strakes: [], stiffGroups: [], tag: ln.tag || null, group: ln.group || null, deckLoad: ln.deckLoad || null };
        if (ln.curve && ln.curve.type === 'arc') seg.curve = { type: 'arc', r: ln.curve.r, centre: { ...ln.curve.centre } };
        panels.push(seg);
      }
    });
    // Number panels bottom-up / left-right by their midpoint.
    const mid = p => pointAt(panelLine(p, nodes), 0.5);
    panels.forEach(p => { p._m = mid(p); });
    panels.sort((p, q) => (Math.abs(p._m.z - q._m.z) > TOL ? p._m.z - q._m.z : p._m.y - q._m.y));
    panels.forEach((p, i) => { p.id = 'P' + (i + 1); delete p._m; });
    return { nodes, panels };
  }

  function panelLine(p, nodes) {
    const a = nodes.find(n => n.id === p.from), b = nodes.find(n => n.id === p.to);
    return { a, b, curve: p.curve };
  }
  function panelLength(p, nodes) { return lineLength(panelLine(p, nodes)); }

  // ------------------------------------------------------------ generator
  // Parametric section → lines. Mirrors what 10-draw.js draws today so the
  // generated model reproduces the current section exactly.
  //  src = { GEOMETRY, PARAMS, SIDE_GIRDERS:[{y}], stringerZs:[], tweenZs:[] }
  function linesFromParams(src) {
    const g = src.GEOMETRY, P = src.PARAMS || {};
    const B = g.B_half, IB = g.IB, UD = g.UD, HC = g.HC, R = Math.max(0, g.R_B || 0), IS = g.IS;
    const duct = g.duct_half || 0;
    const coamingTop = P.coamingTop != null ? P.coamingTop : 0;
    const hasCoaming = HC != null && HC > UD && coamingTop > 0;
    const bilgeStartY = B - R;
    const L = (y1, z1, y2, z2, position, extra) => Object.assign({ a: { y: y1, z: z1 }, b: { y: y2, z: z2 }, position }, extra || {});
    const lines = [];

    // Shell: bottom → bilge arc → side
    lines.push(L(0, 0, bilgeStartY, 0, 'bottom'));
    if (R > 0) lines.push(L(bilgeStartY, 0, B, R, 'bilge', { curve: { type: 'arc', r: R, centre: { y: bilgeStartY, z: R } } }));
    lines.push(L(B, R, B, UD, 'side'));
    // Upper deck IS → shell
    lines.push(L(IS, UD, B, UD, 'upperDeck'));
    // Inner bottom CL → shell (ends on the bilge arc when IB < R)
    let ibEndY = B;
    if (IB < R) ibEndY = bilgeStartY + Math.sqrt(Math.max(0, R * R - (R - IB) * (R - IB)));
    lines.push(L(0, IB, ibEndY, IB, 'innerBottom'));
    // Inner side IB → UD, coaming UD → HC, coaming top
    lines.push(L(IS, IB, IS, UD, 'innerSide'));
    if (hasCoaming) {
      lines.push(L(IS, UD, IS, HC, 'coaming'));
      lines.push(L(IS, HC, IS + coamingTop, HC, 'coamingTop'));
    }
    // Centre girder / duct keel side plate
    lines.push(L(duct, 0, duct, IB, 'centreGirder', { tag: duct > 0 ? 'duct' : 'CL' }));
    // Side girders
    (src.SIDE_GIRDERS || []).map(s => s.y).sort((a, b) => a - b).forEach((y, i) => {
      // A girder directly under the inner side (y == IS) is the usual hopper-less arrangement — keep it.
      if (y > duct && y <= IS && y < bilgeStartY) lines.push(L(y, 0, y, IB, 'sideGirder', { tag: 'SG' + (i + 1) }));
    });
    // Stringers / tween decks between inner side and shell
    (src.stringerZs || []).filter(z => z > IB && z < UD).forEach((z, i) => lines.push(L(IS, z, B, z, 'stringer', { tag: 'STR' + (i + 1) })));
    (src.tweenZs || []).filter(z => z > IB && z < UD).forEach((z, i) => lines.push(L(IS, z, B, z, 'tweenDeck', { tag: 'TD' + (i + 1) })));
    return lines;
  }

  // Panel = a named run of segments (Shell, Inner bottom, Side girder 2 …).
  // Positions are per segment; the panel is what the user names in step 2.
  function groupNameFor(seg) {
    const m = /^(SG|STR|TD)(\d+)$/.exec(seg.tag || '');
    switch (seg.position) {
      case 'bottom': case 'bilge': case 'side': return 'Shell';
      case 'innerBottom': return 'Inner bottom';
      case 'innerSide': case 'coaming': return 'Inner side';
      case 'upperDeck': return 'Upper deck';
      case 'coamingTop': return 'Coaming top';
      case 'centreGirder': return seg.tag === 'duct' ? 'Duct keel' : 'Centre girder';
      case 'sideGirder': return 'Side girder' + (m ? ' ' + m[2] : '');
      case 'stringer': return 'Stringer' + (m ? ' ' + m[2] : '');
      case 'tweenDeck': return 'Tween deck' + (m ? ' ' + m[2] : '');
      case 'longBhd': return 'Long. bulkhead';
      case 'deck': return 'Deck';
    }
    return 'Panel';
  }
  function assignGroups(model) {
    model.groups = model.groups || {};
    const byName = {}; Object.keys(model.groups).forEach(id => { byName[model.groups[id]] = id; });
    let k = Object.keys(model.groups).length;
    model.panels.forEach(seg => {
      if (seg.group && model.groups[seg.group]) return;
      let name = groupNameFor(seg);
      if (name === 'Panel') { k++; name = 'Panel ' + k; model.groups['G' + k] = name; seg.group = 'G' + k; return; }  // each free line its own panel
      if (!byName[name]) { k++; const id = 'G' + k; model.groups[id] = name; byName[name] = id; }
      seg.group = byName[name];
    });
    // drop empty groups
    Object.keys(model.groups).forEach(id => { if (!model.panels.some(p => p.group === id)) delete model.groups[id]; });
    renumber(model);
    return model;
  }
  // Segment ids run P1, P2, … panel by panel (group order) and along each panel chain,
  // so Shell is P1…Pn from the keel, the next panel continues the count.
  function renumber(model) {
    const map = {}; let n = 0;
    Object.keys(model.groups || {}).forEach(gid => { chainOf(model, gid).forEach(q => { n++; map[q.id] = 'P' + n; }); });
    model.panels.forEach(q => { if (!map[q.id]) { n++; map[q.id] = 'P' + n; } });
    if (Object.keys(map).every(k => map[k] === k)) return;
    model.panels.forEach(q => { q.id = map[q.id]; });
    (model.compartments || []).forEach(c => { c.panels = (c.panels || []).map(id => map[id] || id); });
    model.__idMap = map;   // last renumbering, for callers that hold a selection
  }
  function generate(src) {
    const model = build(linesFromParams(src));
    model.id = 'MS'; model.name = 'Midship'; model.xRef_m = null; model.half = true;
    model.manual = false;          // true once the user edits nodes/panels by hand
    model.version = 1;
    assignGroups(model);
    return model;
  }
  // Rename / create / move segments between panels.
  function setGroup(model, segIds, groupIdOrName) {
    model.groups = model.groups || {};
    let gid = groupIdOrName;
    if (!model.groups[gid]) { // a name → existing by name or new
      const found = Object.keys(model.groups).find(id => model.groups[id] === groupIdOrName);
      if (found) gid = found; else { let k = Object.keys(model.groups).length; do { k++; gid = 'G' + k; } while (model.groups[gid]); model.groups[gid] = groupIdOrName || ('Panel ' + k); }
    }
    model.panels.forEach(p => { if (segIds.includes(p.id)) p.group = gid; });
    Object.keys(model.groups).forEach(id => { if (!model.panels.some(p => p.group === id)) delete model.groups[id]; });
    return gid;
  }
  function renameGroup(model, gid, name) { if (model.groups && model.groups[gid] != null && name) model.groups[gid] = name; }

  // Legacy STRAKES key for a panel (what the rule engine / strake editor key
  // off today). Index-bearing keys (sideGirderN, stringerN, tweenN) are
  // resolved from the generator tag; hand-drawn panels return the base key.
  function legacyKey(panel) {
    const def = POS[panel.position]; if (!def || !def.legacy) return null;
    const m = /^(SG|STR|TD)(\d+)$/.exec(panel.tag || '');
    if (m && def.legacy === 'sideGirder') return 'sideGirder' + (parseInt(m[2]) - 1);
    if (m && def.legacy === 'stringer')   return 'stringer' + (parseInt(m[2]) - 1);
    if (m && def.legacy === 'tween')      return 'tween' + (parseInt(m[2]) - 1);
    return def.legacy;
  }

  // ------------------------------------------------------------ CRUD (step 1 uses these)
  // All mutations rebuild from a line list so splitting stays consistent.
  function toLines(model) {
    return model.panels.map(p => {
      const ln = panelLine(p, model.nodes);
      return { a: { y: ln.a.y, z: ln.a.z }, b: { y: ln.b.y, z: ln.b.z }, position: p.position, curve: p.curve,
               wt: p.wt, effB: p.effB, effS: p.effS, tag: p.tag, group: p.group, deckLoad: p.deckLoad, _keep: p };
    });
  }
  function rebuild(model, lines) {
    const fresh = build(lines);
    // carry per-panel data (strakes, stiffener groups, flags) across by geometry match
    fresh.panels.forEach(np => {
      const nl = panelLine(np, fresh.nodes);
      const exact = lines.find(l => l._keep && ((samePt(l.a, nl.a) && samePt(l.b, nl.b)) || (samePt(l.a, nl.b) && samePt(l.b, nl.a))));
      if (exact) { np.strakes = exact._keep.strakes || []; np.stiffGroups = exact._keep.stiffGroups || []; return; }
      // a split piece of an old segment keeps its panel, position and flags (not its strakes — lengths changed)
      const host = lines.find(l => l._keep && paramOn(l, nl.a) != null && paramOn(l, nl.b) != null);
      if (host) { const o = host._keep; np.group = o.group; np.position = o.position; np.wt = o.wt; np.effB = o.effB; np.effS = o.effS; np.deckLoad = o.deckLoad || null; }
    });
    // a brand-new line: join the panel it continues collinearly from, else its own panel
    fresh.panels.forEach(np => {
      if (np.group) return;
      const nl = panelLine(np, fresh.nodes);
      const mate = fresh.panels.find(o => o !== np && o.group && !o.curve && !nl.curve && (o.from === np.from || o.from === np.to || o.to === np.from || o.to === np.to) && (() => { const ol = panelLine(o, fresh.nodes); const cross = (a, b, c) => Math.abs((b.y - a.y) * (c.z - a.z) - (b.z - a.z) * (c.y - a.y)); return cross(ol.a, ol.b, nl.a) < 1 && cross(ol.a, ol.b, nl.b) < 1; })());
      if (mate) { np.group = mate.group; if (!np.position) np.position = mate.position; }
    });
    model.nodes = fresh.nodes; model.panels = fresh.panels; model.manual = true;
    assignGroups(model);
    return model;
  }
  function addLine(model, a, b, opts) {
    const lines = toLines(model);
    lines.push(Object.assign({ a: { ...a }, b: { ...b }, position: null }, opts || {}));
    return rebuild(model, lines);
  }
  function addArc(model, a, b, r, opts) {
    // Centre: the one of the two candidates that makes a convex bilge (below-right of the chord).
    const d = dist(a, b); if (d === 0 || r < d / 2) return model;
    const m = { y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 };
    const h = Math.sqrt(r * r - (d / 2) * (d / 2));
    const ny = -(b.z - a.z) / d, nz = (b.y - a.y) / d;
    const c1 = { y: m.y + ny * h, z: m.z + nz * h }, c2 = { y: m.y - ny * h, z: m.z - nz * h };
    const centre = (opts && opts.centre) || ((c1.y <= c2.y && c1.z >= c2.z) ? c1 : c2);
    const lines = toLines(model);
    lines.push(Object.assign({ a: { ...a }, b: { ...b }, position: null, curve: { type: 'arc', r, centre } }, opts || {}));
    return rebuild(model, lines);
  }
  function removePanel(model, panelId) {
    const lines = toLines(model).filter(l => l._keep.id !== panelId);
    return rebuild(model, lines);
  }
  // Insert a node on a panel at parameter t (0..1) or at a given point.
  function splitPanel(model, panelId, tOrPoint) {
    const p = model.panels.find(x => x.id === panelId); if (!p) return model;
    const ln = panelLine(p, model.nodes);
    const pt = typeof tOrPoint === 'number' ? pointAt(ln, tOrPoint) : tOrPoint;
    if (paramOn(ln, pt) == null) return model;
    const lines = toLines(model);
    const l = lines.find(x => x._keep.id === panelId);
    l.splitAt = (l.splitAt || []).concat([pt]);
    return rebuild(model, lines);
  }
  function moveNode(model, nodeId, y, z) {
    const n = model.nodes.find(x => x.id === nodeId); if (!n) return model;
    const lines = toLines(model).map(l => {
      if (samePt(l.a, n)) l.a = { y, z };
      if (samePt(l.b, n)) l.b = { y, z };
      return l;
    });
    return rebuild(model, lines);
  }

  // Curve type of one segment: straight, or an arc of radius r through its two nodes.
  function setCurve(model, segId, r) {
    const lines = toLines(model); const l = lines.find(x => x._keep.id === segId); if (!l) return false;
    if (!r || !(r > 0)) { l.curve = null; rebuild(model, lines); return true; }
    const d = dist(l.a, l.b); if (r < d / 2) return false;
    const m = { y: (l.a.y + l.b.y) / 2, z: (l.a.z + l.b.z) / 2 }, h = Math.sqrt(r * r - (d / 2) * (d / 2));
    const ny = -(l.b.z - l.a.z) / d, nz = (l.b.y - l.a.y) / d;
    const c1 = { y: m.y + ny * h, z: m.z + nz * h }, c2 = { y: m.y - ny * h, z: m.z - nz * h };
    // centre towards the section interior (smaller y / higher z), as for a bilge
    const centre = (c1.y <= c2.y && c1.z >= c2.z) ? c1 : c2;
    l.curve = { type: 'arc', r, centre }; rebuild(model, lines); return true;
  }
  // Remove a node: a free end drops its segment; a node between two collinear
  // straights (or two pieces of one arc) merges them; a junction is refused.
  function removeNode(model, nodeId) {
    const n = model.nodes.find(x => x.id === nodeId); if (!n) return { ok: false, why: 'no such node' };
    const touching = model.panels.filter(p => p.from === nodeId || p.to === nodeId);
    if (touching.length === 0) return { ok: false, why: 'unused node' };
    let lines = toLines(model);
    if (touching.length === 1) { lines = lines.filter(l => l._keep.id !== touching[0].id); rebuild(model, lines); return { ok: true }; }
    if (touching.length !== 2) return { ok: false, why: 'junction of ' + touching.length + ' panels — delete a panel instead' };
    const [p1, p2] = touching; const l1 = panelLine(p1, model.nodes), l2 = panelLine(p2, model.nodes);
    const far1 = p1.from === nodeId ? l1.b : l1.a, far2 = p2.from === nodeId ? l2.b : l2.a;
    let merged;
    if (!p1.curve && !p2.curve) {
      const cross = Math.abs((l1.b.y - l1.a.y) * (far2.z - l1.a.z) - (l1.b.z - l1.a.z) * (far2.y - l1.a.y)) / Math.max(1, dist(l1.a, l1.b));
      if (cross > TOL) return { ok: false, why: 'panels meet at an angle — remove one instead' };
      merged = { a: { ...far1 }, b: { ...far2 }, position: p1.position, curve: null };
    } else if (p1.curve && p2.curve && Math.abs(p1.curve.r - p2.curve.r) <= TOL && samePt(p1.curve.centre, p2.curve.centre)) {
      merged = { a: { ...far1 }, b: { ...far2 }, position: p1.position, curve: { type: 'arc', r: p1.curve.r, centre: { ...p1.curve.centre } } };
    } else return { ok: false, why: 'cannot merge a straight with an arc' };
    Object.assign(merged, { wt: p1.wt, effB: p1.effB, effS: p1.effS, group: p1.group, deckLoad: p1.deckLoad, _keep: { ...p1, strakes: [], stiffGroups: [] } });
    lines = lines.filter(l => l._keep.id !== p1.id && l._keep.id !== p2.id); lines.push(merged);
    rebuild(model, lines); return { ok: true };
  }

  // ------------------------------------------------------------ panel chains + panel-level data
  // A panel (group) is walked as a chain from its start node (lowest z, then lowest
  // y) so "distance along the panel" is well defined: keel → bottom → bilge → side.
  function chainOf(model, gid) {
    const segs = model.panels.filter(p => p.group === gid); if (segs.length < 2) return segs.slice();
    const deg = {}; segs.forEach(p => { deg[p.from] = (deg[p.from] || 0) + 1; deg[p.to] = (deg[p.to] || 0) + 1; });
    const ends = Object.keys(deg).filter(k => deg[k] === 1).map(id => model.nodes.find(n => n.id === id)).filter(Boolean).sort((a, b) => (a.z - b.z) || (a.y - b.y));
    const key = q => { const ln = panelLine(q, model.nodes); return Math.min(ln.a.z, ln.b.z) * 1e6 + Math.min(ln.a.y, ln.b.y); };
    if (!ends.length) return segs.sort((a, b) => key(a) - key(b));
    const out = [], left = segs.slice(); let at = ends[0].id, guard = 0;
    while (left.length && guard++ < 500) { const i = left.findIndex(q => q.from === at || q.to === at); if (i < 0) break; const q = left.splice(i, 1)[0]; out.push(q); at = q.from === at ? q.to : q.from; }
    return out.concat(left.sort((a, b) => key(a) - key(b)));
  }
  // Chain with cumulative starts; `fwd` says whether the segment is walked from→to.
  function chainInfo(model, gid) {
    const segs = chainOf(model, gid); const items = []; let x = 0; let at = null;
    if (segs.length) { const first = segs[0], nxt = segs[1]; at = nxt ? ((nxt.from === first.to || nxt.to === first.to) ? first.from : first.to) : first.from; }
    const startNode = at;
    segs.forEach(q => { const L = panelLength(q, model.nodes); const fwd = q.from === at; items.push({ seg: q, start: x, len: L, fwd }); x += L; at = fwd ? q.to : q.from; });
    return { items, L: x, startNode, endNode: at };
  }
  function chainPointAt(model, gid, x) {
    const ci = chainInfo(model, gid); if (!ci.items.length) return null;
    x = Math.max(0, Math.min(ci.L, x));
    let it = ci.items.find(i => x >= i.start && x <= i.start + i.len) || ci.items[ci.items.length - 1];
    const t = it.len > 0 ? (x - it.start) / it.len : 0;
    const ln = panelLine(it.seg, model.nodes); const pt = pointAt(ln, it.fwd ? t : 1 - t);
    // tangent along the chain direction
    const q2 = pointAt(ln, it.fwd ? Math.min(1, t + 0.001) : Math.max(0, 1 - t - 0.001));
    let ty = q2.y - pt.y, tz = q2.z - pt.z; const n = Math.hypot(ty, tz) || 1;
    return { y: pt.y, z: pt.z, seg: it.seg, t, ty: ty / n, tz: tz / n };
  }
  // Points along the chain between x0 and x1 (for drawing a strake run).
  function chainPolyline(model, gid, x0, x1) {
    const ci = chainInfo(model, gid); const pts = [];
    ci.items.forEach(it => {
      const a = Math.max(x0, it.start), b = Math.min(x1, it.start + it.len); if (b <= a) return;
      const ln = panelLine(it.seg, model.nodes); const n = ln.curve ? 12 : 1;
      for (let k = 0; k <= n; k++) { const x = a + (b - a) * k / n; const t = it.len ? (x - it.start) / it.len : 0; pts.push(pointAt(ln, it.fwd ? t : 1 - t)); }
    });
    return pts;
  }
  // Per-panel scantling data. Strakes run along the chain (Σ len = chain length);
  // stiffener groups start at a distance from the panel start (or end).
  function panelData(model, gid) {
    model.panelData = model.panelData || {};
    if (!model.panelData[gid]) model.panelData[gid] = { strakes: [], stiffGroups: [], supports: { span: null, aftFr: null, foreFr: null, exceptions: [] } };
    const d = model.panelData[gid];
    d.strakes = d.strakes || []; d.stiffGroups = d.stiffGroups || []; d.supports = d.supports || { span: null, aftFr: null, foreFr: null, exceptions: [] };
    return d;
  }
  // One-off migration from the segment-level fields (strakes / stiffGroups on segments).
  function migratePanelData(model) {
    if (model.panelData) return model;
    model.panelData = {};
    Object.keys(model.groups || {}).forEach(gid => {
      const d = panelData(model, gid); const ci = chainInfo(model, gid);
      ci.items.forEach(it => {
        const q = it.seg;
        (q.strakes || []).forEach(st => d.strakes.push({ len: st.len, t: st.t, grade: st.grade || null, type: 'ordinary', hole: null }));
        (q.stiffGroups || []).forEach(g => {
          // offset measured from the segment's from-node → distance along the chain
          const segStart = it.fwd ? (g.fromEnd === 'to' ? it.start + it.len - (g.offset || 0) : it.start + (g.offset || 0)) : (g.fromEnd === 'to' ? it.start + (g.offset || 0) : it.start + it.len - (g.offset || 0));
          const dir = (it.fwd ? (g.fromEnd !== 'to') : (g.fromEnd === 'to')) ? 1 : -1;
          d.stiffGroups.push({ id: 'G' + (d.stiffGroups.length + 1), start: Math.round(dir > 0 ? segStart : ci.L - segStart), fromEnd: dir > 0 ? 'start' : 'end', ref: 'node', spacing: g.spacing, count: g.count, dir: g.dir || 'long', type: g.type || 'HP', profile: g.profile || '', grade: g.grade || null, side: g.side || 'in', span: g.span || null, spanOverrides: g.spanOverrides || {} });
        });
      });
      // fill a missing tail so Σ = L when strakes exist
      const sum = d.strakes.reduce((a, x) => a + (x.len || 0), 0);
      if (d.strakes.length && Math.abs(sum - ci.L) > 5) d.strakes[d.strakes.length - 1].len += Math.round(ci.L - sum);
    });
    model.panels.forEach(q => { delete q.strakes; delete q.stiffGroups; });
    return model;
  }
  // Stiffener positions (distance from the panel start) of one group.
  function groupPositions(model, gid, g, prevEnd) {
    const ci = chainInfo(model, gid); const placed = [], dropped = [];
    let start = g.ref === 'prev' && prevEnd != null ? prevEnd + (g.start || 0) : (g.fromEnd === 'end' ? ci.L - (g.start || 0) : (g.start || 0));
    const dir = g.fromEnd === 'end' && g.ref !== 'prev' ? -1 : 1;
    for (let i = 0; i < (g.count || 0); i++) { const x = start + dir * i * (g.spacing || 0); if (x > 0.5 && x < ci.L - 0.5) placed.push(x); else dropped.push(x); }
    return { placed, dropped, L: ci.L };
  }
  // Obstacles along a panel chain (distance from the panel start): every internal node
  // where another panel lands, and every stiffener of the panel. Seams must stay clear.
  function chainObstacles(model, gid) {
    const ci = chainInfo(model, gid); const out = [];
    ci.items.forEach((it, i) => {
      if (i === 0) return;
      const nid = it.fwd ? it.seg.from : it.seg.to;             // node at the start of this item
      const others = model.panels.filter(p => p.group !== gid && (p.from === nid || p.to === nid));
      if (others.length) out.push({ x: it.start, kind: 'node', id: nid });
    });
    const d = (model.panelData || {})[gid];
    if (d && d.stiffGroups) { let prev = null; d.stiffGroups.forEach(g => { const r = groupPositions(model, gid, g, prev); if (r.placed.length) prev = Math.max(...r.placed); r.placed.forEach(x => out.push({ x, kind: 'stiff', id: g.id })); }); }
    return out.sort((a, b) => a.x - b.x);
  }
  // Plates of a preferred width along the panel; a seam that would land within
  // `clear` mm of an obstacle is shifted past it. Thickness / grade are taken from
  // whatever strake covered that spot before (else null / grade default).
  function autoStrakes(model, gid, opts) {
    opts = opts || {}; const W = opts.width || 2480, clear = opts.clear || 100, keel = opts.keel || 0;
    const ci = chainInfo(model, gid); const L = ci.L; if (!(L > 0)) return [];
    const obs = chainObstacles(model, gid).map(o => o.x);
    const d = panelData(model, gid); const old = d.strakes.slice(); const oldAt = x => { let acc = 0; for (const st of old) { acc += st.len || 0; if (x <= acc) return st; } return old[old.length - 1] || null; };
    const seams = [];
    let x = 0;
    const avoid = v => { for (const o of obs) { if (Math.abs(v - o) < clear) { const up = o + clear, dn = o - clear; return (Math.abs(up - v) <= Math.abs(dn - v) || dn <= (seams[seams.length - 1] || 0) + 500) ? up : dn; } } return v; };
    if (keel > 0 && keel < L - 500) { const k = Math.round(avoid(keel) / 10) * 10; seams.push(k); x = k; }   // keel seam clear of the duct / centre girder too
    let guard = 0;
    while (L - x > W + 500 && guard++ < 200) {
      let sm = Math.round(avoid(x + W) / 10) * 10;
      if (sm <= x + 500) sm = Math.round(avoid(x + W + clear) / 10) * 10;
      if (sm >= L - 500) break;
      seams.push(sm); x = sm;
    }
    const out = []; let from = 0;
    seams.concat([L]).forEach(to => { const len = Math.round(to - from); if (len <= 0) return; const src = oldAt((from + to) / 2); out.push({ len, t: src ? src.t : null, grade: src ? src.grade : (opts.grade || null), type: out.length === 0 && keel > 0 ? 'keel' : 'ordinary', hole: null }); from = to; });
    const sum = out.reduce((a, q) => a + q.len, 0); if (out.length) out[out.length - 1].len += Math.round(L - sum);
    return out;
  }

  // Effective span at distance x along the panel: exception range → its span, else panel span, else null.
  function spanAt(model, gid, x) {
    const d = panelData(model, gid);
    const ex = (d.supports.exceptions || []).find(e => x >= Math.min(e.from, e.to) && x <= Math.max(e.from, e.to));
    if (ex && ex.span > 0) return ex.span;
    return d.supports.span > 0 ? d.supports.span : null;
  }

  // ------------------------------------------------------------ position guess
  // For hand-drawn panels: a geometric guess the user confirms in step 3.
  function guessPosition(model, panel) {
    const ln = panelLine(panel, model.nodes);
    if (panel.curve) return 'bilge';
    const ys = model.nodes.map(n => n.y), zs = model.nodes.map(n => n.z);
    const yMax = Math.max(...ys), zMax = Math.max(...zs);
    const Lp = Math.max(1, dist(ln.a, ln.b));
    const horiz = Math.abs(ln.a.z - ln.b.z) <= Math.max(TOL, 0.005 * Lp), vert = Math.abs(ln.a.y - ln.b.y) <= Math.max(TOL, 0.005 * Lp);
    const zTop = Math.max(ln.a.z, ln.b.z), zBot = Math.min(ln.a.z, ln.b.z);
    // inner bottom = lowest horizontal above the baseline that starts at CL
    const ibZ = Math.min(...model.panels.filter(p => {
      const l = panelLine(p, model.nodes); return near(l.a.z, l.b.z) && l.a.z > TOL && Math.min(l.a.y, l.b.y) <= TOL;
    }).map(p => panelLine(p, model.nodes).a.z), Infinity);
    // deck at side = highest horizontal touching the side shell
    const deckZ = Math.max(...model.panels.filter(p => {
      const l = panelLine(p, model.nodes); return near(l.a.z, l.b.z) && Math.max(l.a.y, l.b.y) >= yMax - TOL;
    }).map(p => panelLine(p, model.nodes).a.z), -Infinity);
    if (horiz) {
      const z = ln.a.z;
      if (near(z, 0)) return 'bottom';
      if (isFinite(ibZ) && near(z, ibZ)) return 'innerBottom';
      if (isFinite(deckZ) && near(z, deckZ)) return 'upperDeck';
      if (near(z, zMax) && z > deckZ) return 'coamingTop';
      return Math.max(ln.a.y, ln.b.y) >= yMax - TOL ? 'stringer' : 'deck';
    }
    if (vert) {
      const y = ln.a.y;
      if (near(y, yMax)) return 'side';
      // verticals inside the double bottom: innermost one is the centre girder / duct keel plate
      const dbYs = model.panels.filter(p => { const l = panelLine(p, model.nodes); return Math.abs(l.a.y - l.b.y) <= TOL && isFinite(ibZ) && Math.max(l.a.z, l.b.z) <= ibZ + TOL && l.a.y < yMax - TOL; }).map(p => panelLine(p, model.nodes).a.y);
      if (isFinite(ibZ) && zTop <= ibZ + TOL) return (dbYs.length && near(y, Math.min(...dbYs)) && y < 0.2 * yMax) ? 'centreGirder' : 'sideGirder';
      if (isFinite(deckZ) && zBot >= deckZ - TOL) return 'coaming';
      // above the inner bottom: the outermost vertical short of the shell is the inner side
      const upYs = model.panels.filter(p => { const l = panelLine(p, model.nodes); return Math.abs(l.a.y - l.b.y) <= TOL && Math.min(l.a.z, l.b.z) >= (isFinite(ibZ) ? ibZ - TOL : 0) && l.a.y < yMax - TOL && !(isFinite(deckZ) && Math.min(l.a.z, l.b.z) >= deckZ - TOL); }).map(p => panelLine(p, model.nodes).a.y);
      if (upYs.length && near(y, Math.max(...upYs))) return 'innerSide';
      return 'longBhd';
    }
    // sloped plate
    if (zBot <= TOL) return 'bottom';
    if (isFinite(ibZ) && zTop <= ibZ + TOL) return 'sideGirder';
    return 'other';
  }

  // ------------------------------------------------------------ checks
  function validate(model) {
    const issues = [];
    model.panels.forEach(p => {
      if (!p.position) issues.push({ level: 'warn', panel: p.id, text: p.id + ': no position code' });
      const L = panelLength(p, model.nodes);
      if (L < 50) issues.push({ level: 'warn', panel: p.id, text: p.id + ': very short panel (' + Math.round(L) + ' mm)' });

    });
    Object.keys(model.panelData || {}).forEach(gid => {
      const d = model.panelData[gid]; if (!d || !d.strakes || !d.strakes.length) return;
      const L = chainInfo(model, gid).L; const sum = d.strakes.reduce((a, x) => a + (x.len || 0), 0);
      if (Math.abs(sum - L) > 5) issues.push({ level: 'error', group: gid, text: ((model.groups || {})[gid] || gid) + ': strakes Σ ' + Math.round(sum) + ' ≠ panel ' + Math.round(L) + ' mm' });
    });
    // Dangling nodes: a node touching only one panel that is not on CL (y≈0) or a free deck edge.
    model.nodes.forEach(n => {
      const deg = model.panels.filter(p => p.from === n.id || p.to === n.id).length;
      if (deg === 1 && n.y > TOL) issues.push({ level: 'info', node: n.id, text: n.id + ' (' + n.y + ', ' + n.z + '): free end' });
    });
    return issues;
  }

  window.SectionModel = {
    POSITIONS, POS, TOL,
    generate, linesFromParams, build, legacyKey,
    panelLine, panelLength, pointAt, paramOn, intersect,
    addLine, addArc, removePanel, splitPanel, moveNode, removeNode, setCurve, validate,
    chainOf, chainInfo, chainPointAt, chainPolyline, panelData, migratePanelData, groupPositions, spanAt, chainObstacles, autoStrakes, guessPosition, assignGroups, setGroup, renameGroup, groupNameFor,
  };
})();
