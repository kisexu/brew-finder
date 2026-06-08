// extension/popup/popup.js

const contentEl = document.getElementById('bf-content');
const urlEl = document.getElementById('bf-current-url');

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function renderMatches(matches, currentUrl) {
  if (!matches || matches.length === 0) {
    contentEl.innerHTML = `
      <div class="bf-empty">
        <div class="bf-empty-icon">🔍</div>
        <div>当前网站未找到 Homebrew 包</div>
      </div>
    `;
    return;
  }

  contentEl.innerHTML = matches.map((m) => `
    <div class="bf-package">
      <div class="bf-package-header">
        <span class="bf-package-name">${escapeHtml(m.name)}</span>
        <span class="bf-type-badge ${m.type}">${escapeHtml(m.type)}</span>
      </div>
      <div class="bf-package-desc">${escapeHtml(m.desc)}</div>
      <div class="bf-command-row">
        <code class="bf-command">brew install ${escapeHtml(m.name)}</code>
        <button class="bf-copy" data-cmd="brew install ${escapeHtml(m.name)}">📋</button>
      </div>
    </div>
  `).join('');

  // Add copy button listeners
  contentEl.querySelectorAll('.bf-copy').forEach((btn) => {
    btn.addEventListener('click', () => {
      const cmd = btn.dataset.cmd;
      navigator.clipboard.writeText(cmd).then(() => {
        btn.textContent = '✓';
        setTimeout(() => { btn.textContent = '📋'; }, 1500);
      });
    });
  });
}

// Get current tab info and request match
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  if (!tabs[0]) return;
  const tab = tabs[0];

  urlEl.textContent = `当前页面：${new URL(tab.url).hostname}`;

  chrome.runtime.sendMessage({ type: 'GET_CURRENT_MATCH' }, (response) => {
    if (chrome.runtime.lastError || !response) {
      renderMatches([], tab.url);
      return;
    }
    renderMatches(response.matches, tab.url);
  });
});
