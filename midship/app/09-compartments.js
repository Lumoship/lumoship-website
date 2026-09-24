// ============================================================================
// Compartments of the ship — boxes: frame range × Y range × Z range (mm, Y from the
// centreline on the half section). One list for the whole project (saved in
// #compartmentsJson); a cross section shows the compartments whose frame range
// contains its frame and takes their boundary as the panels on / inside the box.
// The same list is edited on the Compartments page and inside a section.
// ============================================================================
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  let cache = null;

  function read() {
    if (cache) return cache;
    try { const j = JSON.parse(($('compartmentsJson') || {}).value || '[]'); cache = Array.isArray(j) ? j : []; } catch (_) { cache = []; }
    return cache;
  }
  function save() {
    const el = $('compartmentsJson'); if (el) { el.value = JSON.stringify(cache || []); }
    try { window.Project && window.Project.saveLocal && window.Project.saveLocal(); } catch (_) {}
    try { window.dispatchEvent(new Event('midship:comps-changed')); } catch (_) {}
  }
  function reload() { cache = null; return read(); }
  function list() { return read().slice(); }
  function get(id) { return read().find(c => c.id === id) || null; }
  function nextId() { let k = 1; while (read().some(c => c.id === 'C' + k)) k++; return 'C' + k; }
  function add(partial) {
    const T = (window.SectionCAD && SectionCAD.COMP_TYPES || []).find(t => t.code === (partial && partial.type)) || (window.SectionCAD && SectionCAD.COMP_TYPES || [])[0] || { code: 'ballast', rho: 1.025 };
    const c = Object.assign({ id: nextId(), name: '', type: T.code, rho: T.rho || null, airpipe_mm: null, testHead_m: null, cargoLoad: null, frFrom: null, frTo: null, y0: 0, y1: 0, z0: 0, z1: 0 }, partial || {});
    if (!c.name) c.name = c.id;
    read().push(c); save(); return c.id;
  }
  function update(id, patch) {
    const c = get(id); if (!c) return false;
    Object.keys(patch).forEach(k => { c[k] = patch[k]; });
    // keep the box ordered
    if (c.y0 != null && c.y1 != null && c.y1 < c.y0) { const t = c.y0; c.y0 = c.y1; c.y1 = t; }
    if (c.z0 != null && c.z1 != null && c.z1 < c.z0) { const t = c.z0; c.z0 = c.z1; c.z1 = t; }
    if (c.frFrom != null && c.frTo != null && c.frTo < c.frFrom) { const t = c.frFrom; c.frFrom = c.frTo; c.frTo = t; }
    save(); return true;
  }
  function remove(id) { const a = read(); const i = a.findIndex(c => c.id === id); if (i < 0) return false; a.splice(i, 1); save(); return true; }

  // ------------------------------------------------------------ geometry
  const frameOf = m => { const f = m && m.frame != null ? parseFloat(m.frame) : NaN; return isNaN(f) ? null : f; };
  // compartments a section cuts: frame within the range (open ends allowed); a section
  // without a frame sees every compartment
  function forSection(m) {
    const f = frameOf(m);
    return read().filter(c => f == null || ((c.frFrom == null || f >= c.frFrom) && (c.frTo == null || f <= c.frTo)));
  }
  function polyOf(c) { return [{ y: c.y0, z: c.z0 }, { y: c.y1, z: c.z0 }, { y: c.y1, z: c.z1 }, { y: c.y0, z: c.z1 }]; }
  function hasSize(c) { return c.y1 - c.y0 > 1 && c.z1 - c.z0 > 1; }
  // panels on the box edges or inside it (midpoint test, 20 mm tolerance)
  function panelsOf(m, c) {
    if (!m || !window.SectionModel || !hasSize(c)) return [];
    const tol = 20; const out = [];
    m.panels.forEach(p => {
      const ln = SectionModel.panelLine(p, m.nodes); const q = SectionModel.pointAt(ln, 0.5);
      if (q.y >= c.y0 - tol && q.y <= c.y1 + tol && q.z >= c.z0 - tol && q.z <= c.z1 + tol) out.push(p.id);
    });
    return out;
  }
  // sections (models) whose frame lies in the range — for the overview
  function sectionsOf(c, models) {
    return (models || []).filter(m => { const f = frameOf(m); return f == null || ((c.frFrom == null || f >= c.frFrom) && (c.frTo == null || f <= c.frTo)); });
  }
  // the engine's compartment record (07-adapter pushes these into COMPARTMENTS)
  function toEngine(c) {
    // Tur -> kural motoru eslemesi TEK KAYNAK: SectionCAD.COMP_TYPES satirlari
    // (12-cad.js). Burada kopyasi vardi; yeni bir tur eklenince bu kopya onu
    // tanimaz ve tank SESSIZCE 'void' olurdu - sivi yuku kaybolurdu.
    const legacyType = c => (window.SectionCAD && SectionCAD.compLegacy) ? SectionCAD.compLegacy(c) : 'void';
    return { name: c.name || c.id, type: legacyType(c.type), rho: c.rho || 0, airpipeZ_mm: c.airpipe_mm || null, testHead_m: c.testHead_m || null, cargoLoad: c.cargoLoad || 0,
      yMin: c.y0, yMax: c.y1, zMin: c.z0, zMax: c.z1, sectionId: c.id };
  }

  // ------------------------------------------------------------ migration
  // Older projects kept node-circuit compartments on each section model; they become
  // boxes (bounding box of the loop), valid for every frame.
  function migrate(models) {
    reload();
    if (read().length) { (models || []).forEach(m => { delete m.compartments; }); return 0; }
    let n = 0;
    (models || []).forEach(m => {
      (m.compartments || []).forEach(c => {
        let pts = [];
        if (c.nodes && c.nodes.length >= 3) pts = c.nodes.map(id => (m.nodes || []).find(x => x.id === id)).filter(Boolean);
        else if (c.panels && c.panels.length) c.panels.forEach(pid => { const p = m.panels.find(x => x.id === pid); if (p) { const a = m.nodes.find(x => x.id === p.from), b = m.nodes.find(x => x.id === p.to); if (a) pts.push(a); if (b) pts.push(b); } });
        if (pts.length < 2) return;
        const ys = pts.map(p => p.y), zs = pts.map(p => p.z);
        read().push({ id: nextId(), name: c.name || c.id, type: c.type, rho: c.rho, airpipe_mm: c.airpipe_mm, testHead_m: c.testHead_m, cargoLoad: c.cargoLoad, frFrom: null, frTo: null,
          y0: Math.round(Math.min(...ys)), y1: Math.round(Math.max(...ys)), z0: Math.round(Math.min(...zs)), z1: Math.round(Math.max(...zs)) }); n++;
      });
      delete m.compartments;
    });
    if (n) save();
    return n;
  }
  // legacy files (Draw.COMPARTMENTS boxes / node index lists) → boxes
  function fromLegacy(legacy, nodesL) {
    reload();
    if (read().length || !Array.isArray(legacy)) return 0;
    let n = 0;
    legacy.forEach(lc => {
      let box = null;
      if (lc.yMin != null) box = { y0: lc.yMin, y1: lc.yMax, z0: lc.zMin, z1: lc.zMax };
      else if (Array.isArray(lc.nodes) && nodesL) { const pts = lc.nodes.map(i => nodesL.find(q => q.id === i)).filter(Boolean); if (pts.length >= 2) box = { y0: Math.min(...pts.map(p => p.realY)), y1: Math.max(...pts.map(p => p.realY)), z0: Math.min(...pts.map(p => p.realZ)), z1: Math.max(...pts.map(p => p.realZ)) }; }
      if (!box) return;
      // Eski projeden gelen tur: listede varsa korunur. Liste TEK KAYNAKTAN
      // gelir, elle yazilmaz - yoksa yeni bir tur ice aktarimda 'void'e duser.
      const kodlar = (window.SectionCAD && SectionCAD.COMP_TYPES || []).map(x => x.code);
      const cevrik = (window.SectionCAD && SectionCAD.kodCevir) ? SectionCAD.kodCevir(lc.type) : lc.type;
      const type = kodlar.includes(cevrik) ? cevrik : 'void';
      read().push(Object.assign({ id: nextId(), name: lc.name || '', type, rho: lc.rho || null, airpipe_mm: lc.airpipeZ_mm || null, testHead_m: lc.testHead_m || null, cargoLoad: lc.cargoLoad || null, frFrom: null, frTo: null }, box)); n++;
    });
    if (n) save();
    return n;
  }

  window.ShipComps = { list, get, add, update, remove, reload, save, forSection, polyOf, panelsOf, sectionsOf, hasSize, toEngine, migrate, fromLegacy, frameOf };
})();
