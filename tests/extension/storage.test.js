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

const {
  addOverlayDismissedDomain,
  getSettings,
  resetOverlayDismissedDomains,
  updateSetting,
  SETTINGS_DEFAULTS,
} = await import('../../extension/utils/storage.js');

beforeEach(() => {
  vi.clearAllMocks();
  Object.keys(storageData).forEach((k) => delete storageData[k]);
});

describe('SETTINGS_DEFAULTS', () => {
  it('has expected default values', () => {
    expect(SETTINGS_DEFAULTS.badgeEnabled).toBe(true);
    expect(SETTINGS_DEFAULTS.overlayEnabled).toBe(true);
    expect(SETTINGS_DEFAULTS.overlayDismissBehavior).toBe('ask');
    expect(SETTINGS_DEFAULTS.overlayDismissedDomains).toEqual([]);
    expect(SETTINGS_DEFAULTS.languageOverride).toBe('auto');
  });
});

describe('getSettings', () => {
  it('returns defaults when storage is empty', async () => {
    const settings = await getSettings();
    expect(settings.badgeEnabled).toBe(true);
    expect(settings.overlayEnabled).toBe(true);
    expect(settings.overlayDismissBehavior).toBe('ask');
    expect(settings.overlayDismissedDomains).toEqual([]);
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

  it('normalizes dismissed domains and retired overlay behavior values', async () => {
    storageData.overlayDismissBehavior = 'once';
    storageData.overlayDismissedDomains = ['Example.COM', '', 'example.com', 42];

    const settings = await getSettings();

    expect(settings.overlayDismissBehavior).toBe('ask');
    expect(settings.overlayDismissedDomains).toEqual(['example.com']);
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

describe('overlay dismissed domains', () => {
  it('remembers a root domain and switches future close clicks to site mode', async () => {
    storageData.overlayDismissedDomains = ['example.com'];

    await addOverlayDismissedDomain('Cursor.COM');

    expect(storageData.overlayDismissBehavior).toBe('site');
    expect(storageData.overlayDismissedDomains).toEqual(['example.com', 'cursor.com']);
  });

  it('does not duplicate remembered domains', async () => {
    storageData.overlayDismissedDomains = ['cursor.com'];

    await addOverlayDismissedDomain('cursor.com');

    expect(storageData.overlayDismissedDomains).toEqual(['cursor.com']);
  });

  it('resets remembered domains', async () => {
    storageData.overlayDismissedDomains = ['cursor.com'];

    await resetOverlayDismissedDomains();

    expect(storageData.overlayDismissedDomains).toEqual([]);
  });
});
