export const SETTINGS_DEFAULTS = {
  badgeEnabled: true,
  overlayEnabled: true,
  overlayDismissBehavior: 'ask',
  overlayDismissedDomains: [],
  languageOverride: 'auto',
};

const OVERLAY_DISMISS_BEHAVIORS = new Set(['ask', 'site']);

/**
 * Get all settings, merged with defaults.
 */
export function getSettings() {
  return new Promise((resolve) => {
    chrome.storage.local.get(Object.keys(SETTINGS_DEFAULTS), (result) => {
      resolve(normalizeSettings(result));
    });
  });
}

/**
 * Update a single setting value.
 */
export function updateSetting(key, value) {
  return updateSettings({ [key]: value });
}

export function updateSettings(items) {
  return new Promise((resolve) => {
    chrome.storage.local.set(normalizeUpdateItems(items), resolve);
  });
}

export async function addOverlayDismissedDomain(rootDomain) {
  const domain = normalizeDomain(rootDomain);
  const settings = await getSettings();
  const domains = domain
    ? [...new Set([...settings.overlayDismissedDomains, domain])]
    : settings.overlayDismissedDomains;

  await updateSettings({
    overlayDismissBehavior: 'site',
    overlayDismissedDomains: domains,
  });

  return domains;
}

export async function resetOverlayDismissedDomains() {
  await updateSettings({ overlayDismissedDomains: [] });
  return [];
}

function normalizeSettings(result = {}) {
  const settings = { ...SETTINGS_DEFAULTS, ...result };
  settings.overlayDismissedDomains = normalizeDomainList(settings.overlayDismissedDomains);

  if (!OVERLAY_DISMISS_BEHAVIORS.has(settings.overlayDismissBehavior)) {
    settings.overlayDismissBehavior = SETTINGS_DEFAULTS.overlayDismissBehavior;
  }

  return settings;
}

function normalizeUpdateItems(items) {
  const normalized = { ...items };

  if ('overlayDismissedDomains' in normalized) {
    normalized.overlayDismissedDomains = normalizeDomainList(normalized.overlayDismissedDomains);
  }

  if (
    'overlayDismissBehavior' in normalized &&
    !OVERLAY_DISMISS_BEHAVIORS.has(normalized.overlayDismissBehavior)
  ) {
    normalized.overlayDismissBehavior = SETTINGS_DEFAULTS.overlayDismissBehavior;
  }

  return normalized;
}

function normalizeDomainList(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return [...new Set(value.map(normalizeDomain).filter(Boolean))];
}

function normalizeDomain(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}
