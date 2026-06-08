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
