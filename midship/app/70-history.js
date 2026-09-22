/* ==========================================================================
   70-history.js  —  Undo / redo history manager
   Extracted verbatim from Index.html (lines 30338–30608 of the
   original single-file build). Load order is significant: see index.html.
   ========================================================================== */
// =========================================================================
// HISTORY MANAGER — Undo / Redo with debounce
// -------------------------------------------------------------------------
// Captures the full editable tool state as JSON snapshots and lets the user
// walk backward (Ctrl+Z) and forward (Ctrl+Y / Ctrl+Shift+Z) through them.
//
// Captured state (from window.Draw + DOM form):
//   - STRAKES (all groups: shell, innerBottom, innerSide, upperDeck,
//     stringer, tween, coamingTop, coamingWall)
//   - profiles (all stiffener groups)
//   - PLATE_THICKNESS, PARAMS, GEOMETRY
//   - Every <input>, <select>, <textarea> value on the page
//
// NOT captured: scroll position, selection, tab state, visual flags — those
// are UI ephemera and changing them shouldn't push an undo step.
//
// Shortcuts:
//   Ctrl+Z          → undo
//   Ctrl+Y / Ctrl+Shift+Z → redo
// While the user is typing inside an <input>/<textarea>, native browser
// undo handles text edits. Our system only activates for focus-outside
// cases, or when a change event has already committed the value.
// =========================================================================
const HistoryManager = (function() {
  const MAX_STACK = 50;
  const DEBOUNCE_MS = 500;

  let undoStack = [];
  let redoStack = [];
  let pendingTimer = null;
  let baseline = null;         // snapshot before any pending changes
  let suspendCount = 0;        // suspend > 0 disables capture (used during restore)

  // Build a JSON-serializable snapshot of the mutable tool state.
  function snapshot() {
    const snap = {};
    const D = window.Draw;
    if (D) {
      if (D.STRAKES) snap.STRAKES = JSON.parse(JSON.stringify(D.STRAKES));
      if (D.profiles) snap.profiles = JSON.parse(JSON.stringify(D.profiles));
      if (D.PLATE_THICKNESS) snap.PLATE_THICKNESS = JSON.parse(JSON.stringify(D.PLATE_THICKNESS));
      if (D.PARAMS) snap.PARAMS = JSON.parse(JSON.stringify(D.PARAMS));
      if (D.GEOMETRY) snap.GEOMETRY = JSON.parse(JSON.stringify(D.GEOMETRY));
    }
    // Capture form input values. Key by ID where available, else by unique
    // selector path. Only include inputs that look like tool parameters
    // (have an onchange handler that leads back to our code, or are inside
    // the scantling form).
    const inputs = {};
    document.querySelectorAll('input, select, textarea').forEach(el => {
      if (!el.id) return;  // only tracked by id
      // Skip transient/UI-only inputs — these are identified by class prefix
      if (el.classList.contains('ed-input') || el.classList.contains('ed-profile-row-select')) return;
      inputs[el.id] = (el.type === 'checkbox') ? el.checked : el.value;
    });
    snap.inputs = inputs;
    return snap;
  }

  // Restore a snapshot back into state + DOM.
  function restore(snap) {
    if (!snap) return;
    suspendCount++;
    try {
      const D = window.Draw;
      if (D) {
        // Mutate in place (preserve references)
        if (snap.STRAKES && D.STRAKES) {
          Object.keys(D.STRAKES).forEach(k => { delete D.STRAKES[k]; });
          Object.assign(D.STRAKES, JSON.parse(JSON.stringify(snap.STRAKES)));
        }
        if (snap.profiles && D.profiles) {
          Object.keys(D.profiles).forEach(k => { delete D.profiles[k]; });
          Object.assign(D.profiles, JSON.parse(JSON.stringify(snap.profiles)));
        }
        if (snap.PLATE_THICKNESS && D.PLATE_THICKNESS) {
          Object.keys(D.PLATE_THICKNESS).forEach(k => { delete D.PLATE_THICKNESS[k]; });
          Object.assign(D.PLATE_THICKNESS, JSON.parse(JSON.stringify(snap.PLATE_THICKNESS)));
        }
        if (snap.PARAMS && D.PARAMS) {
          Object.keys(D.PARAMS).forEach(k => { delete D.PARAMS[k]; });
          Object.assign(D.PARAMS, JSON.parse(JSON.stringify(snap.PARAMS)));
        }
        if (snap.GEOMETRY && D.GEOMETRY) {
          Object.keys(D.GEOMETRY).forEach(k => { delete D.GEOMETRY[k]; });
          Object.assign(D.GEOMETRY, JSON.parse(JSON.stringify(snap.GEOMETRY)));
        }
      }
      // Restore form inputs
      if (snap.inputs) {
        Object.entries(snap.inputs).forEach(([id, val]) => {
          const el = document.getElementById(id);
          if (!el) return;
          if (el.type === 'checkbox') el.checked = !!val;
          else el.value = val;
        });
      }
      // Trigger a full downstream refresh
      if (typeof recalcAll === 'function') recalcAll();
      if (typeof window.render === 'function') window.render();
      if (typeof renderEditor === 'function') renderEditor();
      if (typeof window.renderRuleMinInfoPanel === 'function') window.renderRuleMinInfoPanel();
      if (typeof window.renderHullGirderStrengthPanel === 'function') window.renderHullGirderStrengthPanel();
    } finally {
      suspendCount--;
    }
  }

  // Called whenever an event occurs that may represent a user change.
  // Debounces — if multiple changes happen within 500 ms, they're coalesced.
  function onChange() {
    if (suspendCount > 0) return;
    if (!baseline) {
      // First change: capture the pre-change state as baseline
      baseline = snapshot();
    }
    // Clear + reschedule
    if (pendingTimer) clearTimeout(pendingTimer);
    pendingTimer = setTimeout(() => {
      commit();
    }, DEBOUNCE_MS);
  }

  // Commit the pending change group: push baseline to undo stack,
  // clear redo stack.
  function commit() {
    if (!baseline) return;
    const current = snapshot();
    // Skip if nothing actually changed
    if (JSON.stringify(current) === JSON.stringify(baseline)) {
      baseline = null;
      return;
    }
    undoStack.push(baseline);
    if (undoStack.length > MAX_STACK) undoStack.shift();
    redoStack = [];
    baseline = null;
    pendingTimer = null;
    updateButtons();
  }

  function undo() {
    // Flush any pending change first
    if (pendingTimer) { clearTimeout(pendingTimer); pendingTimer = null; commit(); }
    if (undoStack.length === 0) {
      showToast('Nothing to undo');
      return;
    }
    const prev = undoStack.pop();
    const current = snapshot();
    redoStack.push(current);
    restore(prev);
    updateButtons();
    showToast('Undo');
  }

  function redo() {
    if (redoStack.length === 0) {
      showToast('Nothing to redo');
      return;
    }
    const next = redoStack.pop();
    const current = snapshot();
    undoStack.push(current);
    restore(next);
    updateButtons();
    showToast('Redo');
  }

  // Initialize keyboard + toolbar button wiring. Idempotent — safe to call
  // multiple times.
  let initialized = false;
  function init() {
    if (initialized) return;
    initialized = true;

    // Global keyboard handler
    document.addEventListener('keydown', (e) => {
      // Cmd on Mac, Ctrl on Win/Linux
      const ctrl = e.ctrlKey || e.metaKey;
      if (!ctrl) return;
      const tgt = e.target;
      const isTextInput = tgt && (
        tgt.tagName === 'INPUT' && /^(text|number|search|email|url|tel|password)$/.test(tgt.type || 'text')
        || tgt.tagName === 'TEXTAREA'
        || tgt.isContentEditable
      );

      // Ctrl+Z → undo  (unless user is typing — let browser handle text undo)
      if (e.key === 'z' && !e.shiftKey) {
        if (isTextInput) return;   // browser handles text undo
        e.preventDefault();
        undo();
        return;
      }
      // Ctrl+Y or Ctrl+Shift+Z → redo
      if (e.key === 'y' || (e.key === 'z' && e.shiftKey) || e.key === 'Z' && e.shiftKey) {
        if (isTextInput) return;
        e.preventDefault();
        redo();
        return;
      }
    });

    // Listen to form field changes. We only react to `change` events, which
    // fire on blur/commit — not every keystroke. This pairs with the 500 ms
    // debounce so a quick numeric edit produces exactly one undo step.
    document.addEventListener('change', (e) => {
      const tgt = e.target;
      if (!tgt || !tgt.id) return;
      // Ignore our own editor internals (they have their own handlers which
      // already call recalcAll + trigger mutations we pick up separately).
      onChange();
    }, true);

    // Strake/profile mutations flow through Draw's internal handlers and call
    // recalcAll. The `change` listener above catches form inputs; for direct
    // STRAKES/profiles mutations (adding a stiff, deleting a strake) we rely
    // on the calling code to invoke HistoryManager.recordChange() explicitly.
    // For now we also snapshot whenever recalcAll runs — cheap enough.
    updateButtons();
  }

  // Toolbar button state
  function updateButtons() {
    const u = document.getElementById('undoBtn');
    const r = document.getElementById('redoBtn');
    if (u) {
      u.disabled = undoStack.length === 0;
      u.title = `Undo (Ctrl+Z) — ${undoStack.length} step${undoStack.length === 1 ? '' : 's'} available`;
    }
    if (r) {
      r.disabled = redoStack.length === 0;
      r.title = `Redo (Ctrl+Y) — ${redoStack.length} step${redoStack.length === 1 ? '' : 's'} available`;
    }
  }

  // Tiny toast for feedback (~1.2 s, bottom-right)
  let toastEl = null;
  function showToast(msg) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.style.cssText = [
        'position:fixed', 'right:20px', 'bottom:20px', 'z-index:99999',
        'background:rgba(20,20,28,0.92)', 'color:#1e293b',
        'padding:8px 14px', 'border-radius:4px',
        'font-family:var(--font-mono, monospace)', 'font-size:0.72rem',
        'border:1px solid var(--accent, #7c3aed)',
        'pointer-events:none', 'opacity:0',
        'transition:opacity 0.15s'
      ].join(';');
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.style.opacity = '1';
    clearTimeout(toastEl._t);
    toastEl._t = setTimeout(() => { toastEl.style.opacity = '0'; }, 1200);
  }

  return {
    init,
    undo,
    redo,
    // Allow external code to force-snapshot at a known-good state boundary
    recordChange: onChange,
    getStackSizes: () => ({ undo: undoStack.length, redo: redoStack.length }),
  };
})();
window.HistoryManager = HistoryManager;


