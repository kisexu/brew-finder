// extension/content/overlay.js

(function () {
  const OVERLAY_ID = 'brew-finder-overlay';

  // Don't inject on special pages
  if (location.protocol === 'chrome:' || location.protocol === 'about:' || location.protocol === 'file:') {
    return;
  }

  /**
   * Create and inject the overlay into the page.
   */
  function showOverlay(matches) {
    // Remove existing overlay if any
    removeOverlay();

    const overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;

    // Build match cards
    const matchCards = matches.map((m) => `
      <div style="margin-bottom: 6px;">
        <div class="bf-desc">${escapeHtml(m.desc)}</div>
        <div class="bf-command-row">
          <code class="bf-command">brew install ${escapeHtml(m.name)}</code>
          <button class="bf-copy" data-cmd="brew install ${escapeHtml(m.name)}">📋</button>
        </div>
      </div>
    `).join('');

    overlay.innerHTML = `
      <div class="bf-header">
        <div class="bf-title">🍺 Brew Finder</div>
        <button class="bf-close" title="关闭">✕</button>
      </div>
      <div class="bf-body">此软件可通过 Homebrew 安装：</div>
      ${matchCards}
    `;

    document.body.appendChild(overlay);

    // Event listeners
    overlay.querySelector('.bf-close').addEventListener('click', handleClose);
    overlay.querySelectorAll('.bf-copy').forEach((btn) => {
      btn.addEventListener('click', () => {
        const cmd = btn.dataset.cmd;
        navigator.clipboard.writeText(cmd).then(() => {
          btn.textContent = '✓';
          setTimeout(() => { btn.textContent = '📋'; }, 1500);
        }).catch(() => {
          btn.textContent = '✗';
          setTimeout(() => { btn.textContent = '📋'; }, 1500);
        });
      });
    });
  }

  /**
   * Handle close button click — show dismiss confirmation.
   */
  function handleClose() {
    const overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) return;

    // Check if already showing dismiss confirm
    if (overlay.querySelector('.bf-dismiss-confirm')) {
      removeOverlay();
      return;
    }

    const confirm = document.createElement('div');
    confirm.className = 'bf-dismiss-confirm';
    confirm.innerHTML = `
      <div>是否永久关闭页面浮层？</div>
      <div class="bf-dismiss-actions">
        <button class="bf-dismiss-btn" id="bf-dismiss-once">仅本次</button>
        <button class="bf-dismiss-btn permanent" id="bf-dismiss-forever">永久关闭</button>
      </div>
    `;
    overlay.appendChild(confirm);

    document.getElementById('bf-dismiss-once').addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'OVERLAY_DISMISSED', permanent: false });
      removeOverlay();
    });

    document.getElementById('bf-dismiss-forever').addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'OVERLAY_DISMISSED', permanent: true });
      removeOverlay();
    });
  }

  function removeOverlay() {
    const existing = document.getElementById(OVERLAY_ID);
    if (existing) existing.remove();
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML.replace(/"/g, '&quot;');
  }

  // Request match from service worker
  chrome.runtime.sendMessage({ type: 'MATCH_URL', url: location.href }, (response) => {
    if (chrome.runtime.lastError) return; // SW not ready
    if (!response || !response.matches || response.matches.length === 0) return;

    // Check if overlay is enabled and not permanently dismissed
    chrome.storage.local.get(['overlayEnabled', 'overlayPermanentlyDismissed'], (settings) => {
      if (settings.overlayEnabled === false) return;
      if (settings.overlayPermanentlyDismissed === true) return;
      showOverlay(response.matches);
    });
  });
})();
