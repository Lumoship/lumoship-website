// ============================================================================
// Sections registry — several cross sections in one project.
//
// The active section is the model the drawing works on (Draw.getSection / setSection);
// the others rest here as plain model objects. Switching swaps the active model and
// re-derives the legacy engine state through the adapter. Everything is saved with
// the project as SECTIONS { active, items }.
// ============================================================================
(function () {
  'use strict';
  const D = () => window.Draw;
  const clone = o => JSON.parse(JSON.stringify(o));
  const store = { items: [], active: null, seq: 1 };   // items: models (id, frame, isMidship, nodes, panels, …)

  function nextId() { let id; do { id = 'S' + (store.seq++); } while (store.items.some(m => m.id === id)); return id; }
  // make sure the active model is registered and carries an id
  function adopt() {
    const cur = D() && D().getSection ? D().getSection() : null; if (!cur) return null;
    if (!cur.panels || !cur.panels.length) return null;   // the empty project's placeholder is not a section
    if (!cur.id) cur.id = store.active || nextId();   // a regenerated model replaces the active one
    const i = store.items.findIndex(m => m.id === cur.id);
    if (i < 0) store.items.push(cur); else store.items[i] = cur;
    store.active = cur.id;
    return cur;
  }
  function list() { adopt(); return store.items.map(m => ({ id: m.id, frame: m.frame, isMidship: m.isMidship !== false, active: m.id === store.active })); }
  function activeId() { adopt(); return store.active; }

  function afterSwitch() {
    const s = D().getSection();
    if (window.SectionAdapter) { try { SectionAdapter.apply(s); } catch (e) { console.warn('[Sections] adapter', e); } }
    if (window.ScantlingPanels) { const st = ScantlingPanels.state; st.gid = null; st.strake = null; st.group = null; st.exc = null; }
    if (window.SectionCAD && SectionCAD.resetSelection) SectionCAD.resetSelection();
    try { D().render(); } catch (_) {}
    try { if (window.SectionCAD && SectionCAD.renderPanel) SectionCAD.renderPanel(); } catch (_) {}
    try { D().fitView && D().fitView(); } catch (_) {}
    try { window.Project && window.Project.saveLocal && window.Project.saveLocal(); } catch (_) {}
    try { window.dispatchEvent(new CustomEvent('midship:section-switched', { detail: { id: store.active } })); } catch (_) {}
  }
  function activate(id) {
    adopt(); const m = store.items.find(x => x.id === id); if (!m || id === store.active) return false;
    store.active = id; D().setSection(clone(m)); afterSwitch(); return true;
  }
  // A new section: the parametric section of the Main particulars (fresh layout).
  function create() {
    adopt();
    const G = D().__cad.GEOMETRY(); const $ = id => document.getElementById(id);
    if (!(G.B_half > 0) || !(G.UD > 0)) {
      // blank project: seed the parametric geometry from the main particulars
      const B = parseFloat(($('B') || {}).value), Dd = parseFloat(($('D') || {}).value);
      if (!(B > 0) || !(Dd > 0)) { if (window.eaToast) eaToast('Enter B and D on Main particulars first — the section starts from them.'); return null; }
      G.B_half = Math.round(B * 500); G.UD = Math.round(Dd * 1000); G.HC = G.UD + 1000;
      G.IB = Math.max(1000, Math.round(B * 1000 / 15 / 10) * 10); G.R_B = Math.round(B * 60 / 10) * 10;
      G.keel_half = 900; G.duct_half = 0; G.IS = Math.round(G.B_half - 1850); G.TT = 0;
    }
    const m = window.SectionModel ? SectionModel.generate({ GEOMETRY: D().__cad.GEOMETRY(), PARAMS: D().__cad.PARAMS(), SIDE_GIRDERS: D().SIDE_GIRDERS || [], stringerZs: [], tweenZs: [] }) : null;
    if (!m) return null;
    m.id = nextId(); m.manual = true; m.frame = null; m.isMidship = store.items.length === 0;   // the first section is the midship one
    store.items.push(m); store.active = m.id; D().setSection(m); afterSwitch(); return m.id;
  }
  function duplicate(id) {
    adopt(); const src = store.items.find(x => x.id === id); if (!src) return null;
    const m = clone(id === store.active ? D().getSection() : src); m.id = nextId(); m.frame = null; m.isMidship = false;
    const i = store.items.findIndex(x => x.id === id); store.items.splice(i + 1, 0, m);
    store.active = m.id; D().setSection(m); afterSwitch(); return m.id;
  }
  function remove(id) {
    adopt(); if (store.items.length < 2) return false;
    const i = store.items.findIndex(x => x.id === id); if (i < 0) return false;
    store.items.splice(i, 1);
    if (store.active === id) { const nxt = store.items[Math.min(i, store.items.length - 1)]; store.active = nxt.id; D().setSection(clone(nxt)); afterSwitch(); }
    else { try { window.Project && window.Project.saveLocal && window.Project.saveLocal(); } catch (_) {} try { window.dispatchEvent(new CustomEvent('midship:section-switched', { detail: { id: store.active } })); } catch (_) {} }
    return true;
  }
  // project file
  function exportState() { adopt(); return { active: store.active, items: store.items.map(m => m.id === store.active ? D().getSection() : m) }; }
  function importState(S) {
    store.items = []; store.active = null; store.seq = 1;
    if (S && Array.isArray(S.items) && S.items.length) {
      S.items.forEach(m => { if (m && Array.isArray(m.panels) && m.panels.length) { if (!m.id) m.id = nextId(); store.items.push(m); } });
      const act = store.items.find(m => m.id === S.active) || store.items[0];
      if (act) { store.active = act.id; D().setSection(clone(act)); const n = parseInt(String(act.id).slice(1)); if (n >= store.seq) store.seq = n + 1; store.items.forEach(m => { const k = parseInt(String(m.id).slice(1)); if (k >= store.seq) store.seq = k + 1; }); return true; }
    }
    return false;
  }
  // Label: the given name, else the frame, else Midship / Section n; the frame (or
  // "midship") as the small second part when it is not already the name.
  function label(m) {
    const fr = m && m.frame != null && String(m.frame).trim() !== '' ? 'Fr. ' + String(m.frame).trim() : null;
    const mid = !m || m.isMidship !== false;
    const nm = m && m.name && String(m.name).trim() ? String(m.name).trim() : null;
    if (nm) return { name: nm, sub: fr || (mid ? 'midship' : '') };
    return { name: fr || (mid ? 'Midship' : 'Section ' + String(m.id || '').replace(/^S/, '')), sub: mid && fr ? 'midship' : '' };
  }
  function rename(id, name) {
    adopt(); const m = store.items.find(x => x.id === id); if (!m) return false;
    const v = String(name || '').trim() || null; m.name = v;
    if (id === store.active) { const cur = D().getSection(); cur.name = v; }
    try { window.Project && window.Project.saveLocal && window.Project.saveLocal(); } catch (_) {}
    try { window.dispatchEvent(new CustomEvent('midship:section-switched', { detail: { id: store.active } })); } catch (_) {}
    return true;
  }
  window.Sections = { list, activeId, activate, create, duplicate, remove, rename, exportState, importState, label, adopt };
})();
