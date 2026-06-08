// extension/options/options.js

const toggleBadge = document.getElementById('toggle-badge');
const toggleOverlay = document.getElementById('toggle-overlay');
const btnResetDismiss = document.getElementById('btn-reset-dismiss');
const metadataEl = document.getElementById('metadata');

function setToggle(el, active) {
  el.classList.toggle('active', active);
}

function initToggle(el, key) {
  el.addEventListener('click', () => {
    const isActive = el.classList.contains('active');
    const newValue = !isActive;
    setToggle(el, newValue);
    chrome.storage.local.set({ [key]: newValue });
  });
}

// Load settings
chrome.storage.local.get(
  ['badgeEnabled', 'overlayEnabled', 'overlayPermanentlyDismissed'],
  (result) => {
    setToggle(toggleBadge, result.badgeEnabled !== false);
    setToggle(toggleOverlay, result.overlayEnabled !== false);
  }
);

initToggle(toggleBadge, 'badgeEnabled');
initToggle(toggleOverlay, 'overlayEnabled');

// Reset dismiss state
btnResetDismiss.addEventListener('click', () => {
  chrome.storage.local.set({ overlayPermanentlyDismissed: false });
  btnResetDismiss.textContent = '已重置';
  setTimeout(() => { btnResetDismiss.textContent = '重置'; }, 1500);
});

// Load metadata
fetch(chrome.runtime.getURL('data/metadata.json'))
  .then((res) => res.json())
  .then((meta) => {
    metadataEl.innerHTML = `
      <div>映射数据版本：${meta.buildTime.split('T')[0]}</div>
      <div>覆盖包数量：${(meta.formulaCount + meta.caskCount).toLocaleString()}</div>
      <div>覆盖域名数：${meta.domainCount.toLocaleString()}</div>
    `;
  })
  .catch(() => {
    metadataEl.innerHTML = '<div>无法加载元数据</div>';
  });
