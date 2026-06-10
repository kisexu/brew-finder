// extension/options/options.js

const toggleBadge = document.getElementById('toggle-badge');
const toggleOverlay = document.getElementById('toggle-overlay');
const btnResetDismiss = document.getElementById('btn-reset-dismiss');
const languageSelect = document.getElementById('language-select');
const metadataEl = document.getElementById('metadata');

let currentI18n = null;

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
    metadataEl.innerHTML = `
      <div>${escapeHtml(i18n.t('optionsMetadataVersion', [meta.buildTime.split('T')[0]]))}</div>
      <div>${escapeHtml(i18n.t('optionsMetadataPackageCount', [(meta.formulaCount + meta.caskCount).toLocaleString(locale)]))}</div>
      <div>${escapeHtml(i18n.t('optionsMetadataDomainCount', [meta.domainCount.toLocaleString(locale)]))}</div>
    `;
  } catch {
    metadataEl.innerHTML = `<div>${escapeHtml(i18n.t('optionsMetadataError'))}</div>`;
  }
}

async function renderLocalizedOptions(selectedValue) {
  currentI18n = await BrewFinderI18n.createI18n();
  currentI18n.localizeDocument(document);
  populateLanguageSelect(currentI18n, selectedValue);
  await renderMetadata(currentI18n);
}

async function initOptions() {
  const result = await getStorage([
    'badgeEnabled',
    'overlayEnabled',
    'overlayPermanentlyDismissed',
    'languageOverride',
  ]);
  const selectedLanguage = BrewFinderI18n.normalizeLocale(result.languageOverride);

  setToggle(toggleBadge, result.badgeEnabled !== false);
  setToggle(toggleOverlay, result.overlayEnabled !== false);
  initToggle(toggleBadge, 'badgeEnabled');
  initToggle(toggleOverlay, 'overlayEnabled');

  await renderLocalizedOptions(selectedLanguage);

  btnResetDismiss.addEventListener('click', () => {
    chrome.storage.local.set({ overlayPermanentlyDismissed: false });
    btnResetDismiss.textContent = currentI18n.t('optionsResetDone');
    setTimeout(() => { btnResetDismiss.textContent = currentI18n.t('optionsResetButton'); }, 1500);
  });

  languageSelect.addEventListener('change', async () => {
    const nextLanguage = BrewFinderI18n.normalizeLocale(languageSelect.value);
    await setStorage({ languageOverride: nextLanguage });
    await renderLocalizedOptions(nextLanguage);
  });
}

initOptions();
