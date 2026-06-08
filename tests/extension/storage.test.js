import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock chrome.storage.local
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

// Import after mocking
const { getSettings, updateSetting, SETTINGS_DEFAULTS } = await import('../../extension/utils/storage.js');

beforeEach(() => {
  vi.clearAllMocks();
  Object.keys(storageData).forEach(k => delete storageData[k]);
});

describe('SETTINGS_DEFAULTS', () => {
  it('has expected default values', () => {
    expect(SETTINGS_DEFAULTS.badgeEnabled).toBe(true);
    expect(SETTINGS_DEFAULTS.overlayEnabled).toBe(true);
    expect(SETTINGS_DEFAULTS.overlayPermanentlyDismissed).toBe(false);
  });
});

describe('getSettings', () => {
  it('returns defaults when storage is empty', async () => {
    const settings = await getSettings();
    expect(settings.badgeEnabled).toBe(true);
    expect(settings.overlayEnabled).toBe(true);
    expect(settings.overlayPermanentlyDismissed).toBe(false);
  });

  it('merges stored values with defaults', async () => {
    storageData.badgeEnabled = false;
    const settings = await getSettings();
    expect(settings.badgeEnabled).toBe(false);
    expect(settings.overlayEnabled).toBe(true); // default
  });
});

describe('updateSetting', () => {
  it('updates a single setting', async () => {
    await updateSetting('badgeEnabled', false);
    expect(mockStorage.set).toHaveBeenCalledWith({ badgeEnabled: false }, expect.any(Function));
  });
});
