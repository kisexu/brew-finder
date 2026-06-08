# Brew Finder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:kise-subagent-driven-development (recommended) or superpowers:kise-executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Chrome extension that detects Homebrew packages for the current website and a data pipeline that generates domain-to-package mappings from the Homebrew API.

**Architecture:** Monorepo with two independent subsystems — a Node.js data pipeline (`scripts/`) that fetches Homebrew API data and generates JSON mapping files, and a Manifest V3 Chrome extension (`extension/`) with a Service Worker for centralized matching, a content script for in-page overlays, a popup, and an options page. Mapping data is bundled in the extension.

**Tech Stack:** Node.js + vitest (data pipeline), vanilla JS + HTML/CSS + Manifest V3 (Chrome extension), vitest + chrome mock (extension tests)

---

## File Structure

```
brew-finder/
├── scripts/
│   ├── build-maps.js              # Main pipeline: fetch API → generate JSON
│   ├── filters.js                 # Domain filtering rules
│   └── __tests__/
│       ├── filters.test.js        # Tests for filters
│       └── build-maps.test.js     # Tests for build pipeline
├── data/
│   ├── domain-map.json            # Generated: domain → packages
│   ├── github-map.json            # Generated: user/repo → packages
│   └── metadata.json              # Generated: build info
├── extension/
│   ├── manifest.json              # MV3 manifest
│   ├── background/
│   │   └── service-worker.js      # SW: load maps, match, badge
│   ├── content/
│   │   ├── overlay.js             # Content script: inject overlay
│   │   └── overlay.css            # Overlay styles
│   ├── popup/
│   │   ├── popup.html
│   │   ├── popup.js
│   │   └── popup.css
│   ├── options/
│   │   ├── options.html
│   │   ├── options.js
│   │   └── options.css
│   ├── utils/
│   │   ├── matcher.js             # URL matching logic (testable)
│   │   └── storage.js             # chrome.storage wrapper
│   └── icons/
│       └── icon-16.png, icon-32.png, icon-48.png, icon-128.png
├── tests/
│   └── extension/
│       ├── matcher.test.js        # Tests for matching logic
│       └── storage.test.js        # Tests for storage wrapper
├── package.json
├── vitest.config.js
└── .gitignore
```

---

## Task 1: Project Setup

**Files:**
- Create: `package.json`
- Create: `vitest.config.js`
- Create: `.gitignore`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "brew-finder",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "description": "Chrome extension that detects Homebrew packages for any website",
  "scripts": {
    "build:maps": "node scripts/build-maps.js",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "vitest": "^3.1.0"
  }
}
```

- [ ] **Step 2: Create vitest.config.js**

```js
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'scripts/__tests__/**/*.test.js',
      'tests/**/*.test.js',
    ],
  },
});
```

- [ ] **Step 3: Create .gitignore**

```
node_modules/
.superpowers/
```

- [ ] **Step 4: Install dependencies**

Run: `npm install`
Expected: vitest installed, `node_modules/` created

- [ ] **Step 5: Verify vitest runs**

Run: `npx vitest run`
Expected: "No test files found" — exits cleanly

- [ ] **Step 6: Commit**

```bash
git add package.json vitest.config.js .gitignore
git commit -m "chore: project setup with vitest"
```

---

## Task 2: Data Pipeline — filters.js

**Files:**
- Create: `scripts/filters.js`
- Create: `scripts/__tests__/filters.test.js`

- [ ] **Step 1: Write failing tests for domain filtering**

```js
// scripts/__tests__/filters.test.js
import { describe, it, expect } from 'vitest';
import { isValidDomain, shouldExcludeDomain, shouldExcludeUrl } from '../filters.js';

describe('shouldExcludeDomain', () => {
  it('excludes web.archive.org', () => {
    expect(shouldExcludeDomain('web.archive.org')).toBe(true);
  });

  it('excludes archive.org', () => {
    expect(shouldExcludeDomain('archive.org')).toBe(true);
  });

  it('excludes packages.debian.org', () => {
    expect(shouldExcludeDomain('packages.debian.org')).toBe(true);
  });

  it('keeps normal domains', () => {
    expect(shouldExcludeDomain('www.docker.com')).toBe(false);
    expect(shouldExcludeDomain('iterm2.com')).toBe(false);
    expect(shouldExcludeDomain('ffmpeg.org')).toBe(false);
  });
});

describe('shouldExcludeUrl', () => {
  it('excludes non-http URLs', () => {
    expect(shouldExcludeUrl('ftp://example.com')).toBe(true);
    expect(shouldExcludeUrl('chrome://settings')).toBe(true);
    expect(shouldExcludeUrl('about:blank')).toBe(true);
  });

  it('excludes empty/null URLs', () => {
    expect(shouldExcludeUrl('')).toBe(true);
    expect(shouldExcludeUrl(null)).toBe(true);
    expect(shouldExcludeUrl(undefined)).toBe(true);
  });

  it('keeps http URLs', () => {
    expect(shouldExcludeUrl('http://example.com')).toBe(false);
    expect(shouldExcludeUrl('https://www.docker.com')).toBe(false);
  });
});

describe('isValidDomain', () => {
  it('accepts valid domains', () => {
    expect(isValidDomain('www.docker.com')).toBe(true);
    expect(isValidDomain('github.com')).toBe(true);
    expect(isValidDomain('iterm2.com')).toBe(true);
  });

  it('rejects empty strings', () => {
    expect(isValidDomain('')).toBe(false);
    expect(isValidDomain(null)).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run scripts/__tests__/filters.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Implement filters.js**

```js
// scripts/filters.js

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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run scripts/__tests__/filters.test.js`
Expected: All 9 tests PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/filters.js scripts/__tests__/filters.test.js
git commit -m "feat: add domain filtering logic with tests"
```

---

## Task 3: Data Pipeline — build-maps.js

**Files:**
- Create: `scripts/build-maps.js`
- Create: `scripts/__tests__/build-maps.test.js`
- Create: `data/` directory

- [ ] **Step 1: Write failing tests for helper functions**

```js
// scripts/__tests__/build-maps.test.js
import { describe, it, expect } from 'vitest';
import { extractDomain, extractGithubRepo, buildPackageEntry } from '../build-maps.js';

describe('extractDomain', () => {
  it('extracts hostname from URL', () => {
    expect(extractDomain('https://www.docker.com/products/')).toBe('www.docker.com');
    expect(extractDomain('https://iterm2.com')).toBe('iterm2.com');
    expect(extractDomain('https://ffmpeg.org/')).toBe('ffmpeg.org');
  });

  it('returns null for invalid URLs', () => {
    expect(extractDomain('not-a-url')).toBeNull();
    expect(extractDomain('')).toBeNull();
    expect(extractDomain(null)).toBeNull();
  });
});

describe('extractGithubRepo', () => {
  it('extracts user/repo from github URL', () => {
    expect(extractGithubRepo('https://github.com/docker/cli')).toBe('docker/cli');
    expect(extractGithubRepo('https://github.com/FFmpeg/FFmpeg')).toBe('FFmpeg/FFmpeg');
  });

  it('handles URLs with extra path segments', () => {
    expect(extractGithubRepo('https://github.com/docker/cli/issues')).toBe('docker/cli');
    expect(extractGithubRepo('https://github.com/FFmpeg/FFmpeg/tree/master')).toBe('FFmpeg/FFmpeg');
  });

  it('returns null for special github paths', () => {
    expect(extractGithubRepo('https://github.com/topics/docker')).toBeNull();
    expect(extractGithubRepo('https://github.com/trending')).toBeNull();
    expect(extractGithubRepo('https://github.com/settings')).toBeNull();
    expect(extractGithubRepo('https://github.com/notifications')).toBeNull();
  });

  it('returns null for github URLs without repo', () => {
    expect(extractGithubRepo('https://github.com')).toBeNull();
    expect(extractGithubRepo('https://github.com/docker')).toBeNull();
  });

  it('returns null for non-github URLs', () => {
    expect(extractGithubRepo('https://www.docker.com')).toBeNull();
  });
});

describe('buildPackageEntry', () => {
  it('builds entry from formula data', () => {
    const formula = {
      name: 'docker',
      desc: 'Pack, ship and run any application as a lightweight container',
    };
    expect(buildPackageEntry(formula, 'formula')).toEqual({
      name: 'docker',
      type: 'formula',
      desc: 'Pack, ship and run any application as a lightweight container',
    });
  });

  it('builds entry from cask data', () => {
    const cask = {
      token: 'iterm2',
      name: ['iTerm2'],
      desc: 'Terminal emulator',
    };
    expect(buildPackageEntry(cask, 'cask')).toEqual({
      name: 'iterm2',
      type: 'cask',
      desc: 'Terminal emulator',
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run scripts/__tests__/build-maps.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Implement build-maps.js helper functions**

```js
// scripts/build-maps.js
import { writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { shouldExcludeDomain, shouldExcludeUrl, isValidDomain } from './filters.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');

const FORMULA_API = 'https://formulae.brew.sh/api/formula.json';
const CASK_API = 'https://formulae.brew.sh/api/cask.json';

const GITHUB_SPECIAL_PATHS = new Set([
  'topics', 'trending', 'settings', 'notifications',
  'login', 'signup', 'explore', 'marketplace',
]);

/**
 * Extract hostname from a URL string.
 */
export function extractDomain(url) {
  if (!url || typeof url !== 'string') return null;
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

/**
 * Extract "user/repo" from a GitHub homepage URL.
 * Returns null if not a valid project URL.
 */
export function extractGithubRepo(url) {
  if (!url || typeof url !== 'string') return null;
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== 'github.com') return null;
    const segments = parsed.pathname.split('/').filter(Boolean);
    if (segments.length < 2) return null;
    if (GITHUB_SPECIAL_PATHS.has(segments[0])) return null;
    return `${segments[0]}/${segments[1]}`;
  } catch {
    return null;
  }
}

/**
 * Build a package entry object from Homebrew API data.
 */
export function buildPackageEntry(item, type) {
  if (type === 'formula') {
    return {
      name: item.name,
      type: 'formula',
      desc: item.desc || '',
    };
  }
  // cask
  return {
    name: item.token,
    type: 'cask',
    desc: item.desc || '',
  };
}
```

- [ ] **Step 4: Run tests to verify helper functions pass**

Run: `npx vitest run scripts/__tests__/build-maps.test.js`
Expected: All 11 tests PASS

- [ ] **Step 5: Write failing tests for the full build pipeline**

Append to `scripts/__tests__/build-maps.test.js`:

```js
import { buildMaps } from '../build-maps.js';

describe('buildMaps', () => {
  it('processes formulae and casks into domain maps', async () => {
    const formulae = [
      { name: 'docker', desc: 'Container runtime', homepage: 'https://www.docker.com/' },
      { name: 'ffmpeg', desc: 'Media framework', homepage: 'https://ffmpeg.org/' },
    ];
    const casks = [
      { token: 'iterm2', name: ['iTerm2'], desc: 'Terminal', homepage: 'https://iterm2.com/' },
    ];

    const result = await buildMaps(formulae, casks);

    expect(result.domainMap['www.docker.com']).toEqual([
      { name: 'docker', type: 'formula', desc: 'Container runtime' },
    ]);
    expect(result.domainMap['ffmpeg.org']).toEqual([
      { name: 'ffmpeg', type: 'formula', desc: 'Media framework' },
    ]);
    expect(result.domainMap['iterm2.com']).toEqual([
      { name: 'iterm2', type: 'cask', desc: 'Terminal' },
    ]);
    expect(result.githubMap).toEqual({});
    expect(result.metadata.formulaCount).toBe(2);
    expect(result.metadata.caskCount).toBe(1);
    expect(result.metadata.domainCount).toBe(3);
  });

  it('routes github.com URLs to githubMap', async () => {
    const formulae = [
      { name: 'docker', desc: 'Container runtime', homepage: 'https://github.com/docker/cli' },
    ];
    const casks = [];

    const result = await buildMaps(formulae, casks);

    expect(result.githubMap['docker/cli']).toEqual([
      { name: 'docker', type: 'formula', desc: 'Container runtime' },
    ]);
    expect(result.domainMap['github.com']).toBeUndefined();
  });

  it('excludes filtered domains', async () => {
    const formulae = [
      { name: 'archived', desc: 'Old', homepage: 'https://web.archive.org/web/123' },
      { name: 'debian', desc: 'Pkg', homepage: 'https://packages.debian.org/bullseye/htop' },
    ];
    const casks = [];

    const result = await buildMaps(formulae, casks);

    expect(result.domainMap['web.archive.org']).toBeUndefined();
    expect(result.domainMap['packages.debian.org']).toBeUndefined();
    expect(result.metadata.domainCount).toBe(0);
  });

  it('groups multiple packages under the same domain', async () => {
    const formulae = [
      { name: 'pkg1', desc: 'First', homepage: 'https://example.com/' },
      { name: 'pkg2', desc: 'Second', homepage: 'https://example.com/' },
    ];
    const casks = [];

    const result = await buildMaps(formulae, casks);

    expect(result.domainMap['example.com']).toHaveLength(2);
    expect(result.domainMap['example.com'][0].name).toBe('pkg1');
    expect(result.domainMap['example.com'][1].name).toBe('pkg2');
  });
});
```

- [ ] **Step 6: Run tests to verify they fail**

Run: `npx vitest run scripts/__tests__/build-maps.test.js`
Expected: FAIL — `buildMaps` not exported

- [ ] **Step 7: Implement buildMaps function**

Append to `scripts/build-maps.js`:

```js
/**
 * Build domain-map and github-map from Homebrew API data.
 * Pure function — no side effects, returns the maps + metadata.
 */
export function buildMaps(formulae, casks) {
  const domainMap = {};
  const githubMap = {};
  let skippedCount = 0;

  function processItem(item, type) {
    if (shouldExcludeUrl(item.homepage)) {
      skippedCount++;
      return;
    }

    const entry = buildPackageEntry(item, type);

    // GitHub URLs → githubMap
    const repo = extractGithubRepo(item.homepage);
    if (repo) {
      if (!githubMap[repo]) githubMap[repo] = [];
      githubMap[repo].push(entry);
      return;
    }

    // Other URLs → domainMap
    const domain = extractDomain(item.homepage);
    if (!domain || !isValidDomain(domain) || shouldExcludeDomain(domain)) {
      skippedCount++;
      return;
    }

    if (!domainMap[domain]) domainMap[domain] = [];
    domainMap[domain].push(entry);
  }

  for (const f of formulae) processItem(f, 'formula');
  for (const c of casks) processItem(c, 'cask');

  const metadata = {
    buildTime: new Date().toISOString(),
    formulaCount: formulae.length,
    caskCount: casks.length,
    domainCount: Object.keys(domainMap).length,
    githubRepoCount: Object.keys(githubMap).length,
    skippedCount,
  };

  return { domainMap, githubMap, metadata };
}

/**
 * Fetch data from Homebrew API, build maps, and write to data/ directory.
 */
async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  return res.json();
}

async function main() {
  console.log('Fetching Homebrew API data...');
  const [formulae, casks] = await Promise.all([
    fetchJson(FORMULA_API),
    fetchJson(CASK_API),
  ]);
  console.log(`Fetched ${formulae.length} formulae, ${casks.length} casks`);

  console.log('Building maps...');
  const { domainMap, githubMap, metadata } = buildMaps(formulae, casks);

  // Write output files
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(join(DATA_DIR, 'domain-map.json'), JSON.stringify(domainMap, null, 2));
  await writeFile(join(DATA_DIR, 'github-map.json'), JSON.stringify(githubMap, null, 2));
  await writeFile(join(DATA_DIR, 'metadata.json'), JSON.stringify(metadata, null, 2));

  console.log(`Done! ${metadata.domainCount} domains, ${metadata.githubRepoCount} GitHub repos`);
  console.log(`Skipped ${metadata.skippedCount} items`);
}

// Run if executed directly
const isMain = process.argv[1] && (
  process.argv[1].endsWith('build-maps.js') ||
  process.argv[1].endsWith('build-maps')
);
if (isMain) {
  main().catch(err => {
    console.error('Build failed:', err);
    process.exit(1);
  });
}
```

- [ ] **Step 8: Run all tests to verify they pass**

Run: `npx vitest run scripts/__tests__/build-maps.test.js`
Expected: All tests PASS

- [ ] **Step 9: Run the full build to generate data files**

Run: `npm run build:maps`
Expected: Output shows fetched counts and domain/github counts. `data/` directory created with 3 JSON files.

- [ ] **Step 10: Verify generated data**

Run: `ls -la data/`
Expected: `domain-map.json`, `github-map.json`, `metadata.json` all present

Run: `cat data/metadata.json | head -5`
Expected: Valid JSON with buildTime, formulaCount, caskCount, etc.

- [ ] **Step 11: Commit**

```bash
git add scripts/build-maps.js scripts/__tests__/build-maps.test.js data/
git commit -m "feat: data pipeline — fetch Homebrew API and generate mapping files"
```

---

## Task 4: Extension — Matcher Logic

**Files:**
- Create: `extension/utils/matcher.js`
- Create: `tests/extension/matcher.test.js`

- [ ] **Step 1: Write failing tests for URL matching**

```js
// tests/extension/matcher.test.js
import { describe, it, expect } from 'vitest';
import { matchUrl } from '../../extension/utils/matcher.js';

const domainMap = {
  'www.docker.com': [{ name: 'docker', type: 'formula', desc: 'Container runtime' }],
  'iterm2.com': [{ name: 'iterm2', type: 'cask', desc: 'Terminal' }],
  'example.com': [
    { name: 'pkg1', type: 'formula', desc: 'First' },
    { name: 'pkg2', type: 'cask', desc: 'Second' },
  ],
};

const githubMap = {
  'docker/cli': [{ name: 'docker', type: 'formula', desc: 'Container runtime' }],
  'FFmpeg/FFmpeg': [{ name: 'ffmpeg', type: 'formula', desc: 'Media framework' }],
};

describe('matchUrl', () => {
  it('matches non-github domains', () => {
    const result = matchUrl('https://www.docker.com/products/', domainMap, githubMap);
    expect(result.matches).toEqual([{ name: 'docker', type: 'formula', desc: 'Container runtime' }]);
  });

  it('matches github repos by user/repo path', () => {
    const result = matchUrl('https://github.com/docker/cli', domainMap, githubMap);
    expect(result.matches).toEqual([{ name: 'docker', type: 'formula', desc: 'Container runtime' }]);
  });

  it('matches github repos with extra path segments', () => {
    const result = matchUrl('https://github.com/FFmpeg/FFmpeg/tree/master', domainMap, githubMap);
    expect(result.matches).toEqual([{ name: 'ffmpeg', type: 'formula', desc: 'Media framework' }]);
  });

  it('returns empty matches for unknown domains', () => {
    const result = matchUrl('https://unknown-site.com/page', domainMap, githubMap);
    expect(result.matches).toEqual([]);
  });

  it('skips github special paths', () => {
    const result = matchUrl('https://github.com/topics/docker', domainMap, githubMap);
    expect(result.matches).toEqual([]);
  });

  it('skips github URLs without repo', () => {
    const result = matchUrl('https://github.com/docker', domainMap, githubMap);
    expect(result.matches).toEqual([]);
  });

  it('returns multiple matches for domains with multiple packages', () => {
    const result = matchUrl('https://example.com/', domainMap, githubMap);
    expect(result.matches).toHaveLength(2);
  });

  it('handles invalid URLs gracefully', () => {
    const result = matchUrl('not-a-url', domainMap, githubMap);
    expect(result.matches).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/extension/matcher.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Implement matcher.js**

```js
// extension/utils/matcher.js

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

  // GitHub → match by user/repo
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

  // Other domains → match by hostname
  const matches = domainMap[hostname] || [];
  return { matches };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/extension/matcher.test.js`
Expected: All 8 tests PASS

- [ ] **Step 5: Commit**

```bash
git add extension/utils/matcher.js tests/extension/matcher.test.js
git commit -m "feat: URL matching logic with tests"
```

---

## Task 5: Extension — Storage Utility

**Files:**
- Create: `extension/utils/storage.js`
- Create: `tests/extension/storage.test.js`

- [ ] **Step 1: Write failing tests for storage wrapper**

```js
// tests/extension/storage.test.js
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/extension/storage.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Implement storage.js**

```js
// extension/utils/storage.js

export const SETTINGS_DEFAULTS = {
  badgeEnabled: true,
  overlayEnabled: true,
  overlayPermanentlyDismissed: false,
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/extension/storage.test.js`
Expected: All 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add extension/utils/storage.js tests/extension/storage.test.js
git commit -m "feat: chrome storage wrapper with tests"
```

---

## Task 6: Extension — Manifest & Icons

**Files:**
- Create: `extension/manifest.json`
- Create: `extension/icons/icon-16.png`
- Create: `extension/icons/icon-32.png`
- Create: `extension/icons/icon-48.png`
- Create: `extension/icons/icon-128.png`

- [ ] **Step 1: Create manifest.json**

```json
{
  "manifest_version": 3,
  "name": "Brew Finder",
  "version": "1.0.0",
  "description": "Detect Homebrew packages for any website",
  "permissions": ["activeTab", "storage"],
  "host_permissions": [],
  "background": {
    "service_worker": "background/service-worker.js",
    "type": "module"
  },
  "web_accessible_resources": [{
    "resources": ["data/*.json"],
    "matches": ["<all_urls>"]
  }],
  "content_scripts": [
    {
      "matches": ["http://*/*", "https://*/*"],
      "js": ["content/overlay.js"],
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

- [ ] **Step 2: Create placeholder icons**

Create simple PNG icons (16x16, 32x32, 48x48, 128x128) with a beer mug emoji or "BF" text on a colored background. Use any image tool or generate with a script:

```bash
# Use sips (macOS built-in) to create simple colored squares as placeholders
# Replace with proper icons later
for size in 16 32 48 128; do
  # Create a minimal 1x1 PNG and resize (placeholder)
  printf '\x89PNG\r\n\x1a\n' > extension/icons/icon-${size}.png
done
```

Alternatively, create the icons manually or use an online icon generator. The icons are placeholders — they work for development and can be replaced with polished icons later.

- [ ] **Step 3: Commit**

```bash
git add extension/manifest.json extension/icons/
git commit -m "feat: manifest.json and placeholder icons"
```

---

## Task 7: Extension — Service Worker

**Files:**
- Create: `extension/background/service-worker.js`

- [ ] **Step 1: Implement service-worker.js**

```js
// extension/background/service-worker.js
import { matchUrl } from '../utils/matcher.js';
import { getSettings, updateSetting } from '../utils/storage.js';

let domainMap = {};
let githubMap = {};
let mapsReady = false;

/**
 * Load mapping data from bundled JSON files.
 */
async function loadMaps() {
  try {
    const [domainRes, githubRes] = await Promise.all([
      fetch(chrome.runtime.getURL('data/domain-map.json')),
      fetch(chrome.runtime.getURL('data/github-map.json')),
    ]);
    domainMap = await domainRes.json();
    githubMap = await githubRes.json();
    mapsReady = true;
    console.log(`Brew Finder: loaded ${Object.keys(domainMap).length} domains, ${Object.keys(githubMap).length} repos`);
  } catch (err) {
    console.error('Brew Finder: failed to load maps', err);
    domainMap = {};
    githubMap = {};
  }
}

// Store the init promise so message handlers can await it
const initPromise = loadMaps();

/**
 * Update the badge for a tab based on match count.
 */
async function updateBadge(tabId, matchCount) {
  const settings = await getSettings();
  if (!settings.badgeEnabled) {
    chrome.action.setBadgeText({ tabId, text: '' });
    return;
  }

  if (matchCount > 0) {
    chrome.action.setBadgeText({ tabId, text: String(matchCount) });
    chrome.action.setBadgeBackgroundColor({ tabId, color: '#e94560' });
  } else {
    chrome.action.setBadgeText({ tabId, text: '' });
  }
}

/**
 * Handle a match request from content script or tab update.
 * Awaits map initialization to prevent empty results on early requests.
 */
async function handleMatch(url, tabId) {
  await initPromise;
  const result = matchUrl(url, domainMap, githubMap);
  await updateBadge(tabId, result.matches.length);
  return result;
}

// Listen for messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'MATCH_URL') {
    handleMatch(message.url, sender.tab.id).then(sendResponse);
    return true; // async response
  }

  if (message.type === 'OVERLAY_DISMISSED') {
    if (message.permanent) {
      updateSetting('overlayPermanentlyDismissed', true);
    }
    sendResponse({ ok: true });
    return false;
  }

  if (message.type === 'GET_CURRENT_MATCH') {
    // Popup requesting current tab's match
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        handleMatch(tabs[0].url, tabs[0].id).then(sendResponse);
      } else {
        sendResponse({ matches: [] });
      }
    });
    return true;
  }
});

// Re-match when tab URL changes
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    handleMatch(tab.url, tabId);
  }
});

// Re-match when switching tabs
chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  const tab = await chrome.tabs.get(tabId);
  if (tab.url) {
    handleMatch(tab.url, tabId);
  }
});

// Initialize (loadMaps already called via initPromise above)
```

- [ ] **Step 2: Commit**

```bash
git add extension/background/service-worker.js
git commit -m "feat: service worker with map loading, matching, and badge"
```

---

## Task 8: Extension — Content Script (Overlay)

**Files:**
- Create: `extension/content/overlay.js`
- Create: `extension/content/overlay.css`

- [ ] **Step 1: Create overlay.css**

```css
/* extension/content/overlay.css */

#brew-finder-overlay {
  position: fixed;
  bottom: 16px;
  right: 16px;
  z-index: 2147483647;
  background: #1a1a2e;
  border: 1px solid #333;
  border-radius: 12px;
  padding: 14px 18px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
  max-width: 300px;
  min-width: 260px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  font-size: 13px;
  color: #e0e0e0;
  line-height: 1.4;
}

#brew-finder-overlay .bf-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

#brew-finder-overlay .bf-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: bold;
  font-size: 13px;
}

#brew-finder-overlay .bf-close {
  background: none;
  border: none;
  color: #888;
  cursor: pointer;
  font-size: 16px;
  padding: 0;
  line-height: 1;
}

#brew-finder-overlay .bf-close:hover {
  color: #fff;
}

#brew-finder-overlay .bf-desc {
  font-size: 12px;
  color: #aaa;
  margin-bottom: 8px;
}

#brew-finder-overlay .bf-command-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

#brew-finder-overlay .bf-command {
  background: #0d0d1a;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-family: monospace;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

#brew-finder-overlay .bf-copy {
  background: #e94560;
  border: none;
  color: white;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 11px;
  cursor: pointer;
}

#brew-finder-overlay .bf-copy:hover {
  background: #d63851;
}

/* Dismiss confirmation */
#brew-finder-overlay .bf-dismiss-confirm {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid #333;
  font-size: 11px;
  color: #aaa;
}

#brew-finder-overlay .bf-dismiss-actions {
  display: flex;
  gap: 8px;
  margin-top: 6px;
}

#brew-finder-overlay .bf-dismiss-btn {
  background: #333;
  border: none;
  color: #ccc;
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 11px;
  cursor: pointer;
}

#brew-finder-overlay .bf-dismiss-btn:hover {
  background: #444;
}

#brew-finder-overlay .bf-dismiss-btn.permanent {
  background: #e94560;
  color: white;
}
```

- [ ] **Step 2: Create overlay.js**

```js
// extension/content/overlay.js

(function () {
  const OVERLAY_ID = 'brew-finder-overlay';

  // Don't inject on special pages
  if (location.protocol === 'chrome:' || location.protocol === 'about:' || location.protocol === 'file:') {
    return;
  }

  /**
   * Create and inject the overlay into the page.
   */
  function showOverlay(matches) {
    // Remove existing overlay if any
    removeOverlay();

    const overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;

    // Build match cards
    const matchCards = matches.map((m) => `
      <div style="margin-bottom: 6px;">
        <div class="bf-desc">${escapeHtml(m.desc)}</div>
        <div class="bf-command-row">
          <code class="bf-command">brew install ${escapeHtml(m.name)}</code>
          <button class="bf-copy" data-cmd="brew install ${escapeHtml(m.name)}">📋</button>
        </div>
      </div>
    `).join('');

    overlay.innerHTML = `
      <div class="bf-header">
        <div class="bf-title">🍺 Brew Finder</div>
        <button class="bf-close" title="关闭">✕</button>
      </div>
      <div class="bf-body">此软件可通过 Homebrew 安装：</div>
      ${matchCards}
    `;

    document.body.appendChild(overlay);

    // Event listeners
    overlay.querySelector('.bf-close').addEventListener('click', handleClose);
    overlay.querySelectorAll('.bf-copy').forEach((btn) => {
      btn.addEventListener('click', () => {
        const cmd = btn.dataset.cmd;
        navigator.clipboard.writeText(cmd).then(() => {
          btn.textContent = '✓';
          setTimeout(() => { btn.textContent = '📋'; }, 1500);
        });
      });
    });
  }

  /**
   * Handle close button click — show dismiss confirmation.
   */
  function handleClose() {
    const overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) return;

    // Check if already showing dismiss confirm
    if (overlay.querySelector('.bf-dismiss-confirm')) {
      removeOverlay();
      return;
    }

    const confirm = document.createElement('div');
    confirm.className = 'bf-dismiss-confirm';
    confirm.innerHTML = `
      <div>是否永久关闭页面浮层？</div>
      <div class="bf-dismiss-actions">
        <button class="bf-dismiss-btn" id="bf-dismiss-once">仅本次</button>
        <button class="bf-dismiss-btn permanent" id="bf-dismiss-forever">永久关闭</button>
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
    return div.innerHTML;
  }

  // Request match from service worker
  chrome.runtime.sendMessage({ type: 'MATCH_URL', url: location.href }, (response) => {
    if (chrome.runtime.lastError) return; // SW not ready
    if (!response || !response.matches || response.matches.length === 0) return;

    // Check if overlay is enabled and not permanently dismissed
    chrome.storage.local.get(['overlayEnabled', 'overlayPermanentlyDismissed'], (settings) => {
      if (settings.overlayEnabled === false) return;
      if (settings.overlayPermanentlyDismissed === true) return;
      showOverlay(response.matches);
    });
  });
})();
```

- [ ] **Step 3: Commit**

```bash
git add extension/content/overlay.js extension/content/overlay.css
git commit -m "feat: content script with page overlay"
```

---

## Task 9: Extension — Popup

**Files:**
- Create: `extension/popup/popup.html`
- Create: `extension/popup/popup.js`
- Create: `extension/popup/popup.css`

- [ ] **Step 1: Create popup.css**

```css
/* extension/popup/popup.css */

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  background: #1a1a2e;
  color: #e0e0e0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  font-size: 13px;
  min-width: 320px;
  padding: 16px;
}

.bf-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
}

.bf-header .bf-logo {
  font-size: 20px;
}

.bf-header .bf-title {
  font-weight: bold;
  font-size: 16px;
}

.bf-package {
  background: #2d2d2d;
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 8px;
}

.bf-package-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}

.bf-package-name {
  font-weight: bold;
}

.bf-type-badge {
  background: #0f3460;
  color: #7ec8e3;
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 4px;
}

.bf-type-badge.cask {
  background: #533483;
  color: #c4a8e3;
}

.bf-package-desc {
  color: #aaa;
  font-size: 12px;
  margin-bottom: 10px;
}

.bf-command-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.bf-command {
  background: #0d0d1a;
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 12px;
  font-family: monospace;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bf-copy {
  background: #e94560;
  border: none;
  color: white;
  padding: 4px 12px;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
}

.bf-copy:hover {
  background: #d63851;
}

.bf-empty {
  text-align: center;
  padding: 24px 0;
  color: #888;
}

.bf-empty .bf-empty-icon {
  font-size: 32px;
  margin-bottom: 8px;
}

.bf-current-url {
  color: #666;
  font-size: 11px;
  text-align: center;
  margin-top: 8px;
}
```

- [ ] **Step 2: Create popup.html**

```html
<!DOCTYPE html>
<html lang="zh-CN">
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
      <div>正在检测...</div>
    </div>
  </div>
  <div id="bf-current-url" class="bf-current-url"></div>
  <script src="popup.js"></script>
</body>
</html>
```

- [ ] **Step 3: Create popup.js**

```js
// extension/popup/popup.js

const contentEl = document.getElementById('bf-content');
const urlEl = document.getElementById('bf-current-url');

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function renderMatches(matches, currentUrl) {
  if (!matches || matches.length === 0) {
    contentEl.innerHTML = `
      <div class="bf-empty">
        <div class="bf-empty-icon">🔍</div>
        <div>当前网站未找到 Homebrew 包</div>
      </div>
    `;
    return;
  }

  contentEl.innerHTML = matches.map((m) => `
    <div class="bf-package">
      <div class="bf-package-header">
        <span class="bf-package-name">${escapeHtml(m.name)}</span>
        <span class="bf-type-badge ${m.type}">${escapeHtml(m.type)}</span>
      </div>
      <div class="bf-package-desc">${escapeHtml(m.desc)}</div>
      <div class="bf-command-row">
        <code class="bf-command">brew install ${escapeHtml(m.name)}</code>
        <button class="bf-copy" data-cmd="brew install ${escapeHtml(m.name)}">📋</button>
      </div>
    </div>
  `).join('');

  // Add copy button listeners
  contentEl.querySelectorAll('.bf-copy').forEach((btn) => {
    btn.addEventListener('click', () => {
      const cmd = btn.dataset.cmd;
      navigator.clipboard.writeText(cmd).then(() => {
        btn.textContent = '✓';
        setTimeout(() => { btn.textContent = '📋'; }, 1500);
      });
    });
  });
}

// Get current tab info and request match
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  if (!tabs[0]) return;
  const tab = tabs[0];

  urlEl.textContent = `当前页面：${new URL(tab.url).hostname}`;

  chrome.runtime.sendMessage({ type: 'GET_CURRENT_MATCH' }, (response) => {
    if (chrome.runtime.lastError || !response) {
      renderMatches([], tab.url);
      return;
    }
    renderMatches(response.matches, tab.url);
  });
});
```

- [ ] **Step 4: Commit**

```bash
git add extension/popup/popup.html extension/popup/popup.js extension/popup/popup.css
git commit -m "feat: popup UI with package display and copy"
```

---

## Task 10: Extension — Options Page

**Files:**
- Create: `extension/options/options.html`
- Create: `extension/options/options.js`
- Create: `extension/options/options.css`

- [ ] **Step 1: Create options.css**

```css
/* extension/options/options.css */

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  background: #1a1a2e;
  color: #e0e0e0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  font-size: 14px;
  display: flex;
  justify-content: center;
  padding: 48px 16px;
}

.options-container {
  max-width: 480px;
  width: 100%;
}

.options-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 32px;
}

.options-header .logo {
  font-size: 28px;
}

.options-header .title {
  font-weight: bold;
  font-size: 22px;
}

.setting-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 0;
  border-bottom: 1px solid #333;
}

.setting-info .setting-label {
  font-weight: bold;
  margin-bottom: 4px;
}

.setting-info .setting-desc {
  color: #888;
  font-size: 12px;
}

/* Toggle switch */
.toggle {
  width: 44px;
  height: 24px;
  background: #444;
  border-radius: 12px;
  position: relative;
  cursor: pointer;
  transition: background 0.2s;
}

.toggle.active {
  background: #e94560;
}

.toggle .toggle-knob {
  width: 20px;
  height: 20px;
  background: white;
  border-radius: 50%;
  position: absolute;
  top: 2px;
  left: 2px;
  transition: left 0.2s;
}

.toggle.active .toggle-knob {
  left: 22px;
}

/* Reset button */
.reset-btn {
  background: #333;
  border: none;
  color: #aaa;
  padding: 6px 14px;
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
}

.reset-btn:hover {
  background: #444;
  color: #ccc;
}

/* Metadata */
.metadata {
  margin-top: 24px;
  padding: 14px;
  background: #0d0d1a;
  border-radius: 8px;
}

.metadata div {
  color: #888;
  font-size: 12px;
  line-height: 1.8;
}
```

- [ ] **Step 2: Create options.html**

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="options.css">
</head>
<body>
  <div class="options-container">
    <div class="options-header">
      <span class="logo">🍺</span>
      <span class="title">Brew Finder 设置</span>
    </div>

    <div class="setting-row">
      <div class="setting-info">
        <div class="setting-label">Badge 徽标</div>
        <div class="setting-desc">在插件图标上显示匹配数量</div>
      </div>
      <div class="toggle active" id="toggle-badge">
        <div class="toggle-knob"></div>
      </div>
    </div>

    <div class="setting-row">
      <div class="setting-info">
        <div class="setting-label">页面浮层</div>
        <div class="setting-desc">在页面右下角显示安装提醒</div>
      </div>
      <div class="toggle active" id="toggle-overlay">
        <div class="toggle-knob"></div>
      </div>
    </div>

    <div class="setting-row">
      <div class="setting-info">
        <div class="setting-label">重置浮层关闭状态</div>
        <div class="setting-desc">恢复浮层的"永久关闭"提示</div>
      </div>
      <button class="reset-btn" id="btn-reset-dismiss">重置</button>
    </div>

    <div class="metadata" id="metadata">
      <div>加载中...</div>
    </div>
  </div>

  <script src="options.js"></script>
</body>
</html>
```

- [ ] **Step 3: Create options.js**

```js
// extension/options/options.js

const toggleBadge = document.getElementById('toggle-badge');
const toggleOverlay = document.getElementById('toggle-overlay');
const btnResetDismiss = document.getElementById('btn-reset-dismiss');
const metadataEl = document.getElementById('metadata');

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

// Load settings
chrome.storage.local.get(
  ['badgeEnabled', 'overlayEnabled', 'overlayPermanentlyDismissed'],
  (result) => {
    setToggle(toggleBadge, result.badgeEnabled !== false);
    setToggle(toggleOverlay, result.overlayEnabled !== false);
  }
);

initToggle(toggleBadge, 'badgeEnabled');
initToggle(toggleOverlay, 'overlayEnabled');

// Reset dismiss state
btnResetDismiss.addEventListener('click', () => {
  chrome.storage.local.set({ overlayPermanentlyDismissed: false });
  btnResetDismiss.textContent = '已重置';
  setTimeout(() => { btnResetDismiss.textContent = '重置'; }, 1500);
});

// Load metadata
fetch(chrome.runtime.getURL('data/metadata.json'))
  .then((res) => res.json())
  .then((meta) => {
    metadataEl.innerHTML = `
      <div>映射数据版本：${meta.buildTime.split('T')[0]}</div>
      <div>覆盖包数量：${(meta.formulaCount + meta.caskCount).toLocaleString()}</div>
      <div>覆盖域名数：${meta.domainCount.toLocaleString()}</div>
    `;
  })
  .catch(() => {
    metadataEl.innerHTML = '<div>无法加载元数据</div>';
  });
```

- [ ] **Step 4: Commit**

```bash
git add extension/options/options.html extension/options/options.js extension/options/options.css
git commit -m "feat: options page with settings toggles"
```

---

## Task 11: Integration — Wire Data into Extension

**Files:**
- Create: `extension/data/` (symlink or copy from `data/`)

- [ ] **Step 1: Copy mapping data into extension directory**

The mapping data lives in `data/` but the extension needs it at `extension/data/`. Create a build step to copy:

```bash
mkdir -p extension/data
cp data/*.json extension/data/
```

- [ ] **Step 2: Add build script to package.json**

Update `package.json` scripts:

```json
{
  "scripts": {
    "build:maps": "node scripts/build-maps.js",
    "build:extension": "mkdir -p extension/data && cp data/*.json extension/data/",
    "build": "npm run build:maps && npm run build:extension",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

- [ ] **Step 3: Add extension/data/ to .gitignore**

Since `data/` is the source of truth and `extension/data/` is a copy, gitignore the copy:

```
node_modules/
.superpowers/
extension/data/
```

- [ ] **Step 4: Run full build and verify**

Run: `npm run build`
Expected: Both steps succeed, `extension/data/` contains 3 JSON files

- [ ] **Step 5: Commit**

```bash
git add package.json .gitignore
git commit -m "chore: add build:extension script to copy data"
```

---

## Task 12: Manual Testing & Verification

- [ ] **Step 1: Run all unit tests**

Run: `npx vitest run`
Expected: All tests pass across all test files

- [ ] **Step 2: Load extension in Chrome**

1. Open `chrome://extensions/`
2. Enable "Developer mode" (top right)
3. Click "Load unpacked"
4. Select the `extension/` directory
5. Verify extension loads without errors

- [ ] **Step 3: Test badge on known sites**

1. Visit `https://www.docker.com/` — badge should show "1"
2. Visit `https://iterm2.com/` — badge should show "1"
3. Visit `https://github.com/FFmpeg/FFmpeg` — badge should show "1"
4. Visit `https://example.com/` — badge should be empty

- [ ] **Step 4: Test popup**

1. Visit `https://www.docker.com/`
2. Click the extension icon
3. Verify popup shows: package name "docker", type "formula", description, brew install command
4. Click the copy button, verify clipboard contains "brew install docker"

- [ ] **Step 5: Test overlay**

1. Visit `https://www.docker.com/`
2. Verify overlay appears in bottom-right corner
3. Verify overlay shows brew install command
4. Click copy button, verify clipboard
5. Click ✕, verify dismiss confirmation appears
6. Click "仅本次", verify overlay disappears
7. Reload page, verify overlay reappears

- [ ] **Step 6: Test permanent dismiss**

1. Visit a matching site, click ✕ on overlay
2. Click "永久关闭"
3. Reload page — overlay should NOT appear
4. Go to settings, click "重置"
5. Reload page — overlay should appear again

- [ ] **Step 7: Test settings page**

1. Open extension options
2. Toggle badge off, visit a matching site — badge should not show
3. Toggle badge back on — badge should show
4. Toggle overlay off, visit a matching site — overlay should not appear
5. Toggle overlay back on — overlay should appear
6. Verify metadata section shows data version and counts

- [ ] **Step 8: Commit final state**

```bash
git add -A
git commit -m "chore: final integration verified"
```
