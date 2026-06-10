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
