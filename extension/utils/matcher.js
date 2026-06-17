const GITHUB_HOST = 'github.com';
const GITHUB_SPECIAL_PATHS = new Set([
  'topics', 'trending', 'settings', 'notifications',
  'login', 'signup', 'explore', 'marketplace',
]);

/**
 * Match a URL against domain and github maps.
 * Returns { matches: Array<{name, type, desc, homepage, tap}> }
 */
export function matchUrl(url, domainMap, githubMap) {
  const parsed = parseUrl(url);
  if (!parsed) {
    return { matches: [] };
  }

  return matchParsedUrl(parsed, domainMap, githubMap);
}

/**
 * Match a URL for the page overlay.
 * Large exact-domain buckets are narrowed to entries whose homepage subdomain/path
 * contains the current page, while regular domain matching stays unchanged.
 */
export function matchUrlForOverlay(url, domainMap, githubMap) {
  const parsed = parseUrl(url);
  if (!parsed) {
    return { matches: [] };
  }

  const result = matchParsedUrl(parsed, domainMap, githubMap);
  if (parsed.hostname === GITHUB_HOST || !shouldUsePreciseOverlayMatch(result.matches)) {
    return result;
  }

  return {
    matches: result.matches.filter((match) => homepageMatchesUrl(match.homepage, parsed)),
  };
}

function parseUrl(url) {
  if (!url || typeof url !== 'string') {
    return null;
  }

  try {
    return new URL(url);
  } catch {
    return null;
  }
}

function matchParsedUrl(parsed, domainMap, githubMap) {
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

function shouldUsePreciseOverlayMatch(matches) {
  if (!Array.isArray(matches) || matches.length <= 3) {
    return false;
  }

  const scopes = matches
    .map((match) => homepageScope(match.homepage))
    .filter(Boolean);
  const hostnames = new Set(scopes.map((scope) => scope.hostname));
  const specificScopes = new Set(
    scopes
      .filter((scope) => scope.path !== '/')
      .map((scope) => `${scope.hostname}${scope.path}`)
  );

  return hostnames.size > 1 || specificScopes.size > 1;
}

function homepageScope(homepage) {
  if (!homepage || typeof homepage !== 'string') {
    return null;
  }

  try {
    const parsed = new URL(homepage);
    return {
      hostname: parsed.hostname,
      path: normalizePath(parsed.pathname),
    };
  } catch {
    return null;
  }
}

function homepageMatchesUrl(homepage, currentUrl) {
  const scope = homepageScope(homepage);
  if (!scope || scope.hostname !== currentUrl.hostname) {
    return false;
  }

  return pathIsWithinScope(currentUrl.pathname, scope.path);
}

function pathIsWithinScope(pathname, scopePath) {
  const currentPath = normalizePath(pathname);
  if (scopePath === '/') {
    return currentPath === '/';
  }

  return currentPath === scopePath || currentPath.startsWith(`${scopePath}/`);
}

function normalizePath(pathname) {
  if (!pathname || pathname === '/') {
    return '/';
  }

  return pathname.replace(/\/+$/, '') || '/';
}
