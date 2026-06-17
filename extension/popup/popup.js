// extension/popup/popup.js

const contentEl = document.getElementById('bf-content');
const urlEl = document.getElementById('bf-current-url');
const settingsButton = document.getElementById('bf-settings-button');

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML.replace(/"/g, '&quot;');
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

function copyButtonHtml(command, i18n) {
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

function renderMatches(matches, i18n) {
  if (!matches || matches.length === 0) {
    contentEl.innerHTML = `
      <div class="bf-empty">
        <div>${escapeHtml(i18n.t('popupNoMatch'))}</div>
      </div>
    `;
    return;
  }

  contentEl.innerHTML = matches.map((match) => {
    const token = match.token || match.name || '';
    const command = `brew install ${token}`;

    return `
      <article class="bf-match-item">
        ${packageNameHtml(token)}
        <div class="bf-command-row">
          <code class="bf-command" dir="ltr">${escapeHtml(command)}</code>
          ${copyButtonHtml(command, i18n)}
        </div>
      </article>
    `;
  }).join('');

  contentEl.querySelectorAll('.bf-copy').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const cmd = btn.dataset.cmd;

      try {
        await navigator.clipboard.writeText(cmd);
        btn.classList.add('bf-is-copied');
        setTimeout(() => btn.classList.remove('bf-is-copied'), 2000);
      } catch {
        btn.classList.add('bf-copy-error');
        setTimeout(() => btn.classList.remove('bf-copy-error'), 1000);
      }
    });
  });
}

async function initPopup() {
  const i18n = await BrewFinderI18n.createI18n();
  i18n.localizeDocument(document);

  settingsButton.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0]) return;
    const tab = tabs[0];

    try {
      urlEl.textContent = i18n.t('popupCurrentPage', [new URL(tab.url).hostname]);
    } catch {
      urlEl.textContent = i18n.t('popupUnknownPage');
    }

    chrome.runtime.sendMessage({ type: 'GET_CURRENT_MATCH' }, (response) => {
      if (chrome.runtime.lastError || !response) {
        renderMatches([], i18n);
        return;
      }
      renderMatches(response.matches, i18n);
    });
  });
}

initPopup();
