// =============================================================================
// 07-adapter.js — SectionModel → legacy engine state
//
// The rule engine (60-scantling-rules.js), section properties, optimizers and
// exports all read the parametric globals in 10-draw.js: GEOMETRY, PARAMS,
// SIDE_GIRDERS, STRAKES.<legacyKey>, profiles.<group>, COMPARTMENTS, WT_FLAGS.
// Once the user has shaped the section by hand (SECTION.manual) those globals
// are rebuilt from the model here, so every check runs on what the user
// actually drew. 10-draw.js calls apply() from computeProfiles() /
// computeStrakes() instead of regenerating from spacing while the model is
// the source of truth.
//
// Positions with no legacy key (centreGirder, longBhd, deck, other) carry no
// LR mapping yet; they are listed by unmapped() so the Check page can say so.
// =============================================================================
(function () {
  'use strict';
  const M = () => window.SectionModel;
  const D = () => window.Draw;
  const TOL = 1;

  const nodeOf = (s, id) => s.nodes.find(n => n.id === id);
  const line = (s, p) => M().panelLine(p, s.nodes);
  const minY = (s, p) => Math.min(line(s, p).a.y, line(s, p).b.y);
  const minZ = (s, p) => Math.min(line(s, p).a.z, line(s, p).b.z);
  const maxZ = (s, p) => Math.max(line(s, p).a.z, line(s, p).b.z);

  // Ordered chain of panels sharing one legacy key (same order as the drawing runs them).
  function chain(s, key) {
    const ps = s.panels.filter(p => M().legacyKey(p) === key);
    if (key === 'shell') {
      const bottom = ps.filter(p => p.position === 'bottom').sort((a, b) => minY(s, a) - minY(s, b));
      const bilge = ps.filter(p => p.position === 'bilge');
      const side = ps.filter(p => p.position === 'side').sort((a, b) => minZ(s, a) - minZ(s, b));
      return bottom.concat(bilge, side);
    }
    if (key === 'innerSide' || /^sideGirder/.test(key)) return ps.sort((a, b) => minZ(s, a) - minZ(s, b));
    return ps.sort((a, b) => minY(s, a) - minY(s, b));
  }

  // Canonical catalogue name for a group's profile: "HP 200x10", "L 200x90x10", "FB 150x12", "T 300x12/150x15".
  function profileName(g) {
    const size = (g.profile || '').trim(); if (!size) return null;
    if (/^(HP|L|T|FB)\s/i.test(size)) return size.replace(/^(hp|l|t|fb)\s+/i, m => m.toUpperCase());
    return (g.type || 'HP') + ' ' + size;
  }

  // ---------------------------------------------------------------- geometry
  function deriveGeometry(s, G, P, SG) {
    const by = code => s.panels.filter(p => p.position === code);
    const side = by('side'), bilge = by('bilge'), ib = by('innerBottom'), is = by('innerSide'), ud = by('upperDeck'), coam = by('coaming'), ctop = by('coamingTop'), cg = by('centreGirder'), sg = by('sideGirder');
    const ys = s.nodes.map(n => n.y), zs = s.nodes.map(n => n.z);
    // Only overwrite a parametric value with a sane one — a half-drawn or renamed
    // section must never collapse the parametric geometry (IS at CL, B/2 = 0 …).
    const setIf = (k, v, ok) => { if (isFinite(v) && ok(v)) G[k] = Math.round(v); };
    if (side.length) setIf('B_half', Math.max(...side.map(p => line(s, p).a.y)), v => v > 1000); else if (ys.length) setIf('B_half', Math.max(...ys), v => v > 1000);
    if (ib.length) setIf('IB', line(s, ib[0]).a.z, v => v > 0);
    if (ud.length) setIf('UD', line(s, ud[0]).a.z, v => v > G.IB); else if (side.length) setIf('UD', Math.max(...side.map(p => maxZ(s, p))), v => v > G.IB);
    if (is.length) setIf('IS', Math.max(...is.map(p => line(s, p).a.y)), v => v > (G.duct_half || 0) && v < G.B_half);
    G.HC = coam.length ? Math.round(Math.max(...coam.map(p => maxZ(s, p)))) : G.UD;
    G.R_B = bilge.length && bilge[0].curve ? Math.round(bilge[0].curve.r) : 0;
    if (cg.length) { const v = Math.round(line(s, cg[0]).a.y); if (v >= 0 && v < (G.IS || Infinity)) G.duct_half = v; }
    P.coamingTop = ctop.length ? Math.round(ctop.reduce((a, p) => a + M().panelLength(p, s.nodes), 0)) : 0;
    // side girders: one entry per distinct y (a girder split by a node is still one girder)
    const sgYs = [...new Set(sg.map(p => Math.round(line(s, p).a.y)))].sort((a, b) => a - b);
    if (sgYs.length || !SG.length) { SG.length = 0; sgYs.forEach(y => SG.push({ y })); }   // keep the list when the model has no girders yet
    const strZ = [...new Set(by('stringer').map(p => Math.round(line(s, p).a.z)))].sort((a, b) => a - b);
    const twZ = [...new Set(by('tweenDeck').map(p => Math.round(line(s, p).a.z)))].sort((a, b) => a - b);
    P.stringerZs = strZ; P.tweenZs = twZ; G.TT = twZ.length ? twZ[0] : null;
    return { sgYs, strZ, twZ };
  }

  // ---------------------------------------------------------------- strakes (panel level)
  // Legacy key of a panel: from its first segment; index-bearing keys resolved from geometry.
  function keyForGroup(s, gid, ctx) {
    const segs = M().chainOf(s, gid); if (!segs.length) return null;
    const p = segs.find(q => M().legacyKey(q)) || segs[0]; const base = M().legacyKey(p); if (!base) return null;
    const y = Math.round(line(s, p).a.y), z = Math.round(line(s, p).a.z);
    if (p.position === 'sideGirder') return 'sideGirder' + ctx.sgYs.indexOf(y);
    if (p.position === 'stringer') return 'stringer' + ctx.strZ.indexOf(z);
    if (p.position === 'tweenDeck') return 'tween' + ctx.twZ.indexOf(z);
    return base;
  }
  function hasPanelStrakes(s) { return Object.values(s.panelData || {}).some(d => d && d.strakes && d.strakes.length); }
  function hasPanelStiffs(s) { return Object.values(s.panelData || {}).some(d => d && d.stiffGroups && d.stiffGroups.length); }
  function applyStrakes(s, STRAKES, ctx) {
    Object.keys(STRAKES).forEach(k => { if (Array.isArray(STRAKES[k])) STRAKES[k] = []; });
    Object.keys(s.groups || {}).forEach(gid => {
      const key = keyForGroup(s, gid, ctx); if (!key) return;
      const d = M().panelData(s, gid); const ci = M().chainInfo(s, gid);
      const arr = d.strakes.length ? d.strakes : [{ len: ci.L, t: null, grade: null }];
      let x = 0;
      const out = arr.map((st, i) => {
        const x0 = x; x += (st.len || 0);
        const at = M().chainPointAt(s, gid, (x0 + x) / 2); const seg = at ? at.seg : ci.items[0].seg;
        return { name: key.toUpperCase() + '-' + (i + 1), width: Math.round(st.len || 0), thickness: st.t != null ? st.t : null, materialFamily: st.grade || null, materialFamilyManual: !!st.grade,
                 kind: st.type && st.type !== 'ordinary' ? st.type : (seg ? seg.position : null), panelId: seg ? seg.id : null, groupId: gid,
                 effB: seg && seg.effB != null ? seg.effB / 100 : 1, effS: seg && seg.effS != null ? seg.effS / 100 : 1, hole: st.hole || null };
      });
      STRAKES[key] = (STRAKES[key] || []).concat(out);
    });
  }

  // ---------------------------------------------------------------- stiffeners (panel level)
  function applyProfiles(s, profiles, G, ctx) {
    const groups = ['bottomShell', 'innerBottom', 'stringerStiff', 'tweenStiff', 'coamingStiff', 'sideShell', 'innerSide', 'upperDeck'];
    groups.forEach(k => { profiles[k] = []; });
    Object.keys(profiles).forEach(k => { if (/^sideGirder\d+$/.test(k)) profiles[k] = []; });
    ctx.sgYs.forEach((_, i) => { profiles['sideGirder' + i] = []; });
    profiles.stringer = ctx.strZ.map(z => ({ z }));
    profiles.tweenDeck = ctx.twZ.map(z => ({ z }));
    const defSpan = s.stiffDefaultSpan || null;
    Object.keys(s.groups || {}).forEach(gid => {
      const d = M().panelData(s, gid); let prevEnd = null;
      d.stiffGroups.forEach(g => {
        const name = profileName(g); const r = M().groupPositions(s, gid, g, prevEnd);
        if (r.placed.length) prevEnd = Math.max(...r.placed);
        r.placed.forEach((x, i) => {
          const at = M().chainPointAt(s, gid, x); if (!at) return; const p = at.seg;
          const span = (g.spanOverrides && g.spanOverrides[i]) || g.span || M().spanAt(s, gid, x) || defSpan;
          const item = { profileName: name, manual: true, grade: g.grade || null, dir: g.dir || 'long', span_mm: span, panelId: p.id, groupId: gid, stiffGroup: g.id, effB: p.effB != null ? p.effB / 100 : 1 };
          const y = Math.round(at.y), z = Math.round(at.z);
          switch (p.position) {
            case 'bottom': profiles.bottomShell.push({ ...item, y }); break;
            case 'bilge': if (z < (G.R_B || 0) / 2) profiles.bottomShell.push({ ...item, y }); else profiles.sideShell.push({ ...item, z }); break;
            case 'side': profiles.sideShell.push({ ...item, z }); break;
            case 'innerBottom': profiles.innerBottom.push({ ...item, y }); break;
            case 'innerSide': case 'coaming': profiles.innerSide.push({ ...item, z }); break;
            case 'upperDeck': case 'deck': profiles.upperDeck.push({ ...item, y }); break;
            case 'coamingTop': profiles.coamingStiff.push({ ...item, y }); break;
            case 'stringer': profiles.stringerStiff.push({ ...item, y, z }); break;
            case 'tweenDeck': profiles.tweenStiff.push({ ...item, y, z }); break;
            case 'sideGirder': { const k = ctx.sgYs.indexOf(Math.round(line(s, p).a.y)); if (k >= 0) profiles['sideGirder' + k].push({ ...item, z }); break; }
            default: break;
          }
        });
      });
    });
    ['bottomShell', 'innerBottom', 'upperDeck', 'coamingStiff', 'stringerStiff', 'tweenStiff'].forEach(k => profiles[k].sort((a, b) => a.y - b.y));
    ['sideShell', 'innerSide'].forEach(k => profiles[k].sort((a, b) => a.z - b.z));
    ctx.sgYs.forEach((_, i) => profiles['sideGirder' + i].sort((a, b) => a.z - b.z));
  }

  // ---------------------------------------------------------------- compartments / WT
  // Not: burada tur -> kural motoru eslemesinin bir KOPYASI duruyordu ama hic
  // cagrilmiyordu; donusumu ShipComps.toEngine yapiyor (09-compartments.js) ve
  // o da tek kaynak olan SectionCAD.compLegacy'yi kullaniyor.
  function applyCompartments(s, COMPARTMENTS) {
    if (!window.ShipComps) return;
    const here = ShipComps.forSection(s).filter(c => ShipComps.hasSize(c));
    if (!here.length && !ShipComps.list().length) return;   // nothing defined yet: keep whatever the project had
    COMPARTMENTS.length = 0;
    here.forEach(c => COMPARTMENTS.push(ShipComps.toEngine(c)));
  }
  function applyWT(s, WT, ctx) {
    const wtOf = code => { const ps = s.panels.filter(p => p.position === code); return ps.length ? (ps.every(p => p.wt) ? 'WT' : 'Non-WT') : null; };
    const st = wtOf('stringer'), td = wtOf('tweenDeck'), ud = wtOf('upperDeck');
    if (st) WT.stringerPlate = st; if (td) WT.tweenDeckPlate = td; if (ud) WT.upperDeckPlate = ud;
    ctx.sgYs.forEach((y, i) => { const ps = s.panels.filter(p => p.position === 'sideGirder' && Math.round(line(s, p).a.y) === y); if (ps.length) WT['sg' + i] = ps.every(p => p.wt) ? 'WT' : 'Non-WT'; });
  }

  // ---------------------------------------------------------------- public
  let applying = false;
  function apply(section) {
    const s = section || (D() && D().getSection && D().getSection()); if (!s || applying) return false;
    const bridge = D().__cad; if (!bridge) return false;
    applying = true;
    try {
      const G = bridge.GEOMETRY(), P = bridge.PARAMS();
      const ctx = deriveGeometry(s, G, P, D().SIDE_GIRDERS);
      // Until the user has entered strakes / stiffeners on the model (steps 4 and 5)
      // the engine keeps its own automatic layout, so a single drawn line in step 2
      // does not empty the analysis.
      if (M().migratePanelData) M().migratePanelData(s);
      if (hasPanelStrakes(s)) applyStrakes(s, D().STRAKES, ctx);
      if (hasPanelStiffs(s)) applyProfiles(s, D().profiles, G, ctx);
      applyCompartments(s, D().COMPARTMENTS);
      if (D().WT_FLAGS) applyWT(s, D().WT_FLAGS, ctx);
    } finally { applying = false; }
    return true;
  }
  // Panels the LR engine cannot see (no legacy key) — for the Check page.
  function unmapped(section) {
    const s = section || (D() && D().getSection && D().getSection()); if (!s) return [];
    return s.panels.filter(p => !M().legacyKey(p)).map(p => ({ id: p.id, position: p.position }));
  }
  // Shear efficiency (0..1) of the panel nearest to (y, z) mm — 1 when the
  // section is parametric or no panel lies within 60 mm.
  function effSAt(y, z) {
    const s = D() && D().getSection && D().getSection(); if (!s || !s.manual || y == null || z == null) return 1;
    let best = null;
    s.panels.forEach(p => {
      const ln = line(s, p); let d;
      if (ln.curve) { d = Math.abs(Math.hypot(y - ln.curve.centre.y, z - ln.curve.centre.z) - ln.curve.r); }
      else { const dy = ln.b.y - ln.a.y, dz = ln.b.z - ln.a.z, L2 = dy * dy + dz * dz || 1; let t = ((y - ln.a.y) * dy + (z - ln.a.z) * dz) / L2; t = Math.max(0, Math.min(1, t)); d = Math.hypot(ln.a.y + t * dy - y, ln.a.z + t * dz - z); }
      if (d <= 60 && (!best || d < best.d)) best = { d, p };
    });
    if (!best) return 1;
    const e = best.p.effS; return (e == null || !isFinite(e)) ? 1 : Math.max(0, Math.min(1, e / 100));
  }
  // Governing deck load for a position (largest p among its panels), or null.
  function deckLoadFor(position) {
    const s = D() && D().getSection && D().getSection(); if (!s) return null;
    let best = null;
    s.panels.forEach(p => {
      if (p.position !== position || !p.deckLoad || !p.deckLoad.type || p.deckLoad.type === 'none') return;
      const v = p.deckLoad.p != null ? p.deckLoad.p : -1;
      if (!best || v > (best.p != null ? best.p : -1)) best = { type: p.deckLoad.type, p: p.deckLoad.p, panelId: p.id };
    });
    return best;
  }
  function ctxOf(s) {
    const by = code => s.panels.filter(p => p.position === code);
    return { sgYs: [...new Set(by('sideGirder').map(p => Math.round(line(s, p).a.y)))].sort((a, b) => a - b),
             strZ: [...new Set(by('stringer').map(p => Math.round(line(s, p).a.z)))].sort((a, b) => a - b),
             twZ: [...new Set(by('tweenDeck').map(p => Math.round(line(s, p).a.z)))].sort((a, b) => a - b) };
  }
  function legacyKeyOfGroup(s, gid) { return keyForGroup(s, gid, ctxOf(s)); }
  // ---------------------------------------------------------------- legacy file → panel data
  // Older project files carry STRAKES.<key> and profiles.<group> but no section
  // model. Fill panelData from them so the Strakes / Stiffeners steps show what the
  // file describes; stiffeners are regrouped into equal-spacing runs.
  function legacyToPanelData(s, STRAKES, profiles, G, PT) {
    const ctx = ctxOf(s); PT = PT || {};
    // panels the old files plated with one thickness (no strake list)
    const PT_KEY = { ductKeel: 'duct', centreGirder: 'duct', sideGirder: 'sideGirder', coaming: 'coamingWall', coamingTop: 'coamingTop', upperDeck: 'upperDeck', stringer: 'stringer', tweenDeck: 'tween' };
    Object.keys(s.groups || {}).forEach(gid => {
      const key = keyForGroup(s, gid, ctx); const d = M().panelData(s, gid); const ci = M().chainInfo(s, gid); if (!ci.L) return;
      // strakes
      const src = key && STRAKES && STRAKES[key];
      if (src && src.length && !d.strakes.length) {
        d.strakes = src.map(st => ({ len: Math.round(st.width || 0), t: st.thickness != null ? st.thickness : null, grade: st.materialFamily || null, type: 'ordinary', hole: null }));
        const sum = d.strakes.reduce((a, x) => a + x.len, 0); d.strakes[d.strakes.length - 1].len += Math.round(ci.L - sum);
      } else if (!d.strakes.length) {
        const segs0 = M().chainOf(s, gid); const pk = segs0.length ? PT_KEY[segs0[0].position] : null;
        if (pk && PT[pk] != null) d.strakes = [{ len: Math.round(ci.L), t: PT[pk], grade: null, type: 'ordinary', hole: null }];
      }
      // stiffeners: legacy items that lie on this panel, as chain distances
      if (d.stiffGroups.length) return;
      const pts = [];
      const push = (arr, mk) => (arr || []).forEach(it => { const q = mk(it); if (!q) return; const x = M().chainDistanceOf(s, gid, q); if (x != null && x > 0.5 && x < ci.L - 0.5) pts.push({ x, name: it.profileName || null, grade: it.grade || it.materialFamily || null }); });
      const segs = M().chainOf(s, gid); const pos = new Set(segs.map(q => q.position));
      if (pos.has('bottom') || pos.has('bilge') || pos.has('side')) { push(profiles.bottomShell, it => ({ y: it.y, z: 0 })); push(profiles.sideShell, it => ({ y: G.B_half, z: it.z })); }
      if (pos.has('innerBottom')) push(profiles.innerBottom, it => ({ y: it.y, z: G.IB }));
      if (pos.has('innerSide') || pos.has('coaming')) push(profiles.innerSide, it => ({ y: G.IS, z: it.z }));
      if (pos.has('upperDeck') || pos.has('deck')) push(profiles.upperDeck, it => ({ y: it.y, z: G.UD }));
      if (pos.has('coamingTop')) push(profiles.coamingStiff, it => ({ y: it.y, z: G.HC }));
      if (pos.has('stringer')) push(profiles.stringerStiff, it => ({ y: it.y, z: it.z != null ? it.z : (ctx.strZ[0] || 0) }));
      if (pos.has('tweenDeck')) push(profiles.tweenStiff, it => ({ y: it.y, z: it.z != null ? it.z : (ctx.twZ[0] || 0) }));
      if (pos.has('sideGirder')) { const y = Math.round(line(s, segs[0]).a.y); const i = ctx.sgYs.indexOf(y); push(profiles['sideGirder' + i], it => ({ y, z: it.z })); }
      if (!pts.length) return;
      pts.sort((a, b) => a.x - b.x);
      // duplicates at one position (older files doubled the ice-belt intermediates) collapse to one
      for (let i = pts.length - 1; i > 0; i--) if (Math.abs(pts[i].x - pts[i - 1].x) <= 1) pts.splice(i, 1);
      // runs of equal spacing (±5 mm) and same profile → one group each
      const typeOf = n => { const m = /^(HP|L|T|FB)\b/i.exec(n || ''); return m ? m[1].toUpperCase() : 'HP'; };
      const sizeOf = n => (n || '').replace(/^(HP|L|T|FB)\s*/i, '');
      let run = [pts[0]]; const runs = [];
      for (let i = 1; i < pts.length; i++) {
        const sp = pts[i].x - pts[i - 1].x; const sp0 = run.length > 1 ? run[1].x - run[0].x : null;
        if ((sp0 == null || Math.abs(sp - sp0) <= 8) && pts[i].name === run[0].name) run.push(pts[i]); else { runs.push(run); run = [pts[i]]; }
      }
      runs.push(run);
      runs.forEach((r, k) => {
        const sp = r.length > 1 ? Math.round(r[1].x - r[0].x) : 0;
        d.stiffGroups.push({ id: 'G' + (k + 1), start: Math.round(r[0].x), spacing: sp, count: r.length, fromEnd: 'start', ref: 'node', dir: 'long', type: typeOf(r[0].name), profile: sizeOf(r[0].name), grade: r[0].grade || null, side: ['innerBottom', 'innerSide'].includes(segs[0].position) ? 'out' : 'in', span: null, spanOverrides: {} });
      });
    });
    return s;
  }
  window.SectionAdapter = { apply, unmapped, profileName, effSAt, deckLoadFor, legacyKeyOfGroup, legacyToPanelData };
})();
