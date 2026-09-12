/* ==========================================================================
   91-profile-picker.js  —  Profile picker modal + <select> interception
   Extracted verbatim from Index.html (lines 33235–33725 of the
   original single-file build). Load order is significant: see index.html.
   ========================================================================== */
// ==========================================================================
// PROFILE PICKER MODAL — replaces the long native <select> dropdowns with
// a tabbed picker (L / FB / HP / T / All). Profiles already used somewhere
// in the structure are highlighted at the top of each tab.
//
// Public API:
//   openProfilePicker(currentValue, opts) → Promise<string|null>
//     • currentValue: string | null — the profile name currently selected
//                      (so we can pre-select it in the modal)
//     • opts.title:    optional header text
//     • opts.context:  optional small subtitle (e.g. "Bottom Long")
//     • opts.allowEmpty: if true, shows a "Clear" button
//   Returns the picked profile name, or null if cancelled / cleared.
//
// Wiring: a single document-level mousedown handler intercepts clicks on
// every <select> with class "ea-select", "ed-profile-row-select", or
// "ts-profile-name". If the select is a profile select (its options match
// catalog names), we preventDefault() to suppress the native dropdown,
// then open our modal. The chosen value is set on the <select> and a
// 'change' event is fired so all existing recalcAll() handlers run.
// ==========================================================================
(function setupProfilePicker() {
  // Build modal DOM once
  const modalHtml = `
  <div id="profilePickerOverlay" class="pp-overlay" aria-hidden="true">
    <div class="pp-modal" role="dialog" aria-labelledby="ppTitle">
      <div class="pp-header">
        <div>
          <div id="ppTitle" class="pp-title">Select profile</div>
          <div id="ppSubtitle" class="pp-subtitle"></div>
        </div>
        <button id="ppClose" class="pp-close" aria-label="Close">×</button>
      </div>
      <div class="pp-tabs">
        <button class="pp-tab pp-tab-active" data-pp-tab="all">All</button>
        <button class="pp-tab" data-pp-tab="FB">FB <span class="pp-tab-count" data-pp-count="FB"></span></button>
        <button class="pp-tab" data-pp-tab="HP">HP <span class="pp-tab-count" data-pp-count="HP"></span></button>
        <button class="pp-tab" data-pp-tab="L">L <span class="pp-tab-count" data-pp-count="L"></span></button>
      </div>
      <input type="text" id="ppSearch" class="pp-search" placeholder="Search… (e.g. 120, FB, 75x50)">
      <div class="pp-body">
        <div id="ppUsedSection" class="pp-section pp-used-section" style="display:none">
          <div class="pp-section-title">In use in this structure</div>
          <div id="ppUsedList" class="pp-grid"></div>
        </div>
        <div class="pp-section">
          <div class="pp-section-title" id="ppCatalogTitle">Catalog</div>
          <div id="ppCatalogList" class="pp-grid"></div>
        </div>
      </div>
      <div class="pp-footer">
        <button id="ppCancel" class="pp-btn pp-btn-secondary">Cancel</button>
        <button id="ppClear" class="pp-btn pp-btn-warning" style="display:none">Clear</button>
        <button id="ppOk" class="pp-btn pp-btn-primary" disabled>Select</button>
      </div>
    </div>
  </div>`;
  // Inject CSS
  const cssText = `
  .pp-overlay {
    position: fixed; inset: 0;
    background: rgba(2, 6, 23, 0.78);
    display: none; align-items: center; justify-content: center;
    z-index: 9999;
    backdrop-filter: blur(2px);
  }
  .pp-overlay.pp-open { display: flex; }
  .pp-modal {
    width: min(560px, 92vw); max-height: 88vh;
    background: #1e293b;
    border: 1px solid #475569;
    border-radius: 8px;
    display: flex; flex-direction: column;
    box-shadow: 0 20px 60px rgba(0,0,0,0.6);
    color: #f1f5f9;
    font-family: -apple-system, system-ui, sans-serif;
  }
  .pp-header {
    display: flex; justify-content: space-between; align-items: flex-start;
    padding: 14px 16px 10px;
    border-bottom: 1px solid #334155;
  }
  .pp-title { font-weight: 600; font-size: 0.95rem; }
  .pp-subtitle { font-size: 0.72rem; color: #94a3b8; margin-top: 2px; }
  .pp-close {
    background: transparent; border: none; color: #94a3b8;
    font-size: 1.4rem; line-height: 1; cursor: pointer; padding: 0 4px;
  }
  .pp-close:hover { color: #f1f5f9; }
  .pp-tabs {
    display: flex; gap: 4px; padding: 8px 16px 0;
    border-bottom: 1px solid #334155;
  }
  .pp-tab {
    background: transparent; border: 1px solid transparent;
    border-bottom: none;
    color: #94a3b8;
    padding: 6px 12px; font-size: 0.78rem; font-weight: 500;
    border-radius: 6px 6px 0 0;
    cursor: pointer;
    margin-bottom: -1px;
  }
  .pp-tab:hover { background: #334155; color: #f1f5f9; }
  .pp-tab-active {
    background: #334155;
    color: #f1f5f9;
    border-color: #475569;
    border-bottom-color: #334155;
  }
  .pp-tab-count {
    display: inline-block;
    background: rgba(168,85,247,0.2);
    color: #c4b5fd;
    border-radius: 8px;
    padding: 0 6px;
    font-size: 0.65rem; font-weight: 600;
    margin-left: 4px;
  }
  .pp-search {
    margin: 10px 16px 0;
    background: #0f172a;
    border: 1px solid #334155;
    border-radius: 4px;
    color: #f1f5f9;
    padding: 7px 10px; font-size: 0.78rem;
    font-family: inherit;
  }
  .pp-search:focus { outline: 1px solid #a855f7; }
  .pp-body {
    flex: 1; overflow-y: auto;
    padding: 8px 16px;
  }
  .pp-section { margin-bottom: 14px; }
  .pp-used-section .pp-section-title { color: #fbbf24; }
  .pp-section-title {
    font-size: 0.68rem; font-weight: 600;
    color: #94a3b8;
    text-transform: uppercase; letter-spacing: 0.5px;
    margin: 8px 0 6px;
  }
  .pp-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
    gap: 4px;
  }
  .pp-item {
    background: #0f172a;
    border: 1px solid #334155;
    border-radius: 4px;
    padding: 6px 8px;
    font-family: 'SF Mono', Consolas, monospace;
    font-size: 0.72rem;
    color: #cbd5e1;
    cursor: pointer;
    text-align: center;
    transition: all 0.12s;
  }
  .pp-item:hover {
    background: #334155;
    border-color: #a855f7;
    color: #f1f5f9;
  }
  .pp-item.pp-item-used {
    border-color: rgba(251,191,36,0.4);
    background: rgba(251,191,36,0.06);
  }
  .pp-item.pp-item-current {
    background: #a855f7;
    border-color: #a855f7;
    color: white;
    font-weight: 600;
  }
  .pp-item-empty {
    grid-column: 1 / -1;
    text-align: center; padding: 20px;
    color: #64748b; font-style: italic; font-size: 0.78rem;
  }
  .pp-footer {
    display: flex; justify-content: flex-end; gap: 8px;
    padding: 12px 16px;
    border-top: 1px solid #334155;
  }
  .pp-btn {
    padding: 7px 14px;
    border-radius: 4px;
    font-size: 0.78rem; font-weight: 500;
    cursor: pointer;
    border: 1px solid transparent;
    font-family: inherit;
  }
  .pp-btn-secondary {
    background: transparent; color: #cbd5e1; border-color: #475569;
  }
  .pp-btn-secondary:hover { background: #334155; }
  .pp-btn-warning {
    background: rgba(251,191,36,0.15); color: #fbbf24; border-color: #fbbf24;
  }
  .pp-btn-warning:hover { background: rgba(251,191,36,0.25); }
  .pp-btn-primary {
    background: #a855f7; color: white;
  }
  .pp-btn-primary:hover { background: #9333ea; }
  .pp-btn-primary:disabled {
    background: #475569; color: #94a3b8; cursor: not-allowed;
  }
  `;
  // Inject into DOM
  const styleEl = document.createElement('style');
  styleEl.textContent = cssText;
  document.head.appendChild(styleEl);
  const wrapper = document.createElement('div');
  wrapper.innerHTML = modalHtml;
  document.body.appendChild(wrapper.firstElementChild);

  // ─── Helpers ────────────────────────────────────────────────────────────
  // Get all profile names available in catalog
  function getCatalog() {
    if (!window.Profile || !window.Profile.allProfiles) return { L: [], FB: [], HP: [], T: [] };
    return {
      L:  window.Profile.allProfiles(['L']).map(p => p.name),
      FB: window.Profile.allProfiles(['FB']).map(p => p.name),
      HP: window.Profile.allProfiles(['HP']).map(p => p.name),
      T:  window.Profile.allProfiles(['T']).map(p => p.name),
    };
  }
  // Determine the profile family from a name string
  function familyOf(name) {
    if (!name) return null;
    const m = String(name).match(/^([A-Z]+)\s/);
    return m ? m[1] : null;
  }
  // Collect all profile names currently in use anywhere in the structure
  function getUsedProfiles() {
    const used = new Set();
    const D = window.Draw;
    if (!D || !D.profiles) return [];
    // Per-stiff overrides
    Object.keys(D.profiles).forEach(grp => {
      const arr = D.profiles[grp];
      if (Array.isArray(arr)) {
        arr.forEach(p => { if (p && p.profileName) used.add(p.profileName); });
      }
    });
    // Group default selects on the scantling page
    const groupSelectIds = [
      'bottomLongProfile','ibLongProfile','sideLongProfile','isLongProfile',
      'deckLongProfile','strDeckProfile','twnDeckProfile','coamingProfile'
    ];
    groupSelectIds.forEach(id => {
      const el = document.getElementById(id);
      if (el && el.value) used.add(el.value);
    });
    // Transverse stiffeners
    if (D.TRANSVERSE_STIFFS) {
      D.TRANSVERSE_STIFFS.forEach(s => { if (s.profileName) used.add(s.profileName); });
    }
    return Array.from(used);
  }

  // ─── Modal state ────────────────────────────────────────────────────────
  const overlay   = document.getElementById('profilePickerOverlay');
  const titleEl   = document.getElementById('ppTitle');
  const subEl     = document.getElementById('ppSubtitle');
  const tabsEl    = overlay.querySelectorAll('.pp-tab');
  const searchEl  = document.getElementById('ppSearch');
  const usedSec   = document.getElementById('ppUsedSection');
  const usedList  = document.getElementById('ppUsedList');
  const catList   = document.getElementById('ppCatalogList');
  const catTitle  = document.getElementById('ppCatalogTitle');
  const okBtn     = document.getElementById('ppOk');
  const clearBtn  = document.getElementById('ppClear');
  const cancelBtn = document.getElementById('ppCancel');
  const closeBtn  = document.getElementById('ppClose');

  let _currentTab     = 'all';
  let _currentValue   = null;     // pre-selected profile when modal opened
  let _selectedValue  = null;     // user's current pick
  let _resolveFn      = null;     // outer Promise resolver

  function setTabCounts(catalog) {
    overlay.querySelectorAll('[data-pp-count]').forEach(el => {
      const fam = el.getAttribute('data-pp-count');
      el.textContent = catalog[fam] ? catalog[fam].length : 0;
    });
  }

  function renderItems() {
    const catalog = getCatalog();
    const used = new Set(getUsedProfiles());
    const search = (searchEl.value || '').trim().toLowerCase();
    setTabCounts(catalog);

    // Build the list of names for the active tab
    let names;
    if (_currentTab === 'all') {
      names = [].concat(catalog.FB, catalog.HP, catalog.L, catalog.T);
    } else {
      names = catalog[_currentTab] || [];
    }
    if (search) names = names.filter(n => n.toLowerCase().includes(search));

    // Used section — only show items in the current tab that are in use
    const usedInTab = names.filter(n => used.has(n));
    if (usedInTab.length > 0) {
      usedSec.style.display = '';
      usedList.innerHTML = usedInTab.map(renderItem).join('');
    } else {
      usedSec.style.display = 'none';
    }

    // Catalog section — everything in the tab (excluding used to avoid dup)
    const catalogShown = names.filter(n => !used.has(n));
    if (catalogShown.length === 0) {
      catList.innerHTML = `<div class="pp-item-empty">${search ? 'No matches.' : 'Catalog empty for this tab.'}</div>`;
    } else {
      catList.innerHTML = catalogShown.map(renderItem).join('');
    }
    catTitle.textContent = `Catalog · ${catalogShown.length} of ${names.length}`;

    // Wire up clicks
    overlay.querySelectorAll('.pp-item').forEach(el => {
      el.addEventListener('click', () => {
        const v = el.getAttribute('data-pp-value');
        _selectedValue = v;
        // Refresh "current" highlight
        overlay.querySelectorAll('.pp-item-current').forEach(x => x.classList.remove('pp-item-current'));
        el.classList.add('pp-item-current');
        okBtn.disabled = false;
      });
      el.addEventListener('dblclick', () => {
        const v = el.getAttribute('data-pp-value');
        _selectedValue = v;
        finish(v);
      });
    });
  }

  function renderItem(name) {
    const used = getUsedProfiles().includes(name);
    const isCurrent = name === _selectedValue;
    const cls = ['pp-item'];
    if (used) cls.push('pp-item-used');
    if (isCurrent) cls.push('pp-item-current');
    return `<div class="${cls.join(' ')}" data-pp-value="${name}" title="${name}">${name}</div>`;
  }

  function setActiveTab(tab) {
    _currentTab = tab;
    tabsEl.forEach(t => {
      t.classList.toggle('pp-tab-active', t.getAttribute('data-pp-tab') === tab);
    });
    renderItems();
  }

  tabsEl.forEach(t => {
    t.addEventListener('click', () => setActiveTab(t.getAttribute('data-pp-tab')));
  });
  searchEl.addEventListener('input', renderItems);
  okBtn.addEventListener('click',     () => finish(_selectedValue));
  clearBtn.addEventListener('click',  () => finish(''));
  cancelBtn.addEventListener('click', () => finish(null));
  closeBtn.addEventListener('click',  () => finish(null));
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) finish(null);
  });
  document.addEventListener('keydown', (e) => {
    if (overlay.classList.contains('pp-open')) {
      if (e.key === 'Escape') { finish(null); e.preventDefault(); }
      else if (e.key === 'Enter' && _selectedValue != null) {
        finish(_selectedValue); e.preventDefault();
      }
    }
  });

  function finish(v) {
    overlay.classList.remove('pp-open');
    overlay.setAttribute('aria-hidden', 'true');
    const fn = _resolveFn;
    _resolveFn = null;
    if (fn) fn(v);   // null = cancel, '' = clear, string = pick
  }

  // Public API
  window.openProfilePicker = function(currentValue, opts) {
    opts = opts || {};
    return new Promise(resolve => {
      _resolveFn      = resolve;
      _currentValue   = currentValue || null;
      _selectedValue  = currentValue || null;
      titleEl.textContent = opts.title || 'Select profile';
      subEl.textContent   = opts.context || '';
      clearBtn.style.display = opts.allowEmpty ? '' : 'none';
      searchEl.value = '';
      okBtn.disabled = !_selectedValue;
      // Pick initial tab based on current value's family
      const fam = familyOf(currentValue);
      setActiveTab(fam && ['FB','HP','L','T'].includes(fam) ? fam : 'all');
      overlay.classList.add('pp-open');
      overlay.setAttribute('aria-hidden', 'false');
      // Focus search after open
      setTimeout(() => searchEl.focus(), 50);
    });
  };
})();

// ==========================================================================
// Hook the profile picker into every existing <select> that lists profiles.
// We use a DOCUMENT-LEVEL mousedown delegate so dynamically-rendered selects
// (e.g. the per-row stiffener dropdown that's rebuilt on every renderEditor)
// also work. mousedown is preferred over click because it fires BEFORE the
// browser's native dropdown opens.
// ==========================================================================
(function attachProfilePickerToSelects() {
  // Selectors that identify "this <select> picks a profile"
  const MATCH_SELECTORS = [
    '#bottomLongProfile', '#ibLongProfile', '#sideLongProfile',
    '#isLongProfile', '#deckLongProfile', '#strDeckProfile',
    '#twnDeckProfile', '#coamingProfile',
    '.ed-profile-row-select', '.ts-profile-name'
  ];
  // CSS class added so we can also style hooked selects (chevron etc.)
  document.addEventListener('mousedown', function(ev) {
    const t = ev.target;
    if (!t || t.tagName !== 'SELECT') return;
    // Match any of the known profile-select selectors
    let matched = false;
    for (const sel of MATCH_SELECTORS) {
      try { if (t.matches(sel)) { matched = true; break; } } catch(_) {}
    }
    if (!matched) return;
    // Suppress native dropdown
    ev.preventDefault();
    ev.stopPropagation();
    // Determine context label for the modal
    const ctxMap = {
      bottomLongProfile: 'Bottom Shell Long',
      ibLongProfile:     'Inner Bottom Long',
      sideLongProfile:   'Side Shell Long',
      isLongProfile:     'Inner Side Long',
      deckLongProfile:   'Upper Deck Long',
      strDeckProfile:    'Stringer Deck Long',
      twnDeckProfile:    'Tween Deck Long',
      coamingProfile:    'Coaming Long',
    };
    let ctx = ctxMap[t.id] || '';
    if (t.classList.contains('ed-profile-row-select')) {
      const grp = t.getAttribute('data-edit-group') || '';
      const idx = t.getAttribute('data-edit-idx');
      ctx = `${grp} stiffener ${idx != null ? '#' + (parseInt(idx)+1) : ''}`;
    } else if (t.classList.contains('ts-profile-name')) {
      const idx = t.getAttribute('data-ts-idx');
      ctx = `Transverse stiff ${idx != null ? '#' + (parseInt(idx)+1) : ''}`;
    }
    const currentVal = t.value || '';
    window.openProfilePicker(currentVal, {
      title: 'Select profile',
      context: ctx,
      allowEmpty: t.classList.contains('ed-profile-row-select'),  // per-row can be cleared
    }).then(v => {
      if (v == null) return;   // cancelled
      // Set value (add option if missing — value may not be in the original options)
      let found = false;
      for (let i = 0; i < t.options.length; i++) {
        if (t.options[i].value === v) { found = true; break; }
      }
      if (!found && v) {
        const opt = document.createElement('option');
        opt.value = v; opt.textContent = v;
        t.appendChild(opt);
      }
      t.value = v;
      // Fire change event so existing listeners (recalcAll, etc.) run
      t.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }, true);  // capture phase — beats native handler
  // Also block keyboard-opens (Space / Alt+Down) for these selects: the user
  // pressing those should also trigger our modal, not the native dropdown.
  document.addEventListener('keydown', function(ev) {
    const t = ev.target;
    if (!t || t.tagName !== 'SELECT') return;
    let matched = false;
    for (const sel of MATCH_SELECTORS) {
      try { if (t.matches(sel)) { matched = true; break; } } catch(_) {}
    }
    if (!matched) return;
    if (ev.key === ' ' || (ev.altKey && ev.key === 'ArrowDown') || ev.key === 'Enter') {
      ev.preventDefault();
      t.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    }
  }, true);
})();
