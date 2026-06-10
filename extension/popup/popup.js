// extension/popup/popup.js

const contentEl = document.getElementById('bf-content');
const urlEl = document.getElementById('bf-current-url');

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML.replace(/"/g, '&quot;');
}

function renderMatches(matches, i18n) {
  if (!matches || matches.length === 0) {
    contentEl.innerHTML = `
      <div class="bf-empty">
        <div class="bf-empty-icon">🔍</div>
        <div>${escapeHtml(i18n.t('popupNoMatch'))}</div>
      </div>
    `;
    return;
  }

  contentEl.innerHTML = matches.map((m) => {
    const command = `brew install ${m.name}`;
    return `
      <div class="bf-package">
        <div class="bf-package-header">
          <span class="bf-package-name">${escapeHtml(m.name)}</span>
          <span class="bf-type-badge ${escapeHtml(m.type)}">${escapeHtml(m.type)}</span>
        </div>
        <div class="bf-package-desc">${escapeHtml(m.desc)}</div>
        <div class="bf-command-row">
          <code class="bf-command">brew install ${escapeHtml(m.name)}</code>
          <button class="bf-copy" title="${escapeHtml(i18n.t('copyCommandTitle'))}" data-cmd="${escapeHtml(command)}">📋</button>
        </div>
      </div>
    `;
  }).join('');

  contentEl.querySelectorAll('.bf-copy').forEach((btn) => {
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

async function initPopup() {
  const i18n = await BrewFinderI18n.createI18n();
  i18n.localizeDocument(document);

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
