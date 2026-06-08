const GITHUB_HOST = 'github.com';
const GITHUB_SPECIAL_PATHS = new Set([
  'topics', 'trending', 'settings', 'notifications',
  'login', 'signup', 'explore', 'marketplace',
]);

/**
 * Match a URL against domain and github maps.
 * Returns { matches: Array<{name, type, desc}> }
 */
export function matchUrl(url, domainMap, githubMap) {
  if (!url || typeof url !== 'string') {
    return { matches: [] };
  }

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return { matches: [] };
  }

  const hostname = parsed.hostname;

  // GitHub -> match by user/repo
  if (hostname === GITHUB_HOST) {
    const segments = parsed.pathname.split('/').filter(Boolean);

    // Skip special paths like /topics/, /trending, etc.
    if (segments.length === 0 || GITHUB_SPECIAL_PATHS.has(segments[0])) {
      return { matches: [] };
    }

    // Need at least user/repo
    if (segments.length < 2) {
      return { matches: [] };
    }

    const repoKey = `${segments[0]}/${segments[1]}`;
    const matches = githubMap[repoKey] || [];
    return { matches };
  }

  // Other domains -> match by hostname
  const matches = domainMap[hostname] || [];
  return { matches };
}
