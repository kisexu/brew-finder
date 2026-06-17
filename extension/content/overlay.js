// extension/content/overlay.js

(async function () {
  const OVERLAY_ID = 'brew-finder-overlay';

  if (location.protocol === 'chrome:' || location.protocol === 'about:' || location.protocol === 'file:') {
    return;
  }

  const i18n = await BrewFinderI18n.createI18n();
  const appIconUrl = chrome.runtime.getURL('icons/icon-128.png');

  function appIconHtml(className = 'bf-app-icon') {
    return `<img class="${className}" src="${escapeHtml(appIconUrl)}" alt="" aria-hidden="true">`;
  }

  function copyIconSvg() {
    return `
      <svg class="bf-icon-copy" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true">
        <rect x="9" y="9" width="13" height="13"></rect>
        <path d="M5 15H4V4h9v1"></path>
      </svg>
    `;
  }

  function checkIconSvg() {
    return `
      <svg class="bf-icon-check" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true">
        <polyline points="20 6 9 17 4 12"></polyline>
      </svg>
    `;
  }

  function closeIconSvg() {
    return `
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true">
        <line x1="13" y1="1" x2="1" y2="13"></line>
        <line x1="1" y1="1" x2="13" y2="13"></line>
      </svg>
    `;
  }

  function copyButtonHtml(command) {
    return `
      <button class="bf-copy" type="button" title="${escapeHtml(i18n.t('copyCommandTitle'))}" aria-label="${escapeHtml(i18n.t('copyCommandTitle'))}" data-cmd="${escapeHtml(command)}">
        ${copyIconSvg()}
        ${checkIconSvg()}
      </button>
    `;
  }

  function packageLabelFromToken(token) {
    const safeToken = token || '';
    const atIndex = safeToken.indexOf('@');

    if (atIndex <= 0 || atIndex === safeToken.length - 1) {
      return { name: safeToken, badge: '' };
    }

    return {
      name: safeToken.slice(0, atIndex),
      badge: safeToken.slice(atIndex + 1),
    };
  }

  function packageNameHtml(token) {
    const label = packageLabelFromToken(token);
    const badge = label.badge
      ? `<span class="bf-token-badge">${escapeHtml(label.badge)}</span>`
      : '';

    return `
      <div class="bf-name-line" dir="ltr">
        <span class="bf-name">${escapeHtml(label.name)}</span>
        ${badge}
      </div>
    `;
  }

  function matchRowHtml(match) {
    const token = match.token || match.name || '';
    const command = BrewFinderCommand.installCommandFor(match);

    return `
      <article class="bf-match-item">
        ${packageNameHtml(token)}
        <div class="bf-command-row">
          <code class="bf-command" dir="ltr">${escapeHtml(command)}</code>
          ${copyButtonHtml(command)}
        </div>
      </article>
    `;
  }

  /**
   * Create and inject the overlay into the page.
   */
  function showOverlay(matches) {
    removeOverlay();

    const overlay = document.createElement('section');
    overlay.id = OVERLAY_ID;
    overlay.dir = i18n.dir;
    overlay.lang = i18n.locale.replace('_', '-');
    overlay.setAttribute('aria-label', 'Brew Finder');

    overlay.innerHTML = `
      <div class="bf-header">
        <div class="bf-title">
          ${appIconHtml()}
          <span>Brew Finder</span>
        </div>
        <button class="bf-close" type="button" title="${escapeHtml(i18n.t('overlayCloseTitle'))}" aria-label="${escapeHtml(i18n.t('overlayCloseTitle'))}">
          ${closeIconSvg()}
        </button>
      </div>
      <div class="bf-install-note">
        <span>${escapeHtml(i18n.t('overlayInstallable'))}</span>
      </div>
      <div class="bf-match-list">
        ${matches.map(matchRowHtml).join('')}
      </div>
      <div class="bf-dismiss-dialog bf-hidden" role="dialog" aria-modal="true" aria-labelledby="bf-dismiss-title" aria-describedby="bf-dismiss-description">
        <div class="bf-dismiss-panel">
          <h2 id="bf-dismiss-title">${escapeHtml(i18n.t('overlayDismissQuestion'))}</h2>
          <p id="bf-dismiss-description">${escapeHtml(i18n.t('overlayDismissDescription'))}</p>
          <div class="bf-dismiss-actions">
            <button class="bf-dismiss-action bf-dismiss-once" type="button">${escapeHtml(i18n.t('overlayDismissOnce'))}</button>
            <button class="bf-dismiss-action bf-dismiss-forever" type="button">${escapeHtml(i18n.t('overlayDismissForever'))}</button>
          </div>
        </div>
      </div>
    `;

    document.body.append(overlay);

    overlay.querySelector('.bf-close').addEventListener('click', () => {
      handleCloseClick(overlay);
    });
    overlay.querySelector('.bf-dismiss-once').addEventListener('click', () => {
      dismissOverlay({ behavior: 'once' });
    });
    overlay.querySelector('.bf-dismiss-forever').addEventListener('click', () => {
      dismissOverlay({ permanent: true });
    });
    wireCopyButtons(overlay);
  }

  function handleCloseClick(overlay) {
    chrome.storage.local.get(['overlayDismissBehavior'], (settings) => {
      if (settings.overlayDismissBehavior === 'once') {
        dismissOverlay();
        return;
      }

      showDismissDialog(overlay);
    });
  }

  function showDismissDialog(overlay) {
    const dialog = overlay.querySelector('.bf-dismiss-dialog');
    dialog.classList.remove('bf-hidden');
    overlay.querySelector('.bf-dismiss-once').focus();
  }

  function dismissOverlay(options = {}) {
    chrome.runtime.sendMessage({ type: 'OVERLAY_DISMISSED', ...options }, () => {
      void chrome.runtime.lastError;
    });
    removeOverlay();
  }

  function wireCopyButtons(root) {
    root.querySelectorAll('.bf-copy').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const cmd = btn.dataset.cmd;

        try {
          await navigator.clipboard.writeText(cmd);
          setCopyState(btn, true);
          setTimeout(() => setCopyState(btn, false), 2000);
        } catch {
          btn.classList.add('bf-copy-error');
          setTimeout(() => btn.classList.remove('bf-copy-error'), 1000);
        }
      });
    });
  }

  function setCopyState(btn, copied) {
    btn.classList.toggle('bf-is-copied', copied);
  }

  function removeOverlay() {
    document.getElementById(OVERLAY_ID)?.remove();
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML.replace(/"/g, '&quot;');
  }

  chrome.runtime.sendMessage({ type: 'MATCH_URL', url: location.href }, (response) => {
    if (chrome.runtime.lastError) return; // SW not ready
    if (!response || !response.matches || response.matches.length === 0) return;

    chrome.storage.local.get(['overlayEnabled'], (settings) => {
      if (settings.overlayEnabled === false) return;
      showOverlay(response.matches);
    });
  });
})();
