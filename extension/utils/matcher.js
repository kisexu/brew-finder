const GITHUB_HOST = 'github.com';
const GITHUB_SPECIAL_PATHS = new Set([
  'topics', 'trending', 'settings', 'notifications',
  'login', 'signup', 'explore', 'marketplace',
]);
const POPUP_ROOT_DOMAIN_LIMIT = 20;
const OVERLAY_INLINE_LIMIT = 3;
const MULTI_PART_PUBLIC_SUFFIXES = new Set([
  'co.uk', 'org.uk', 'ac.uk', 'gov.uk',
  'com.au', 'net.au', 'org.au', 'edu.au',
  'co.jp', 'ne.jp', 'or.jp', 'ac.jp',
  'com.cn', 'net.cn', 'org.cn', 'edu.cn',
  'com.br', 'com.mx', 'com.tr', 'com.tw',
]);
const HOSTED_PRIVATE_SUFFIXES = new Set([
  'github.io', 'gitlab.io', 'codeberg.page',
  'pages.dev', 'workers.dev',
  'vercel.app', 'netlify.app', 'herokuapp.com',
  'appspot.com', 'firebaseapp.com', 'web.app',
  'readthedocs.io', 'sourceforge.io',
  'blogspot.com', 'wordpress.com', 'tumblr.com',
  'glitch.me', 'surge.sh', 'neocities.org',
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
 * Match a URL for the extension popup.
 * Non-GitHub pages match every package whose homepage shares the same root domain.
 */
export function matchUrlForPopup(url, domainMap, githubMap) {
  const parsed = parseUrl(url);
  if (!parsed) {
    return { matches: [] };
  }

  if (parsed.hostname === GITHUB_HOST) {
    return matchParsedUrl(parsed, domainMap, githubMap);
  }

  const exactResult = matchParsedUrl(parsed, domainMap, githubMap);
  const matches = rootDomainMatches(parsed.hostname, domainMap);
  if (matches.length > 0 && matches.length <= POPUP_ROOT_DOMAIN_LIMIT) {
    return { matches };
  }

  if (exactResult.matches.length > POPUP_ROOT_DOMAIN_LIMIT) {
    return {
      matches: exactResult.matches.filter((match) => homepageMatchesUrl(match.homepage, parsed)),
    };
  }

  return exactResult;
}

/**
 * Match a URL for the page overlay.
 * Root-domain candidates are shown when concise, then narrowed by homepage
 * subdomain/path once there are more than three candidates.
 */
export function matchUrlForOverlay(url, domainMap, githubMap) {
  const parsed = parseUrl(url);
  if (!parsed) {
    return { matches: [] };
  }

  if (parsed.hostname === GITHUB_HOST) {
    return matchParsedUrl(parsed, domainMap, githubMap);
  }

  const rootMatches = rootDomainMatches(parsed.hostname, domainMap);
  if (rootMatches.length > 0 && rootMatches.length <= OVERLAY_INLINE_LIMIT) {
    return { matches: rootMatches };
  }

  const exactResult = matchParsedUrl(parsed, domainMap, githubMap);
  if (exactResult.matches.length > 0) {
    if (exactResult.matches.length <= OVERLAY_INLINE_LIMIT) {
      return exactResult;
    }

    return {
      matches: exactResult.matches.filter((match) => homepageMatchesUrl(match.homepage, parsed)),
    };
  }

  return {
    matches: [],
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

function rootDomainMatches(hostname, domainMap) {
  const rootDomain = rootDomainForHostname(hostname);
  if (!rootDomain) {
    return [];
  }

  const matches = [];
  const seen = new Set();

  Object.values(domainMap || {}).forEach((domainMatches) => {
    domainMatches.forEach((match) => {
      const scope = homepageScope(match.homepage);
      if (!scope || rootDomainForHostname(scope.hostname) !== rootDomain) {
        return;
      }

      const key = `${match.type}:${match.name}:${match.homepage || ''}`;
      if (seen.has(key)) {
        return;
      }

      seen.add(key);
      matches.push(match);
    });
  });

  return matches;
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

export function rootDomainForHostname(hostname) {
  if (!hostname || typeof hostname !== 'string') {
    return '';
  }

  const labels = hostname.toLowerCase().replace(/\.$/, '').split('.').filter(Boolean);
  if (labels.length <= 2) {
    return labels.join('.');
  }

  const lastTwo = labels.slice(-2).join('.');
  if (HOSTED_PRIVATE_SUFFIXES.has(lastTwo)) {
    return labels.slice(-3).join('.');
  }

  if (MULTI_PART_PUBLIC_SUFFIXES.has(lastTwo)) {
    return labels.slice(-3).join('.');
  }

  return lastTwo;
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
