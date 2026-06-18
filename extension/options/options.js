// extension/options/options.js

const toggleBadge = document.getElementById('toggle-badge');
const toggleOverlay = document.getElementById('toggle-overlay');
const overlayDescription = document.getElementById('overlay-description');
const resetOverlaySites = document.getElementById('reset-overlay-sites');
const languageSelect = document.getElementById('language-select');
const metadataEl = document.getElementById('metadata');
const appVersion = document.getElementById('app-version');

let currentI18n = null;
let overlayEnabled = true;
let overlayDismissedDomains = [];

function setToggle(el, active) {
  el.classList.toggle('active', active);
  el.setAttribute('aria-pressed', String(active));
}

function initToggle(el, key, onChange) {
  el.addEventListener('click', () => {
    const isActive = el.classList.contains('active');
    const newValue = !isActive;
    setToggle(el, newValue);
    chrome.storage.local.set({ [key]: newValue }, () => {
      if (onChange) onChange(newValue);
    });
  });
}

function getStorage(keys) {
  return new Promise((resolve) => {
    chrome.storage.local.get(keys, resolve);
  });
}

function setStorage(items) {
  return new Promise((resolve) => {
    chrome.storage.local.set(items, resolve);
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML.replace(/"/g, '&quot;');
}

function splitMetadataLine(text) {
  const separatorIndex = text.search(/[:：]/);
  if (separatorIndex === -1) {
    return { label: text, value: '' };
  }

  return {
    label: text.slice(0, separatorIndex),
    value: text.slice(separatorIndex + 1).trim(),
  };
}

function metadataCardHtml(text) {
  const { label, value } = splitMetadataLine(text);

  return `
    <article class="status-card">
      <div class="status-label">${escapeHtml(label)}</div>
      <div class="status-value">${escapeHtml(value)}</div>
    </article>
  `;
}

function renderAppVersion() {
  const version = chrome.runtime?.getManifest?.().version || '';
  appVersion.textContent = version ? `v${version}` : '';
  appVersion.hidden = !version;
}

function normalizeDismissedDomains(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return [...new Set(value.filter((domain) => typeof domain === 'string' && domain.trim()))];
}

function renderOverlayPreference() {
  if (!currentI18n) {
    return;
  }

  const isEnabled = overlayEnabled !== false;
  setToggle(toggleOverlay, isEnabled);
  overlayDescription.textContent = currentI18n.t(
    isEnabled ? 'optionsOverlayActiveDescription' : 'optionsOverlayDescription'
  );
  resetOverlaySites.hidden = !isEnabled;
  resetOverlaySites.disabled = overlayDismissedDomains.length === 0;
}

function populateLanguageSelect(i18n, selectedValue) {
  languageSelect.innerHTML = BrewFinderI18n.LANGUAGE_OPTIONS.map((option) => {
    const label = option.labelKey ? i18n.t(option.labelKey) : option.label;
    return `<option value="${escapeHtml(option.value)}">${escapeHtml(label)}</option>`;
  }).join('');
  languageSelect.value = selectedValue;
}

async function renderMetadata(i18n) {
  try {
    const res = await fetch(chrome.runtime.getURL('data/metadata.json'));
    const meta = await res.json();
    const locale = i18n.locale.replace('_', '-');
    const cards = [
      i18n.t('optionsMetadataVersion', [meta.buildTime.split('T')[0]]),
      i18n.t('optionsMetadataPackageCount', [(meta.formulaCount + meta.caskCount).toLocaleString(locale)]),
      i18n.t('optionsMetadataDomainCount', [meta.domainCount.toLocaleString(locale)]),
    ];

    metadataEl.innerHTML = cards.map(metadataCardHtml).join('');
  } catch {
    metadataEl.innerHTML = metadataCardHtml(i18n.t('optionsMetadataError'));
  }
}

async function renderLocalizedOptions(selectedValue) {
  currentI18n = await BrewFinderI18n.createI18n();
  currentI18n.localizeDocument(document);
  populateLanguageSelect(currentI18n, selectedValue);
  await renderMetadata(currentI18n);
}

async function initOptions() {
  renderAppVersion();

  const result = await getStorage([
    'badgeEnabled',
    'overlayEnabled',
    'overlayDismissedDomains',
    'languageOverride',
  ]);
  const selectedLanguage = BrewFinderI18n.normalizeLocale(result.languageOverride);

  overlayEnabled = result.overlayEnabled !== false;
  overlayDismissedDomains = normalizeDismissedDomains(result.overlayDismissedDomains);

  setToggle(toggleBadge, result.badgeEnabled !== false);
  initToggle(toggleBadge, 'badgeEnabled');
  initToggle(toggleOverlay, 'overlayEnabled', (newValue) => {
    overlayEnabled = newValue;
    renderOverlayPreference();
  });

  resetOverlaySites.addEventListener('click', async () => {
    overlayDismissedDomains = [];
    await setStorage({ overlayDismissedDomains: [] });
    renderOverlayPreference();
  });

  await renderLocalizedOptions(selectedLanguage);
  renderOverlayPreference();

  languageSelect.addEventListener('change', async () => {
    const nextLanguage = BrewFinderI18n.normalizeLocale(languageSelect.value);
    await setStorage({ languageOverride: nextLanguage });
    await renderLocalizedOptions(nextLanguage);
    renderOverlayPreference();
  });
}

initOptions();
