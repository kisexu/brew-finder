const EXCLUDED_DOMAINS = new Set([
  'web.archive.org',
  'archive.org',
  'packages.debian.org',
]);

/**
 * Check if a domain should be excluded from the mapping.
 */
export function shouldExcludeDomain(domain) {
  return EXCLUDED_DOMAINS.has(domain);
}

/**
 * Check if a URL should be excluded (non-http, empty, etc.).
 */
export function shouldExcludeUrl(url) {
  if (!url || typeof url !== 'string') return true;
  try {
    const parsed = new URL(url);
    return parsed.protocol !== 'http:' && parsed.protocol !== 'https:';
  } catch {
    return true;
  }
}

/**
 * Check if a domain string is valid.
 */
export function isValidDomain(domain) {
  return typeof domain === 'string' && domain.length > 0;
}
