/* ==========================================================================
   99-info-overlay.js  —  floating info overlay (drag + show/hide)
   Extracted from Index.html lines 33729–33785.
   ========================================================================== */
/* ============================================================================
   FLOATING INFO OVERLAY — drag + show/hide controls
   The overlay panel inside #svgContainer mirrors the left sidebar's
   #ruleMinInfoPanel content (hooked from renderRuleMinInfoPanel). This block
   only handles UX: dragging by header, close button, and a small "● Info"
   pill that re-opens the overlay when it's hidden.
============================================================================ */
(function setupInfoOverlay(){
  const overlay = document.getElementById('infoOverlay');
  const header  = document.getElementById('infoOverlayHeader');
  const closeBt = document.getElementById('infoOverlayClose');
  const showBt  = document.getElementById('infoOverlayShowBtn');
  if (!overlay || !header || !closeBt || !showBt) return;

  // ---- Show / Hide ----
  closeBt.addEventListener('click', (e) => {
    e.stopPropagation();
    overlay.style.display = 'none';
    showBt.style.display  = 'inline-flex';
  });
  showBt.addEventListener('click', (e) => {
    e.stopPropagation();
    overlay.style.display = 'block';
    showBt.style.display  = 'none';
  });

  // ---- Drag (header only) ----
  let dragging = false, startX = 0, startY = 0, startLeft = 0, startTop = 0;
  header.addEventListener('mousedown', (e) => {
    // Don't start a drag when the close-button is clicked.
    if (e.target.closest('#infoOverlayClose')) return;
    dragging = true;
    const r = overlay.getBoundingClientRect();
    startX = e.clientX; startY = e.clientY;
    startLeft = r.left; startTop = r.top;
    // Switch to fixed positioning during drag for free movement, but keep it
    // visually within the svg container by clamping to its bounds on release.
    overlay.style.transition = 'none';
    e.preventDefault();
  });
  document.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const container = document.getElementById('svgContainer');
    if (!container) return;
    const cRect = container.getBoundingClientRect();
    let nx = startLeft + (e.clientX - startX) - cRect.left;
    let ny = startTop  + (e.clientY - startY) - cRect.top;
    // Clamp so the overlay never escapes the drawing area.
    const maxX = cRect.width  - overlay.offsetWidth  - 4;
    const maxY = cRect.height - overlay.offsetHeight - 4;
    nx = Math.max(4, Math.min(nx, maxX));
    ny = Math.max(4, Math.min(ny, maxY));
    overlay.style.left = nx + 'px';
    overlay.style.top  = ny + 'px';
  });
  document.addEventListener('mouseup', () => { dragging = false; });
})();
