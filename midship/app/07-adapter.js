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
    if (side.length) G.B_half = Math.round(Math.max(...side.map(p => line(s, p).a.y))); else if (ys.length) G.B_half = Math.round(Math.max(...ys));
    if (ib.length) G.IB = Math.round(line(s, ib[0]).a.z);
    if (ud.length) G.UD = Math.round(line(s, ud[0]).a.z); else if (side.length) G.UD = Math.round(Math.max(...side.map(p => maxZ(s, p))));
    if (is.length) G.IS = Math.round(line(s, is[0]).a.y);
    G.HC = coam.length ? Math.round(Math.max(...coam.map(p => maxZ(s, p)))) : G.UD;
    G.R_B = bilge.length && bilge[0].curve ? Math.round(bilge[0].curve.r) : 0;
    if (cg.length) G.duct_half = Math.round(line(s, cg[0]).a.y);
    P.coamingTop = ctop.length ? Math.round(ctop.reduce((a, p) => a + M().panelLength(p, s.nodes), 0)) : 0;
    // side girders: one entry per distinct y (a girder split by a node is still one girder)
    const sgYs = [...new Set(sg.map(p => Math.round(line(s, p).a.y)))].sort((a, b) => a - b);
    SG.length = 0; sgYs.forEach(y => SG.push({ y }));
    const strZ = [...new Set(by('stringer').map(p => Math.round(line(s, p).a.z)))].sort((a, b) => a - b);
    const twZ = [...new Set(by('tweenDeck').map(p => Math.round(line(s, p).a.z)))].sort((a, b) => a - b);
    P.stringerZs = strZ; P.tweenZs = twZ; G.TT = twZ.length ? twZ[0] : null;
    return { sgYs, strZ, twZ };
  }

  // ---------------------------------------------------------------- strakes
  function applyStrakes(s, STRAKES, ctx) {
    const keys = ['shell', 'innerBottom', 'innerSide', 'upperDeck', 'coamingTop']
      .concat(ctx.sgYs.map((_, i) => 'sideGirder' + i), ctx.strZ.map((_, i) => 'stringer' + i), ctx.twZ.map((_, i) => 'tween' + i));
    // Legacy tags follow the generator (SG1.. by y order, STR1.., TD1..); hand-added
    // panels have no tag, so resolve the index from geometry instead.
    const keyFor = p => {
      const base = M().legacyKey(p); if (!base) return null;
      const y = Math.round(line(s, p).a.y), z = Math.round(line(s, p).a.z);
      if (p.position === 'sideGirder') return 'sideGirder' + ctx.sgYs.indexOf(y);
      if (p.position === 'stringer') return 'stringer' + ctx.strZ.indexOf(z);
      if (p.position === 'tweenDeck') return 'tween' + ctx.twZ.indexOf(z);
      return base;
    };
    Object.keys(STRAKES).forEach(k => { if (Array.isArray(STRAKES[k])) STRAKES[k] = []; });
    keys.forEach(key => {
      const ps = s.panels.filter(p => keyFor(p) === key);
      const ordered = key === 'shell' ? chain(s, 'shell') : (key === 'innerSide' || /^sideGirder/.test(key)) ? ps.sort((a, b) => minZ(s, a) - minZ(s, b)) : ps.sort((a, b) => minY(s, a) - minY(s, b));
      const out = [];
      ordered.forEach(p => {
        const L = M().panelLength(p, s.nodes);
        const arr = (p.strakes && p.strakes.length) ? p.strakes : [{ len: L, t: null, grade: null }];
        arr.forEach(st => out.push({ width: Math.round(st.len || 0), thickness: st.t != null ? st.t : null, materialFamily: st.grade || null, materialFamilyManual: !!st.grade, panelId: p.id, effB: p.effB != null ? p.effB / 100 : 1, effS: p.effS != null ? p.effS / 100 : 1 }));
      });
      // merge equal neighbours across panel boundaries so the strake list reads like a plan
      const merged = []; out.forEach(x => { const l = merged[merged.length - 1]; if (l && l.thickness === x.thickness && l.materialFamily === x.materialFamily && l.panelId === x.panelId) l.width += x.width; else merged.push(x); });
      merged.forEach((x, i) => { x.name = key.toUpperCase() + '-' + (i + 1); });
      STRAKES[key] = merged;
    });
  }

  // ---------------------------------------------------------------- stiffeners
  function placed(s, p, g) {
    const L = M().panelLength(p, s.nodes); const out = [];
    const start = g.fromEnd === 'to' ? L - (g.offset || 0) : (g.offset || 0), dir = g.fromEnd === 'to' ? -1 : 1;
    for (let i = 0; i < (g.count || 0); i++) { const x = start + dir * i * (g.spacing || 0); if (x > 0.5 && x < L - 0.5) out.push({ x, i }); }
    return out.map(o => ({ ...o, pt: M().pointAt(line(s, p), o.x / L) }));
  }
  function applyProfiles(s, profiles, G, ctx) {
    const groups = ['bottomShell', 'innerBottom', 'stringerStiff', 'tweenStiff', 'coamingStiff', 'sideShell', 'innerSide', 'upperDeck'];
    groups.forEach(k => { profiles[k] = []; });
    Object.keys(profiles).forEach(k => { if (/^sideGirder\d+$/.test(k)) profiles[k] = []; });
    ctx.sgYs.forEach((_, i) => { profiles['sideGirder' + i] = []; });
    profiles.stringer = ctx.strZ.map(z => ({ z }));
    profiles.tweenDeck = ctx.twZ.map(z => ({ z }));
    const defSpan = s.stiffDefaultSpan || null;
    s.panels.forEach(p => {
      (p.stiffGroups || []).forEach(g => {
        const name = profileName(g);
        placed(s, p, g).forEach(o => {
          const item = { profileName: name, manual: true, grade: g.grade || null, dir: g.dir || 'long', span_mm: (g.spanOverrides && g.spanOverrides[o.i]) || g.span || defSpan, panelId: p.id, groupId: g.id, effB: p.effB != null ? p.effB / 100 : 1 };
          const y = Math.round(o.pt.y), z = Math.round(o.pt.z);
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
            case 'sideGirder': { const i = ctx.sgYs.indexOf(Math.round(line(s, p).a.y)); if (i >= 0) profiles['sideGirder' + i].push({ ...item, z }); break; }
            default: break; // centreGirder / longBhd / other: no legacy group
          }
        });
      });
    });
    ['bottomShell', 'innerBottom', 'upperDeck', 'coamingStiff', 'stringerStiff', 'tweenStiff'].forEach(k => profiles[k].sort((a, b) => a.y - b.y));
    ['sideShell', 'innerSide'].forEach(k => profiles[k].sort((a, b) => a.z - b.z));
    ctx.sgYs.forEach((_, i) => profiles['sideGirder' + i].sort((a, b) => a.z - b.z));
  }

  // ---------------------------------------------------------------- compartments / WT
  const LEGACY_TYPE = { ballast: 'ballast', fuel: 'fuel', freshwater: 'freshwater', cargo: 'cargo', liquidCargo: 'fuel', void: 'void', machinery: 'void', accommodation: 'void' };
  function applyCompartments(s, COMPARTMENTS) {
    if (!Array.isArray(s.compartments) || !s.compartments.length) return;   // keep whatever the project had
    const loops = window.SectionCAD && window.SectionCAD.loopOf;
    COMPARTMENTS.length = 0;
    s.compartments.forEach(c => {
      const poly = loops ? loops(s, c) : null;
      COMPARTMENTS.push({ name: c.name || c.id, type: LEGACY_TYPE[c.type] || 'void', rho: c.rho || 0, airpipeZ_mm: c.airpipe_mm || null, testHead_m: c.testHead_m || null, cargoLoad: c.cargoLoad || 0,
        poly: poly ? poly.map(q => ({ y: q.y, z: q.z })) : null, sectionId: c.id });
    });
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
      applyStrakes(s, D().STRAKES, ctx);
      applyProfiles(s, D().profiles, G, ctx);
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
  window.SectionAdapter = { apply, unmapped, profileName, effSAt, deckLoadFor };
})();
