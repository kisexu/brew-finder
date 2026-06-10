// extension/content/overlay.js

(async function () {
  const OVERLAY_ID = 'brew-finder-overlay';

  if (location.protocol === 'chrome:' || location.protocol === 'about:' || location.protocol === 'file:') {
    return;
  }

  const i18n = await BrewFinderI18n.createI18n();

  /**
   * Create and inject the overlay into the page.
   */
  function showOverlay(matches) {
    removeOverlay();

    const overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;
    overlay.dir = i18n.dir;
    overlay.lang = i18n.locale.replace('_', '-');

    const matchCards = matches.map((m) => {
      const command = `brew install ${m.name}`;
      return `
        <div style="margin-bottom: 6px;">
          <div class="bf-desc">${escapeHtml(m.desc)}</div>
          <div class="bf-command-row">
            <code class="bf-command" dir="ltr">brew install ${escapeHtml(m.name)}</code>
            <button class="bf-copy" title="${escapeHtml(i18n.t('copyCommandTitle'))}" data-cmd="${escapeHtml(command)}">📋</button>
          </div>
        </div>
      `;
    }).join('');

    overlay.innerHTML = `
      <div class="bf-header">
        <div class="bf-title">🍺 Brew Finder</div>
        <button class="bf-close" title="${escapeHtml(i18n.t('overlayCloseTitle'))}">✕</button>
      </div>
      <div class="bf-body">${escapeHtml(i18n.t('overlayInstallable'))}</div>
      ${matchCards}
    `;

    document.body.appendChild(overlay);

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

    if (overlay.querySelector('.bf-dismiss-confirm')) {
      removeOverlay();
      return;
    }

    const confirm = document.createElement('div');
    confirm.className = 'bf-dismiss-confirm';
    confirm.innerHTML = `
      <div>${escapeHtml(i18n.t('overlayDismissQuestion'))}</div>
      <div class="bf-dismiss-actions">
        <button class="bf-dismiss-btn" id="bf-dismiss-once">${escapeHtml(i18n.t('overlayDismissOnce'))}</button>
        <button class="bf-dismiss-btn permanent" id="bf-dismiss-forever">${escapeHtml(i18n.t('overlayDismissForever'))}</button>
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

  chrome.runtime.sendMessage({ type: 'MATCH_URL', url: location.href }, (response) => {
    if (chrome.runtime.lastError) return; // SW not ready
    if (!response || !response.matches || response.matches.length === 0) return;

    chrome.storage.local.get(['overlayEnabled', 'overlayPermanentlyDismissed'], (settings) => {
      if (settings.overlayEnabled === false) return;
      if (settings.overlayPermanentlyDismissed === true) return;
      showOverlay(response.matches);
    });
  });
})();
