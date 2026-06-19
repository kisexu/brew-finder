# Brew Finder Internationalization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:kise-subagent-driven-development (recommended) or superpowers:kise-executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add internationalized extension UI, browser-language auto mode, manual language override, and an English default README linked to a Chinese README.

**Architecture:** Use Chrome `_locales/*/messages.json` as the translation source. Add a small classic-script i18n helper at `extension/utils/i18n.js` that attaches `BrewFinderI18n` to `globalThis`; this works in popup/options pages and in the non-module content script without reintroducing `web_accessible_resources`. Store `languageOverride` in `chrome.storage.local`, with `auto` as the default.

**Tech Stack:** Vanilla JavaScript, Chrome Extension Manifest V3 i18n, Chrome storage, Vitest, Markdown.

---

## Scope Check

The approved spec covers one feature area: extension and README internationalization. It touches the Chrome extension UI, storage defaults, tests, and README files. It does not require changes to the Homebrew data pipeline or URL matching logic.

## File Structure

- Create `extension/utils/i18n.js`: classic-script i18n runtime helper exposed as `globalThis.BrewFinderI18n`.
- Modify `extension/utils/storage.js`: add `languageOverride: 'auto'` to defaults.
- Create `tests/extension/i18n.test.js`: unit tests for locale lists, normalization, RTL detection, substitution, fallback, and locale key coverage.
- Modify `tests/extension/storage.test.js`: cover the new storage default and update path.
- Create `extension/_locales/<locale>/messages.json`: Chrome translation messages for 13 supported locales.
- Modify `extension/manifest.json`: add `default_locale`, localized name, localized description, and load the helper before `overlay.js`.
- Modify `extension/popup/popup.html`: mark static text with i18n attributes and load the helper before popup code.
- Modify `extension/popup/popup.js`: initialize i18n and replace hard-coded UI strings.
- Modify `extension/content/overlay.js`: initialize i18n and replace hard-coded UI strings.
- Modify `extension/options/options.html`: add the language setting row and mark static text with i18n attributes.
- Modify `extension/options/options.js`: initialize i18n, populate the language select, persist overrides, and localize metadata strings.
- Modify `extension/options/options.css`: style the language select within the existing dark theme.
- Modify `README.md`: replace with English content and link to Chinese.
- Create `README.zh-CN.md`: preserve the current Chinese README and link to English.

---

### Task 1: Add Language Storage Default

**Files:**
- Modify: `extension/utils/storage.js`
- Modify: `tests/extension/storage.test.js`

- [ ] **Step 1: Write the failing storage tests**

Replace `tests/extension/storage.test.js` with this file:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';

const storageData = {};
const mockStorage = {
  get: vi.fn((keys, cb) => {
    const result = {};
    const keyList = Array.isArray(keys) ? keys : [keys];
    for (const k of keyList) {
      if (k in storageData) result[k] = storageData[k];
    }
    cb(result);
  }),
  set: vi.fn((items, cb) => {
    Object.assign(storageData, items);
    if (cb) cb();
  }),
};

globalThis.chrome = {
  storage: { local: mockStorage },
};

const { getSettings, updateSetting, SETTINGS_DEFAULTS } = await import('../../extension/utils/storage.js');

beforeEach(() => {
  vi.clearAllMocks();
  Object.keys(storageData).forEach((k) => delete storageData[k]);
});

describe('SETTINGS_DEFAULTS', () => {
  it('has expected default values', () => {
    expect(SETTINGS_DEFAULTS.badgeEnabled).toBe(true);
    expect(SETTINGS_DEFAULTS.overlayEnabled).toBe(true);
    expect(SETTINGS_DEFAULTS.overlayPermanentlyDismissed).toBe(false);
    expect(SETTINGS_DEFAULTS.languageOverride).toBe('auto');
  });
});

describe('getSettings', () => {
  it('returns defaults when storage is empty', async () => {
    const settings = await getSettings();
    expect(settings.badgeEnabled).toBe(true);
    expect(settings.overlayEnabled).toBe(true);
    expect(settings.overlayPermanentlyDismissed).toBe(false);
    expect(settings.languageOverride).toBe('auto');
  });

  it('merges stored values with defaults', async () => {
    storageData.badgeEnabled = false;
    storageData.languageOverride = 'ja';

    const settings = await getSettings();

    expect(settings.badgeEnabled).toBe(false);
    expect(settings.overlayEnabled).toBe(true);
    expect(settings.languageOverride).toBe('ja');
  });
});

describe('updateSetting', () => {
  it('updates a single boolean setting', async () => {
    await updateSetting('badgeEnabled', false);
    expect(mockStorage.set).toHaveBeenCalledWith({ badgeEnabled: false }, expect.any(Function));
  });

  it('updates the language override setting', async () => {
    await updateSetting('languageOverride', 'de');
    expect(mockStorage.set).toHaveBeenCalledWith({ languageOverride: 'de' }, expect.any(Function));
  });
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
npm test -- tests/extension/storage.test.js
```

Expected: FAIL because `SETTINGS_DEFAULTS.languageOverride` is `undefined`.

- [ ] **Step 3: Add the default setting**

Edit `extension/utils/storage.js` so `SETTINGS_DEFAULTS` is:

```js
export const SETTINGS_DEFAULTS = {
  badgeEnabled: true,
  overlayEnabled: true,
  overlayPermanentlyDismissed: false,
  languageOverride: 'auto',
};
```

- [ ] **Step 4: Run the focused test and verify it passes**

Run:

```bash
npm test -- tests/extension/storage.test.js
```

Expected: PASS for all storage tests.

- [ ] **Step 5: Commit**

```bash
git add extension/utils/storage.js tests/extension/storage.test.js
git commit -m "feat: add language override setting"
```

---

### Task 2: Add the I18n Runtime Helper

**Files:**
- Create: `extension/utils/i18n.js`
- Create: `tests/extension/i18n.test.js`

- [ ] **Step 1: Write the failing i18n helper tests**

Create `tests/extension/i18n.test.js`:

```js
import { describe, it, expect, beforeEach } from 'vitest';

await import('../../extension/utils/i18n.js');

const {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  LANGUAGE_OPTIONS,
  createI18n,
  formatMessage,
  isRtlLocale,
  normalizeLocale,
} = globalThis.BrewFinderI18n;

const englishMessages = {
  popupCurrentPage: {
    message: 'Current page: $HOST$',
    placeholders: { host: { content: '$1' } },
  },
  popupNoMatch: { message: 'No Homebrew package found for this website' },
};

const japaneseMessages = {
  popupCurrentPage: {
    message: '現在のページ：$HOST$',
    placeholders: { host: { content: '$1' } },
  },
};

beforeEach(() => {
  globalThis.chrome = {
    i18n: {
      getUILanguage: () => 'en-US',
      getMessage: (key, substitutions = []) => formatMessage(englishMessages[key], substitutions),
    },
    storage: {
      local: {
        get: (_keys, cb) => cb({ languageOverride: 'auto' }),
      },
    },
    runtime: {
      getURL: (path) => `chrome-extension://test/${path}`,
    },
  };
});

describe('BrewFinderI18n constants', () => {
  it('defines the approved default locale and supported locales', () => {
    expect(DEFAULT_LOCALE).toBe('en');
    expect(SUPPORTED_LOCALES).toEqual([
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
    ]);
  });

  it('defines language options including auto mode', () => {
    expect(LANGUAGE_OPTIONS[0]).toEqual({ value: 'auto', labelKey: 'optionsLanguageAuto' });
    expect(LANGUAGE_OPTIONS.map((option) => option.value)).toContain('ar');
  });
});

describe('normalizeLocale', () => {
  it('accepts auto and exact supported locale values', () => {
    expect(normalizeLocale('auto')).toBe('auto');
    expect(normalizeLocale('zh_CN')).toBe('zh_CN');
    expect(normalizeLocale('pt_PT')).toBe('pt_PT');
  });

  it('normalizes browser-style separators and regional variants', () => {
    expect(normalizeLocale('zh-CN')).toBe('zh_CN');
    expect(normalizeLocale('en-US')).toBe('en');
    expect(normalizeLocale('pt-BR')).toBe('pt_PT');
  });

  it('rejects unsupported values by returning auto', () => {
    expect(normalizeLocale('nl')).toBe('auto');
    expect(normalizeLocale('')).toBe('auto');
    expect(normalizeLocale(undefined)).toBe('auto');
  });
});

describe('isRtlLocale', () => {
  it('returns true only for Arabic in the supported locale set', () => {
    expect(isRtlLocale('ar')).toBe(true);
    expect(isRtlLocale('en')).toBe(false);
    expect(isRtlLocale('zh_CN')).toBe(false);
  });
});

describe('formatMessage', () => {
  it('replaces Chrome-style placeholders with ordered substitutions', () => {
    const result = formatMessage(englishMessages.popupCurrentPage, ['www.docker.com']);
    expect(result).toBe('Current page: www.docker.com');
  });

  it('returns an empty string for missing entries', () => {
    expect(formatMessage(undefined, ['x'])).toBe('');
  });
});

describe('createI18n', () => {
  it('uses Chrome i18n in auto mode', async () => {
    const i18n = await createI18n({
      getStoredLanguage: async () => 'auto',
      fetchMessages: async () => englishMessages,
      chromeI18n: globalThis.chrome.i18n,
    });

    expect(i18n.locale).toBe('en');
    expect(i18n.dir).toBe('ltr');
    expect(i18n.t('popupCurrentPage', ['example.com'])).toBe('Current page: example.com');
  });

  it('uses a manual locale and falls back to English for missing keys', async () => {
    const i18n = await createI18n({
      getStoredLanguage: async () => 'ja',
      fetchMessages: async (locale) => (locale === 'ja' ? japaneseMessages : englishMessages),
      chromeI18n: globalThis.chrome.i18n,
    });

    expect(i18n.locale).toBe('ja');
    expect(i18n.t('popupCurrentPage', ['example.com'])).toBe('現在のページ：example.com');
    expect(i18n.t('popupNoMatch')).toBe('No Homebrew package found for this website');
  });

  it('falls back to Chrome i18n when manual locale loading fails', async () => {
    const i18n = await createI18n({
      getStoredLanguage: async () => 'de',
      fetchMessages: async (locale) => {
        if (locale === 'de') throw new Error('missing locale file');
        return englishMessages;
      },
      chromeI18n: globalThis.chrome.i18n,
    });

    expect(i18n.locale).toBe('de');
    expect(i18n.t('popupNoMatch')).toBe('No Homebrew package found for this website');
  });
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
npm test -- tests/extension/i18n.test.js
```

Expected: FAIL because `extension/utils/i18n.js` does not exist.

- [ ] **Step 3: Implement the i18n helper**

Create `extension/utils/i18n.js`:

```js
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
```

- [ ] **Step 4: Run the focused test and verify it passes**

Run:

```bash
npm test -- tests/extension/i18n.test.js
```

Expected: PASS for all i18n helper tests.

- [ ] **Step 5: Run storage tests again**

Run:

```bash
npm test -- tests/extension/storage.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add extension/utils/i18n.js tests/extension/i18n.test.js
git commit -m "feat: add i18n runtime helper"
```

---

### Task 3: Add Locale Message Files and Key Coverage Test

**Files:**
- Create: `extension/_locales/en/messages.json`
- Create: `extension/_locales/zh_CN/messages.json`
- Create: `extension/_locales/zh_TW/messages.json`
- Create: `extension/_locales/ja/messages.json`
- Create: `extension/_locales/ko/messages.json`
- Create: `extension/_locales/fr/messages.json`
- Create: `extension/_locales/de/messages.json`
- Create: `extension/_locales/es/messages.json`
- Create: `extension/_locales/pt_PT/messages.json`
- Create: `extension/_locales/it/messages.json`
- Create: `extension/_locales/ru/messages.json`
- Create: `extension/_locales/ar/messages.json`
- Create: `extension/_locales/hi/messages.json`
- Modify: `tests/extension/i18n.test.js`

- [ ] **Step 1: Add the key coverage test**

Append this block to `tests/extension/i18n.test.js`:

```js
describe('locale message files', () => {
  it('keeps every locale aligned with the English key set', async () => {
    const { readFile } = await import('node:fs/promises');
    const { resolve } = await import('node:path');
    const root = resolve(import.meta.dirname, '../..');
    const readMessages = async (locale) => JSON.parse(
      await readFile(resolve(root, `extension/_locales/${locale}/messages.json`), 'utf8')
    );
    const englishKeys = Object.keys(await readMessages(DEFAULT_LOCALE)).sort();

    for (const locale of SUPPORTED_LOCALES) {
      const keys = Object.keys(await readMessages(locale)).sort();
      expect(keys, `${locale} keys`).toEqual(englishKeys);
    }
  });
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
npm test -- tests/extension/i18n.test.js
```

Expected: FAIL because `extension/_locales/en/messages.json` does not exist.

- [ ] **Step 3: Create locale directories and message files**

Create all 13 `messages.json` files. Every file must contain the same keys. Use this exact key set and translate only the `message` values:

```json
{
  "extensionName": { "message": "Brew Finder" },
  "extensionDescription": { "message": "Detect Homebrew packages for any website" },
  "popupDetecting": { "message": "Checking..." },
  "popupNoMatch": { "message": "No Homebrew package found for this website" },
  "popupCurrentPage": {
    "message": "Current page: $HOST$",
    "placeholders": { "host": { "content": "$1" } }
  },
  "popupUnknownPage": { "message": "Current page: unknown" },
  "copyCommandTitle": { "message": "Copy install command" },
  "overlayCloseTitle": { "message": "Close" },
  "overlayInstallable": { "message": "This software can be installed with Homebrew:" },
  "overlayDismissQuestion": { "message": "Turn off the page overlay permanently?" },
  "overlayDismissOnce": { "message": "Only this time" },
  "overlayDismissForever": { "message": "Turn off permanently" },
  "optionsTitle": { "message": "Brew Finder Settings" },
  "optionsBadgeLabel": { "message": "Badge" },
  "optionsBadgeDescription": { "message": "Show the match count on the extension icon" },
  "optionsOverlayLabel": { "message": "Page overlay" },
  "optionsOverlayDescription": { "message": "Show install reminders in the bottom-right corner" },
  "optionsLanguageLabel": { "message": "Language" },
  "optionsLanguageDescription": { "message": "Choose the extension display language" },
  "optionsLanguageAuto": { "message": "Follow browser" },
  "optionsResetDismissLabel": { "message": "Reset overlay dismissal" },
  "optionsResetDismissDescription": { "message": "Restore the permanent overlay dismissal prompt" },
  "optionsResetButton": { "message": "Reset" },
  "optionsResetDone": { "message": "Reset done" },
  "optionsMetadataLoading": { "message": "Loading..." },
  "optionsMetadataVersion": {
    "message": "Map data version: $DATE$",
    "placeholders": { "date": { "content": "$1" } }
  },
  "optionsMetadataPackageCount": {
    "message": "Packages covered: $COUNT$",
    "placeholders": { "count": { "content": "$1" } }
  },
  "optionsMetadataDomainCount": {
    "message": "Domains covered: $COUNT$",
    "placeholders": { "count": { "content": "$1" } }
  },
  "optionsMetadataError": { "message": "Unable to load metadata" }
}
```

Use these translations for locale-specific `message` values while preserving placeholder names and `placeholders` objects:

| Key | `zh_CN` | `zh_TW` | `ja` | `ko` | `fr` | `de` | `es` | `pt_PT` | `it` | `ru` | `ar` | `hi` |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `extensionDescription` | 检测任意网站对应的 Homebrew 包 | 偵測任意網站對應的 Homebrew 套件 | 任意のウェブサイトに対応する Homebrew パッケージを検出します | 모든 웹사이트의 Homebrew 패키지를 감지합니다 | Détecte les paquets Homebrew pour n'importe quel site web | Erkennt Homebrew-Pakete für jede Website | Detecta paquetes de Homebrew para cualquier sitio web | Deteta pacotes Homebrew para qualquer site | Rileva i pacchetti Homebrew per qualsiasi sito web | Находит пакеты Homebrew для любого сайта | اكتشف حزم Homebrew لأي موقع ويب | किसी भी वेबसाइट के लिए Homebrew पैकेज पहचानें |
| `popupDetecting` | 正在检测... | 正在偵測... | 確認中... | 확인 중... | Vérification... | Wird geprüft... | Comprobando... | A verificar... | Controllo in corso... | Проверка... | جارٍ الفحص... | जाँच हो रही है... |
| `popupNoMatch` | 当前网站未找到 Homebrew 包 | 目前網站找不到 Homebrew 套件 | このサイトに対応する Homebrew パッケージは見つかりません | 이 웹사이트에 대한 Homebrew 패키지를 찾을 수 없습니다 | Aucun paquet Homebrew trouvé pour ce site | Kein Homebrew-Paket für diese Website gefunden | No se encontró ningún paquete de Homebrew para este sitio | Nenhum pacote Homebrew encontrado para este site | Nessun pacchetto Homebrew trovato per questo sito | Для этого сайта пакет Homebrew не найден | لم يتم العثور على حزمة Homebrew لهذا الموقع | इस वेबसाइट के लिए कोई Homebrew पैकेज नहीं मिला |
| `popupCurrentPage` | 当前页面：$HOST$ | 目前頁面：$HOST$ | 現在のページ：$HOST$ | 현재 페이지: $HOST$ | Page actuelle : $HOST$ | Aktuelle Seite: $HOST$ | Página actual: $HOST$ | Página atual: $HOST$ | Pagina corrente: $HOST$ | Текущая страница: $HOST$ | الصفحة الحالية: $HOST$ | वर्तमान पृष्ठ: $HOST$ |
| `popupUnknownPage` | 当前页面：未知 | 目前頁面：未知 | 現在のページ：不明 | 현재 페이지: 알 수 없음 | Page actuelle : inconnue | Aktuelle Seite: unbekannt | Página actual: desconocida | Página atual: desconhecida | Pagina corrente: sconosciuta | Текущая страница: неизвестна | الصفحة الحالية: غير معروفة | वर्तमान पृष्ठ: अज्ञात |
| `copyCommandTitle` | 复制安装命令 | 複製安裝指令 | インストールコマンドをコピー | 설치 명령 복사 | Copier la commande d'installation | Installationsbefehl kopieren | Copiar comando de instalación | Copiar comando de instalação | Copia comando di installazione | Скопировать команду установки | انسخ أمر التثبيت | इंस्टॉल कमांड कॉपी करें |
| `overlayCloseTitle` | 关闭 | 關閉 | 閉じる | 닫기 | Fermer | Schließen | Cerrar | Fechar | Chiudi | Закрыть | إغلاق | बंद करें |
| `overlayInstallable` | 此软件可通过 Homebrew 安装： | 此軟體可透過 Homebrew 安裝： | このソフトウェアは Homebrew でインストールできます： | 이 소프트웨어는 Homebrew로 설치할 수 있습니다: | Ce logiciel peut être installé avec Homebrew : | Diese Software kann mit Homebrew installiert werden: | Este software se puede instalar con Homebrew: | Este software pode ser instalado com Homebrew: | Questo software può essere installato con Homebrew: | Это ПО можно установить через Homebrew: | يمكن تثبيت هذا البرنامج عبر Homebrew: | इस सॉफ्टवेयर को Homebrew से इंस्टॉल किया जा सकता है: |
| `overlayDismissQuestion` | 是否永久关闭页面浮层？ | 是否永久關閉頁面浮層？ | ページオーバーレイを永久にオフにしますか？ | 페이지 오버레이를 영구적으로 끄시겠습니까? | Désactiver définitivement l'incrustation de page ? | Seiten-Overlay dauerhaft deaktivieren? | ¿Desactivar permanentemente la superposición de página? | Desativar permanentemente a sobreposição da página? | Disattivare definitivamente il riquadro nella pagina? | Отключить оверлей страницы навсегда? | هل تريد إيقاف طبقة الصفحة نهائيًا؟ | क्या पेज ओवरले को स्थायी रूप से बंद करें? |
| `overlayDismissOnce` | 仅本次 | 僅本次 | 今回のみ | 이번만 | Cette fois seulement | Nur dieses Mal | Solo esta vez | Só desta vez | Solo questa volta | Только сейчас | هذه المرة فقط | केवल इस बार |
| `overlayDismissForever` | 永久关闭 | 永久關閉 | 永久にオフ | 영구적으로 끄기 | Désactiver définitivement | Dauerhaft deaktivieren | Desactivar permanentemente | Desativar permanentemente | Disattiva definitivamente | Отключить навсегда | إيقاف نهائيًا | स्थायी रूप से बंद करें |
| `optionsTitle` | Brew Finder 设置 | Brew Finder 設定 | Brew Finder 設定 | Brew Finder 설정 | Paramètres de Brew Finder | Brew Finder-Einstellungen | Configuración de Brew Finder | Definições do Brew Finder | Impostazioni di Brew Finder | Настройки Brew Finder | إعدادات Brew Finder | Brew Finder सेटिंग्स |
| `optionsBadgeLabel` | Badge 徽标 | Badge 徽章 | バッジ | 배지 | Badge | Badge | Insignia | Emblema | Badge | Значок | الشارة | बैज |
| `optionsBadgeDescription` | 在插件图标上显示匹配数量 | 在擴充功能圖示上顯示符合數量 | 拡張機能アイコンに一致数を表示します | 확장 프로그램 아이콘에 일치 수를 표시합니다 | Afficher le nombre de correspondances sur l'icône de l'extension | Trefferanzahl auf dem Erweiterungssymbol anzeigen | Muestra el número de coincidencias en el icono de la extensión | Mostrar o número de correspondências no ícone da extensão | Mostra il numero di corrispondenze sull'icona dell'estensione | Показывать количество совпадений на значке расширения | أظهر عدد النتائج على أيقونة الإضافة | एक्सटेंशन आइकन पर मिलानों की संख्या दिखाएँ |
| `optionsOverlayLabel` | 页面浮层 | 頁面浮層 | ページオーバーレイ | 페이지 오버레이 | Incrustation de page | Seiten-Overlay | Superposición de página | Sobreposição da página | Riquadro nella pagina | Оверлей страницы | طبقة الصفحة | पेज ओवरले |
| `optionsOverlayDescription` | 在页面右下角显示安装提醒 | 在頁面右下角顯示安裝提醒 | ページ右下にインストール通知を表示します | 페이지 오른쪽 아래에 설치 알림을 표시합니다 | Afficher les rappels d'installation en bas à droite | Installationshinweise unten rechts anzeigen | Muestra recordatorios de instalación en la esquina inferior derecha | Mostrar lembretes de instalação no canto inferior direito | Mostra promemoria di installazione in basso a destra | Показывать напоминания об установке в правом нижнем углу | أظهر تذكيرات التثبيت في أسفل اليمين | नीचे-दाएँ कोने में इंस्टॉल रिमाइंडर दिखाएँ |
| `optionsLanguageLabel` | 语言 | 語言 | 言語 | 언어 | Langue | Sprache | Idioma | Idioma | Lingua | Язык | اللغة | भाषा |
| `optionsLanguageDescription` | 选择扩展显示语言 | 選擇擴充功能顯示語言 | 拡張機能の表示言語を選択します | 확장 프로그램 표시 언어를 선택합니다 | Choisir la langue d'affichage de l'extension | Anzeigesprache der Erweiterung wählen | Elige el idioma de la extensión | Escolha o idioma da extensão | Scegli la lingua dell'estensione | Выберите язык интерфейса расширения | اختر لغة عرض الإضافة | एक्सटेंशन की प्रदर्शन भाषा चुनें |
| `optionsLanguageAuto` | 跟随浏览器 | 跟隨瀏覽器 | ブラウザに合わせる | 브라우저 따르기 | Suivre le navigateur | Browser folgen | Seguir navegador | Seguir o navegador | Segui il browser | Как в браузере | اتبع المتصفح | ब्राउज़र के अनुसार |
| `optionsResetDismissLabel` | 重置浮层关闭状态 | 重置浮層關閉狀態 | オーバーレイ非表示状態をリセット | 오버레이 닫기 상태 재설정 | Réinitialiser le masquage de l'incrustation | Overlay-Ausblendung zurücksetzen | Restablecer cierre de superposición | Repor dispensa da sobreposição | Reimposta chiusura del riquadro | Сбросить скрытие оверлея | إعادة ضبط إخفاء الطبقة | ओवरले बंद स्थिति रीसेट करें |
| `optionsResetDismissDescription` | 恢复浮层的“永久关闭”提示 | 恢復浮層的「永久關閉」提示 | オーバーレイの永久オフ確認を復元します | 오버레이의 영구 끄기 확인을 복원합니다 | Restaurer l'invite de désactivation définitive | Abfrage zum dauerhaften Deaktivieren wiederherstellen | Restaura el aviso de desactivación permanente | Restaurar o aviso de desativação permanente | Ripristina la richiesta di disattivazione definitiva | Восстановить запрос постоянного отключения | استعد مطالبة الإيقاف الدائم | स्थायी रूप से बंद करने का संकेत वापस लाएँ |
| `optionsResetButton` | 重置 | 重置 | リセット | 재설정 | Réinitialiser | Zurücksetzen | Restablecer | Repor | Reimposta | Сбросить | إعادة ضبط | रीसेट |
| `optionsResetDone` | 已重置 | 已重置 | リセット済み | 재설정됨 | Réinitialisé | Zurückgesetzt | Restablecido | Reposto | Reimpostato | Сброшено | تمت إعادة الضبط | रीसेट हो गया |
| `optionsMetadataLoading` | 加载中... | 載入中... | 読み込み中... | 로드 중... | Chargement... | Wird geladen... | Cargando... | A carregar... | Caricamento... | Загрузка... | جارٍ التحميل... | लोड हो रहा है... |
| `optionsMetadataVersion` | 映射数据版本：$DATE$ | 映射資料版本：$DATE$ | マップデータバージョン：$DATE$ | 매핑 데이터 버전: $DATE$ | Version des données de correspondance : $DATE$ | Kartendaten-Version: $DATE$ | Versión de datos de mapeo: $DATE$ | Versão dos dados de mapeamento: $DATE$ | Versione dati di mappatura: $DATE$ | Версия данных сопоставления: $DATE$ | إصدار بيانات الخرائط: $DATE$ | मैप डेटा संस्करण: $DATE$ |
| `optionsMetadataPackageCount` | 覆盖包数量：$COUNT$ | 涵蓋套件數：$COUNT$ | 対象パッケージ数：$COUNT$ | 포함된 패키지 수: $COUNT$ | Paquets couverts : $COUNT$ | Abgedeckte Pakete: $COUNT$ | Paquetes cubiertos: $COUNT$ | Pacotes abrangidos: $COUNT$ | Pacchetti coperti: $COUNT$ | Пакетов покрыто: $COUNT$ | الحزم المشمولة: $COUNT$ | कवर किए गए पैकेज: $COUNT$ |
| `optionsMetadataDomainCount` | 覆盖域名数：$COUNT$ | 涵蓋網域數：$COUNT$ | 対象ドメイン数：$COUNT$ | 포함된 도메인 수: $COUNT$ | Domaines couverts : $COUNT$ | Abgedeckte Domains: $COUNT$ | Dominios cubiertos: $COUNT$ | Domínios abrangidos: $COUNT$ | Domini coperti: $COUNT$ | Доменов покрыто: $COUNT$ | النطاقات المشمولة: $COUNT$ | कवर किए गए डोमेन: $COUNT$ |
| `optionsMetadataError` | 无法加载元数据 | 無法載入中繼資料 | メタデータを読み込めません | 메타데이터를 로드할 수 없습니다 | Impossible de charger les métadonnées | Metadaten konnten nicht geladen werden | No se pudieron cargar los metadatos | Não foi possível carregar os metadados | Impossibile caricare i metadati | Не удалось загрузить метаданные | تعذر تحميل البيانات الوصفية | मेटाडेटा लोड नहीं हो सका |

For `extensionName`, use `"Brew Finder"` in every locale.

- [ ] **Step 4: Run the focused test and verify it passes**

Run:

```bash
npm test -- tests/extension/i18n.test.js
```

Expected: PASS, including the locale key coverage test.

- [ ] **Step 5: Commit**

```bash
git add extension/_locales tests/extension/i18n.test.js
git commit -m "feat: add extension locale messages"
```

---

### Task 4: Localize Manifest and Popup

**Files:**
- Modify: `extension/manifest.json`
- Modify: `extension/popup/popup.html`
- Modify: `extension/popup/popup.js`

- [ ] **Step 1: Localize the manifest and load the content helper**

Edit `extension/manifest.json` so these fields are present:

```json
{
  "manifest_version": 3,
  "name": "__MSG_extensionName__",
  "version": "1.0.0",
  "default_locale": "en",
  "description": "__MSG_extensionDescription__",
  "permissions": ["activeTab", "storage", "tabs"],
  "host_permissions": [],
  "background": {
    "service_worker": "background/service-worker.js",
    "type": "module"
  },
  "content_scripts": [
    {
      "matches": ["http://*/*", "https://*/*"],
      "js": ["utils/i18n.js", "content/overlay.js"],
      "css": ["content/overlay.css"],
      "run_at": "document_idle"
    }
  ],
  "action": {
    "default_popup": "popup/popup.html",
    "default_icon": {
      "16": "icons/icon-16.png",
      "32": "icons/icon-32.png",
      "48": "icons/icon-48.png",
      "128": "icons/icon-128.png"
    }
  },
  "options_page": "options/options.html",
  "icons": {
    "16": "icons/icon-16.png",
    "32": "icons/icon-32.png",
    "48": "icons/icon-48.png",
    "128": "icons/icon-128.png"
  }
}
```

- [ ] **Step 2: Mark popup static text and load the helper**

Replace `extension/popup/popup.html` with:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="popup.css">
</head>
<body>
  <div class="bf-header">
    <span class="bf-logo">🍺</span>
    <span class="bf-title">Brew Finder</span>
  </div>
  <div id="bf-content">
    <div class="bf-empty">
      <div class="bf-empty-icon">⏳</div>
      <div data-i18n="popupDetecting">Checking...</div>
    </div>
  </div>
  <div id="bf-current-url" class="bf-current-url"></div>
  <script src="../utils/i18n.js"></script>
  <script src="popup.js"></script>
</body>
</html>
```

- [ ] **Step 3: Initialize i18n in popup code**

Replace `extension/popup/popup.js` with:

```js
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
```

- [ ] **Step 4: Run all automated tests**

Run:

```bash
npm test
```

Expected: PASS for all tests.

- [ ] **Step 5: Commit**

```bash
git add extension/manifest.json extension/popup/popup.html extension/popup/popup.js
git commit -m "feat: localize manifest and popup"
```

---

### Task 5: Localize Page Overlay

**Files:**
- Modify: `extension/content/overlay.js`

- [ ] **Step 1: Replace overlay hard-coded UI strings**

Replace `extension/content/overlay.js` with:

```js
// extension/content/overlay.js

(async function () {
  const OVERLAY_ID = 'brew-finder-overlay';

  if (location.protocol === 'chrome:' || location.protocol === 'about:' || location.protocol === 'file:') {
    return;
  }

  const i18n = await BrewFinderI18n.createI18n();

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
    if (chrome.runtime.lastError) return;
    if (!response || !response.matches || response.matches.length === 0) return;

    chrome.storage.local.get(['overlayEnabled', 'overlayPermanentlyDismissed'], (settings) => {
      if (settings.overlayEnabled === false) return;
      if (settings.overlayPermanentlyDismissed === true) return;
      showOverlay(response.matches);
    });
  });
})();
```

- [ ] **Step 2: Run all automated tests**

Run:

```bash
npm test
```

Expected: PASS for all tests.

- [ ] **Step 3: Commit**

```bash
git add extension/content/overlay.js
git commit -m "feat: localize page overlay"
```

---

### Task 6: Localize Options Page and Add Language Select

**Files:**
- Modify: `extension/options/options.html`
- Modify: `extension/options/options.js`
- Modify: `extension/options/options.css`

- [ ] **Step 1: Add localized options markup**

Replace `extension/options/options.html` with:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="options.css">
</head>
<body>
  <div class="options-container">
    <div class="options-header">
      <span class="logo">🍺</span>
      <span class="title" data-i18n="optionsTitle">Brew Finder Settings</span>
    </div>

    <div class="setting-row">
      <div class="setting-info">
        <div class="setting-label" data-i18n="optionsBadgeLabel">Badge</div>
        <div class="setting-desc" data-i18n="optionsBadgeDescription">Show the match count on the extension icon</div>
      </div>
      <div class="toggle active" id="toggle-badge">
        <div class="toggle-knob"></div>
      </div>
    </div>

    <div class="setting-row">
      <div class="setting-info">
        <div class="setting-label" data-i18n="optionsOverlayLabel">Page overlay</div>
        <div class="setting-desc" data-i18n="optionsOverlayDescription">Show install reminders in the bottom-right corner</div>
      </div>
      <div class="toggle active" id="toggle-overlay">
        <div class="toggle-knob"></div>
      </div>
    </div>

    <div class="setting-row">
      <div class="setting-info">
        <div class="setting-label" data-i18n="optionsLanguageLabel">Language</div>
        <div class="setting-desc" data-i18n="optionsLanguageDescription">Choose the extension display language</div>
      </div>
      <select class="language-select" id="language-select"></select>
    </div>

    <div class="setting-row">
      <div class="setting-info">
        <div class="setting-label" data-i18n="optionsResetDismissLabel">Reset overlay dismissal</div>
        <div class="setting-desc" data-i18n="optionsResetDismissDescription">Restore the permanent overlay dismissal prompt</div>
      </div>
      <button class="reset-btn" id="btn-reset-dismiss" data-i18n="optionsResetButton">Reset</button>
    </div>

    <div class="metadata" id="metadata">
      <div data-i18n="optionsMetadataLoading">Loading...</div>
    </div>
  </div>

  <script src="../utils/i18n.js"></script>
  <script src="options.js"></script>
</body>
</html>
```

- [ ] **Step 2: Add select styling**

Append to `extension/options/options.css`:

```css
.language-select {
  min-width: 150px;
  padding: 8px 10px;
  border: 1px solid #2a2a3e;
  border-radius: 6px;
  background: #0f0f1a;
  color: #fff;
  font-size: 14px;
  outline: none;
}

.language-select:focus {
  border-color: #e94560;
}
```

- [ ] **Step 3: Implement options i18n behavior**

Replace `extension/options/options.js` with:

```js
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

function populateLanguageSelect(i18n, selectedValue) {
  languageSelect.innerHTML = BrewFinderI18n.LANGUAGE_OPTIONS.map((option) => {
    const label = option.labelKey ? i18n.t(option.labelKey) : option.label;
    return `<option value="${option.value}">${label}</option>`;
  }).join('');
  languageSelect.value = selectedValue;
}

async function renderMetadata(i18n) {
  try {
    const res = await fetch(chrome.runtime.getURL('data/metadata.json'));
    const meta = await res.json();
    const locale = i18n.locale.replace('_', '-');
    metadataEl.innerHTML = `
      <div>${i18n.t('optionsMetadataVersion', [meta.buildTime.split('T')[0]])}</div>
      <div>${i18n.t('optionsMetadataPackageCount', [(meta.formulaCount + meta.caskCount).toLocaleString(locale)])}</div>
      <div>${i18n.t('optionsMetadataDomainCount', [meta.domainCount.toLocaleString(locale)])}</div>
    `;
  } catch {
    metadataEl.innerHTML = `<div>${i18n.t('optionsMetadataError')}</div>`;
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
```

- [ ] **Step 4: Run all automated tests**

Run:

```bash
npm test
```

Expected: PASS for all tests.

- [ ] **Step 5: Commit**

```bash
git add extension/options/options.html extension/options/options.js extension/options/options.css
git commit -m "feat: add language option"
```

---

### Task 7: Convert README to English and Add Chinese README

**Files:**
- Modify: `README.md`
- Create: `README.zh-CN.md`

- [ ] **Step 1: Preserve the Chinese README**

Create `README.zh-CN.md`:

````md
# 🍺 Brew Finder

语言：简体中文 | [English](README.md)

一款 Chrome 浏览器插件，自动检测当前访问的软件网站是否有对应的 Homebrew 包，并提醒你可以通过 `brew install` 安装。

## 功能

- **Badge 徽标** — 检测到匹配时在插件图标上显示数量
- **Popup 弹窗** — 点击图标查看包名、类型、简介，一键复制安装命令
- **页面浮层** — 匹配时右下角浮层提醒，支持一键复制
- **GitHub 匹配** — 访问 `github.com/user/repo` 也能识别对应 Homebrew 包
- **设置页面** — 控制 Badge、浮层开关，重置浮层关闭状态

## 数据覆盖

| 类型 | 数量 |
|------|------|
| Formulae（命令行工具） | 8,409 |
| Casks（GUI 应用） | 7,706 |
| 覆盖域名 | 7,060 |
| GitHub 仓库 | 4,234 |

## 项目结构

```text
brew-finder/
├── scripts/                    # 数据构建管道
│   ├── build-maps.js           # 从 Homebrew API 生成域名映射
│   ├── filters.js              # 域名过滤规则
│   └── __tests__/              # 数据管道测试
├── data/                       # 生成的映射数据
│   ├── domain-map.json         # 域名 → 包名
│   ├── github-map.json         # user/repo → 包名
│   └── metadata.json           # 构建元信息
├── extension/                  # Chrome 插件（Manifest V3）
│   ├── background/             # Service Worker
│   ├── content/                # 页面内浮层
│   ├── popup/                  # 弹窗 UI
│   ├── options/                # 设置页面
│   └── utils/                  # 匹配逻辑 + 存储封装
├── tests/                      # 扩展逻辑测试
└── docs/                       # 设计文档 + 实现计划
```

## 快速开始

### 环境要求

- Node.js >= 18（需要全局 `fetch`）
- Google Chrome

### 安装依赖

```bash
npm install
```

### 构建映射数据

从 Homebrew API 拉取全量数据，生成域名映射 JSON：

```bash
npm run build:maps
```

输出 `data/domain-map.json`、`data/github-map.json`、`data/metadata.json`。

### 构建扩展

将映射数据复制到扩展目录：

```bash
npm run build:extension
```

或一步完成：

```bash
npm run build
```

### 加载扩展

1. 打开 `chrome://extensions/`
2. 开启「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择 `extension/` 目录

### 运行测试

```bash
npm test
```

开发模式：

```bash
npm run test:watch
```

## 使用

安装扩展后，访问以下网站测试：

- `https://www.docker.com/` → 匹配 `docker`（formula）
- `https://iterm2.com/` → 匹配 `iterm2`（cask）
- `https://github.com/FFmpeg/FFmpeg` → 匹配 `ffmpeg`（formula）

## 技术栈

- **数据管道：** Node.js + vitest
- **Chrome 插件：** 原生 JS + HTML/CSS，Manifest V3，零依赖
- **数据源：** [Homebrew Formulae API](https://formulae.brew.sh)

## 文档

- [设计文档](docs/superpowers/specs/2026-06-08-brew-finder-design.md)
- [实现计划](docs/superpowers/plans/2026-06-08-brew-finder.md)
- [国际化设计文档](docs/superpowers/specs/2026-06-10-brew-finder-i18n-design.md)
- [国际化实现计划](docs/superpowers/plans/2026-06-10-brew-finder-i18n.md)
````

- [ ] **Step 2: Replace default README with English**

Replace `README.md` with:

````md
# 🍺 Brew Finder

Languages: English | [简体中文](README.zh-CN.md)

Brew Finder is a Chrome extension that detects whether the software website you are visiting has a matching Homebrew package and reminds you that it can be installed with `brew install`.

## Features

- **Badge** — Shows the match count on the extension icon when packages are found
- **Popup** — Click the extension icon to view package names, types, descriptions, and one-click install command copying
- **Page overlay** — Shows a bottom-right reminder when a package is matched, with one-click copying
- **GitHub matching** — Recognizes Homebrew packages when visiting `github.com/user/repo`
- **Options page** — Controls the badge, overlay, overlay dismissal reset, and display language
- **Internationalized UI** — Follows the browser language by default and supports manual language override in Options

## Data Coverage

| Type | Count |
|------|------:|
| Formulae (CLI tools) | 8,409 |
| Casks (GUI apps) | 7,706 |
| Covered domains | 7,060 |
| GitHub repositories | 4,234 |

## Project Structure

```text
brew-finder/
├── scripts/                    # Data build pipeline
│   ├── build-maps.js           # Generate domain mappings from the Homebrew API
│   ├── filters.js              # Domain filtering rules
│   └── __tests__/              # Data pipeline tests
├── data/                       # Generated mapping data
│   ├── domain-map.json         # Domain -> package names
│   ├── github-map.json         # user/repo -> package names
│   └── metadata.json           # Build metadata
├── extension/                  # Chrome extension (Manifest V3)
│   ├── background/             # Service Worker
│   ├── content/                # In-page overlay
│   ├── popup/                  # Popup UI
│   ├── options/                # Options page
│   └── utils/                  # Matching, storage, and i18n helpers
├── tests/                      # Extension logic tests
└── docs/                       # Design docs and implementation plans
```

## Quick Start

### Requirements

- Node.js >= 18 (requires global `fetch`)
- Google Chrome

### Install Dependencies

```bash
npm install
```

### Build Mapping Data

Fetch the full Homebrew API data and generate mapping JSON files:

```bash
npm run build:maps
```

This outputs `data/domain-map.json`, `data/github-map.json`, and `data/metadata.json`.

### Build the Extension

Copy mapping data into the extension directory:

```bash
npm run build:extension
```

Or run the full build:

```bash
npm run build
```

### Load the Extension

1. Open `chrome://extensions/`
2. Enable Developer mode
3. Click "Load unpacked"
4. Select the `extension/` directory

### Run Tests

```bash
npm test
```

Watch mode:

```bash
npm run test:watch
```

## Usage

After loading the extension, visit these websites to test matching:

- `https://www.docker.com/` -> matches `docker` (formula)
- `https://iterm2.com/` -> matches `iterm2` (cask)
- `https://github.com/FFmpeg/FFmpeg` -> matches `ffmpeg` (formula)

## Tech Stack

- **Data pipeline:** Node.js + Vitest
- **Chrome extension:** Vanilla JS + HTML/CSS, Manifest V3, zero runtime dependencies
- **Data source:** [Homebrew Formulae API](https://formulae.brew.sh)

## Documentation

- [Original design](docs/superpowers/specs/2026-06-08-brew-finder-design.md)
- [Original implementation plan](docs/superpowers/plans/2026-06-08-brew-finder.md)
- [Internationalization design](docs/superpowers/specs/2026-06-10-brew-finder-i18n-design.md)
- [Internationalization implementation plan](docs/superpowers/plans/2026-06-10-brew-finder-i18n.md)
````

- [ ] **Step 3: Verify README links**

Run:

```bash
rg -n "README.zh-CN.md|Internationalization|语言：简体中文|Languages: English" README.md README.zh-CN.md
```

Expected: output includes language links in both files and the i18n documentation links in `README.md`.

- [ ] **Step 4: Commit**

```bash
git add README.md README.zh-CN.md
git commit -m "docs: add English README"
```

---

### Task 8: Final Verification

**Files:**
- Verify all modified extension, test, and README files

- [ ] **Step 1: Run the full automated test suite**

Run:

```bash
npm test
```

Expected: PASS for all tests.

- [ ] **Step 2: Check for remaining hard-coded Chinese UI strings in active extension code**

Run:

```bash
rg -n "[\\p{Han}]" extension --glob '!data/**' --glob '!_locales/**'
```

Expected: no output.

- [ ] **Step 3: Check locale coverage**

Run:

```bash
find extension/_locales -name messages.json | sort
```

Expected output includes exactly these 13 files:

```text
extension/_locales/ar/messages.json
extension/_locales/de/messages.json
extension/_locales/en/messages.json
extension/_locales/es/messages.json
extension/_locales/fr/messages.json
extension/_locales/hi/messages.json
extension/_locales/it/messages.json
extension/_locales/ja/messages.json
extension/_locales/ko/messages.json
extension/_locales/pt_PT/messages.json
extension/_locales/ru/messages.json
extension/_locales/zh_CN/messages.json
extension/_locales/zh_TW/messages.json
```

- [ ] **Step 4: Verify the extension data bundle is still present**

Run:

```bash
test -f extension/data/domain-map.json && test -f extension/data/github-map.json && test -f extension/data/metadata.json
```

Expected: command exits with status 0.

- [ ] **Step 5: Inspect the final diff**

Run:

```bash
git diff --stat HEAD
```

Expected: only i18n, README, and test files changed since the last task commit. If this command is run after all task commits, it should show no output.

- [ ] **Step 6: Manual Chrome verification**

Load or reload the unpacked extension from `extension/`, then verify:

- Popup shows English in auto mode when the browser language is English.
- Options page contains the Language select.
- Selecting `日本語` immediately changes options page labels.
- Reopening the popup shows Japanese text.
- Selecting `العربية` sets options page text direction to RTL.
- Visiting `https://www.docker.com/` shows a localized overlay after reload.
- `brew install docker` remains left-to-right in the overlay.
- Clicking overlay close still shows one-time and permanent dismissal actions.

- [ ] **Step 7: Final commit if verification changed files**

If manual verification required a small fix, commit it:

```bash
git add extension README.md README.zh-CN.md tests
git commit -m "fix: polish i18n behavior"
```

If no files changed during verification, do not create an empty commit.
