(function attachBrewFinderI18n(root) {
  const DEFAULT_LOCALE = 'en';
  const AUTO_LOCALE = 'auto';
  const SUPPORTED_LOCALES = [
    'en',
    'zh_CN',
    'zh_TW',
    'ja',
    'ko',
    'fr',
    'de',
    'es',
    'pt_PT',
    'it',
    'ru',
    'ar',
    'hi',
  ];

  const LANGUAGE_OPTIONS = [
    { value: AUTO_LOCALE, labelKey: 'optionsLanguageAuto' },
    { value: 'en', label: 'English' },
    { value: 'zh_CN', label: '简体中文' },
    { value: 'zh_TW', label: '繁體中文' },
    { value: 'ja', label: '日本語' },
    { value: 'ko', label: '한국어' },
    { value: 'fr', label: 'Français' },
    { value: 'de', label: 'Deutsch' },
    { value: 'es', label: 'Español' },
    { value: 'pt_PT', label: 'Português' },
    { value: 'it', label: 'Italiano' },
    { value: 'ru', label: 'Русский' },
    { value: 'ar', label: 'العربية' },
    { value: 'hi', label: 'हिन्दी' },
  ];

  const RTL_LOCALES = new Set(['ar']);

  function normalizeLocale(locale) {
    if (!locale || typeof locale !== 'string') return AUTO_LOCALE;
    if (locale === AUTO_LOCALE) return AUTO_LOCALE;

    const normalized = locale.replace('-', '_');
    if (SUPPORTED_LOCALES.includes(normalized)) return normalized;

    const language = normalized.split('_')[0];
    if (language === 'pt') return 'pt_PT';
    if (language === 'zh') return normalized.toLowerCase().includes('tw') ? 'zh_TW' : 'zh_CN';

    const match = SUPPORTED_LOCALES.find((supported) => supported.split('_')[0] === language);
    return match || AUTO_LOCALE;
  }

  function isRtlLocale(locale) {
    return RTL_LOCALES.has(normalizeLocale(locale));
  }

  function formatMessage(entry, substitutions = []) {
    if (!entry || typeof entry.message !== 'string') return '';

    const values = Array.isArray(substitutions) ? substitutions : [substitutions];
    let message = entry.message;

    for (const [name, placeholder] of Object.entries(entry.placeholders || {})) {
      const content = placeholder.content || '';
      const index = Number(content.replace(/\$/g, '')) - 1;
      const value = values[index] == null ? '' : String(values[index]);
      message = message.replaceAll(`$${name.toUpperCase()}$`, value);
    }

    return message;
  }

  function getChromeI18n() {
    return root.chrome && root.chrome.i18n ? root.chrome.i18n : null;
  }

  function getChromeRuntime() {
    return root.chrome && root.chrome.runtime ? root.chrome.runtime : null;
  }

  function getStoredLanguageFromChrome() {
    return new Promise((resolve) => {
      const storage = root.chrome && root.chrome.storage && root.chrome.storage.local;
      if (!storage || typeof storage.get !== 'function') {
        resolve(AUTO_LOCALE);
        return;
      }

      try {
        storage.get(['languageOverride'], (result) => {
          resolve(result && result.languageOverride ? result.languageOverride : AUTO_LOCALE);
        });
      } catch {
        resolve(AUTO_LOCALE);
      }
    });
  }

  async function fetchMessagesFromExtension(locale) {
    const runtime = getChromeRuntime();
    if (!runtime || typeof runtime.getURL !== 'function') {
      throw new Error('chrome.runtime.getURL is unavailable');
    }

    const response = await fetch(runtime.getURL(`_locales/${locale}/messages.json`));
    if (!response.ok) {
      throw new Error(`Failed to load locale ${locale}`);
    }

    return response.json();
  }

  function chromeMessage(chromeI18n, key, substitutions) {
    if (!chromeI18n || typeof chromeI18n.getMessage !== 'function') return '';
    return chromeI18n.getMessage(key, substitutions) || '';
  }

  async function createI18n(options = {}) {
    const chromeI18n = options.chromeI18n || getChromeI18n();
    const getStoredLanguage = options.getStoredLanguage || getStoredLanguageFromChrome;
    const fetchMessages = options.fetchMessages || fetchMessagesFromExtension;

    const storedLocale = normalizeLocale(await getStoredLanguage());
    const browserLocale = normalizeLocale(
      chromeI18n && typeof chromeI18n.getUILanguage === 'function'
        ? chromeI18n.getUILanguage()
        : DEFAULT_LOCALE
    );
    const locale = storedLocale === AUTO_LOCALE ? browserLocale : storedLocale;
    const dir = isRtlLocale(locale) ? 'rtl' : 'ltr';

    let activeMessages = null;
    let englishMessages = null;

    try {
      englishMessages = await fetchMessages(DEFAULT_LOCALE);
    } catch {
      englishMessages = null;
    }

    if (storedLocale !== AUTO_LOCALE) {
      try {
        activeMessages = await fetchMessages(storedLocale);
      } catch {
        activeMessages = null;
      }
    }

    function fromMessages(messages, key, substitutions) {
      return formatMessage(messages && messages[key], substitutions);
    }

    function t(key, substitutions = []) {
      if (activeMessages) {
        const manualValue = fromMessages(activeMessages, key, substitutions);
        if (manualValue) return manualValue;
      }

      const chromeValue = chromeMessage(chromeI18n, key, substitutions);
      if (chromeValue) return chromeValue;

      const englishValue = fromMessages(englishMessages, key, substitutions);
      if (englishValue) return englishValue;

      return key;
    }

    function localizeDocument(rootNode = root.document) {
      if (!rootNode) return;

      const doc = rootNode.ownerDocument || rootNode;
      if (doc.documentElement) {
        doc.documentElement.lang = locale.replace('_', '-');
        doc.documentElement.dir = dir;
      }

      rootNode.querySelectorAll('[data-i18n]').forEach((el) => {
        el.textContent = t(el.dataset.i18n);
      });
      rootNode.querySelectorAll('[data-i18n-title]').forEach((el) => {
        el.setAttribute('title', t(el.dataset.i18nTitle));
      });
      rootNode.querySelectorAll('[data-i18n-aria-label]').forEach((el) => {
        el.setAttribute('aria-label', t(el.dataset.i18nAriaLabel));
      });
      rootNode.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
        el.setAttribute('placeholder', t(el.dataset.i18nPlaceholder));
      });
    }

    return { locale, dir, t, localizeDocument };
  }

  root.BrewFinderI18n = {
    AUTO_LOCALE,
    DEFAULT_LOCALE,
    SUPPORTED_LOCALES,
    LANGUAGE_OPTIONS,
    createI18n,
    formatMessage,
    isRtlLocale,
    normalizeLocale,
  };
})(globalThis);
