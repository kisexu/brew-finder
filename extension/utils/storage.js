export const SETTINGS_DEFAULTS = {
  badgeEnabled: true,
  overlayEnabled: true,
  overlayDismissBehavior: 'ask',
  languageOverride: 'auto',
};

/**
 * Get all settings, merged with defaults.
 */
export function getSettings() {
  return new Promise((resolve) => {
    chrome.storage.local.get(Object.keys(SETTINGS_DEFAULTS), (result) => {
      resolve({ ...SETTINGS_DEFAULTS, ...result });
    });
  });
}

/**
 * Update a single setting value.
 */
export function updateSetting(key, value) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [key]: value }, resolve);
  });
}
