import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { shouldExcludeDomain, shouldExcludeUrl, isValidDomain } from './filters.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_DATA_DIR = join(__dirname, '..', 'data');

const FORMULA_API = 'https://formulae.brew.sh/api/formula.json';
const CASK_API = 'https://formulae.brew.sh/api/cask.json';
const DEFAULT_MINIMUMS = {
  formulaCount: 1000,
  caskCount: 1000,
  domainCount: 1000,
  githubRepoCount: 500,
};

const GITHUB_SPECIAL_PATHS = new Set([
  'topics', 'trending', 'settings', 'notifications',
  'login', 'signup', 'explore', 'marketplace',
]);

function compareStrings(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function stableMap(map) {
  return Object.fromEntries(
    Object.entries(map)
      .sort(([left], [right]) => compareStrings(left, right))
      .map(([key, entries]) => [
        key,
        entries.sort((left, right) => compareStrings(
          [left.name, left.type, left.homepage, left.tap, left.desc].join('\u0000'),
          [right.name, right.type, right.homepage, right.tap, right.desc].join('\u0000'),
        )),
      ]),
  );
}

function jsonText(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function parseJsonArray(source, label) {
  let data;
  try {
    data = JSON.parse(source);
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error.message}`);
  }
  if (!Array.isArray(data)) {
    throw new Error(`${label} must contain a top-level JSON array`);
  }
  return data;
}

function validateItems(items, type) {
  const identifier = type === 'formula' ? 'name' : 'token';
  const invalidIndex = items.findIndex(item => (
    !item || typeof item !== 'object' || typeof item[identifier] !== 'string' || !item[identifier]
  ));
  if (invalidIndex !== -1) {
    throw new Error(`${type} input item ${invalidIndex} is missing a valid ${identifier}`);
  }
}

/** Extract hostname from a URL string. */
export function extractDomain(url) {
  if (!url || typeof url !== 'string') return null;
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

/** Extract "user/repo" from a GitHub homepage URL. */
export function extractGithubRepo(url) {
  if (!url || typeof url !== 'string') return null;
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== 'github.com') return null;
    const segments = parsed.pathname.split('/').filter(Boolean);
    if (segments.length < 2 || GITHUB_SPECIAL_PATHS.has(segments[0])) return null;
    return `${segments[0]}/${segments[1]}`;
  } catch {
    return null;
  }
}

/** Build a package entry object from Homebrew API data. */
export function buildPackageEntry(item, type) {
  if (type === 'formula') {
    return {
      name: item.name,
      type: 'formula',
      desc: item.desc || '',
      homepage: item.homepage || '',
      tap: item.tap || '',
    };
  }
  return {
    name: item.token,
    type: 'cask',
    desc: item.desc || '',
    homepage: item.homepage || '',
    tap: item.tap || '',
  };
}

/** Build deterministic maps from parsed Homebrew API inputs. */
export function buildMaps(formulae, casks, { buildTime = new Date().toISOString() } = {}) {
  validateItems(formulae, 'formula');
  validateItems(casks, 'cask');

  const domainMap = {};
  const githubMap = {};
  let skippedCount = 0;

  function processItem(item, type) {
    if (shouldExcludeUrl(item.homepage)) {
      skippedCount++;
      return;
    }

    const entry = buildPackageEntry(item, type);
    const repo = extractGithubRepo(item.homepage);
    if (repo) {
      if (!githubMap[repo]) githubMap[repo] = [];
      githubMap[repo].push(entry);
      return;
    }

    const domain = extractDomain(item.homepage);
    if (!domain || !isValidDomain(domain) || shouldExcludeDomain(domain)) {
      skippedCount++;
      return;
    }

    if (!domainMap[domain]) domainMap[domain] = [];
    domainMap[domain].push(entry);
  }

  for (const formula of formulae) processItem(formula, 'formula');
  for (const cask of casks) processItem(cask, 'cask');

  const stableDomainMap = stableMap(domainMap);
  const stableGithubMap = stableMap(githubMap);
  const metadata = {
    buildTime,
    formulaCount: formulae.length,
    caskCount: casks.length,
    domainCount: Object.keys(stableDomainMap).length,
    githubRepoCount: Object.keys(stableGithubMap).length,
    skippedCount,
  };

  return { domainMap: stableDomainMap, githubMap: stableGithubMap, metadata };
}

/** Serialize maps and add checksums for the exact input and functional output bytes. */
export function createBuildArtifacts(formulae, casks, {
  buildTime = new Date().toISOString(),
  inputSources,
} = {}) {
  const { domainMap, githubMap, metadata } = buildMaps(formulae, casks, { buildTime });
  const domainMapJson = jsonText(domainMap);
  const githubMapJson = jsonText(githubMap);
  const completeMetadata = {
    ...metadata,
    inputChecksums: {
      formulaeSha256: sha256(inputSources.formulae),
      casksSha256: sha256(inputSources.casks),
    },
    outputChecksums: {
      domainMapSha256: sha256(domainMapJson),
      githubMapSha256: sha256(githubMapJson),
    },
  };

  return {
    domainMap,
    githubMap,
    metadata: completeMetadata,
    domainMapJson,
    githubMapJson,
    metadataJson: jsonText(completeMetadata),
  };
}

/** Fail closed when a build is implausibly small or drops sharply from a baseline. */
export function validateBuildCounts(metadata, {
  minimums = DEFAULT_MINIMUMS,
  baseline,
  maxChangePercent = 20,
} = {}) {
  for (const [field, minimum] of Object.entries(minimums)) {
    if (metadata[field] < minimum) {
      throw new Error(`${field} ${metadata[field]} is below minimum ${minimum}`);
    }
  }

  if (!baseline) return;
  for (const field of Object.keys(DEFAULT_MINIMUMS)) {
    const previous = baseline[field];
    if (!Number.isFinite(previous) || previous <= 0) continue;
    const changePercent = ((metadata[field] - previous) / previous) * 100;
    if (Math.abs(changePercent) > maxChangePercent) {
      const direction = changePercent < 0 ? 'dropped' : 'increased';
      throw new Error(
        `${field} ${direction} ${Math.abs(changePercent).toFixed(2)}% ` +
        `from ${previous} to ${metadata[field]} (maximum ${maxChangePercent}%)`,
      );
    }
  }
}

/** Fetch a JSON array with timeout and bounded retries for transient failures. */
export async function fetchJson(url, {
  fetchImpl = fetch,
  retries = 3,
  timeoutMs = 30_000,
  retryDelayMs = 1_000,
} = {}) {
  let lastError;
  for (let attempt = 1; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, { signal: controller.signal });
      if (!response.ok) {
        const error = new Error(`Failed to fetch ${url}: HTTP ${response.status}`);
        error.retryable = response.status === 429 || response.status >= 500;
        throw error;
      }
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.toLowerCase().includes('application/json')) {
        throw new Error(`Failed to fetch ${url}: expected JSON Content-Type, got ${contentType || 'none'}`);
      }
      const source = await response.text();
      return { data: parseJsonArray(source, url), source };
    } catch (error) {
      lastError = error;
      const retryable = error.retryable !== false && (
        error.retryable === true || error.name === 'AbortError' || error instanceof TypeError
      );
      if (!retryable || attempt === retries) break;
      await delay(retryDelayMs * (2 ** (attempt - 1)));
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError;
}

function numberOption(value, name) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new Error(`--${name} must be a non-negative number`);
  return number;
}

function parseCli(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      'formula-file': { type: 'string' },
      'cask-file': { type: 'string' },
      'input-dir': { type: 'string' },
      'output-dir': { type: 'string', default: DEFAULT_DATA_DIR },
      'baseline-metadata': { type: 'string' },
      'build-time': { type: 'string' },
      'max-count-change-percent': { type: 'string', default: '20' },
      'min-formula': { type: 'string', default: String(DEFAULT_MINIMUMS.formulaCount) },
      'min-cask': { type: 'string', default: String(DEFAULT_MINIMUMS.caskCount) },
      'min-domain': { type: 'string', default: String(DEFAULT_MINIMUMS.domainCount) },
      'min-github': { type: 'string', default: String(DEFAULT_MINIMUMS.githubRepoCount) },
      retries: { type: 'string', default: '3' },
      'timeout-ms': { type: 'string', default: '30000' },
    },
    strict: true,
  });
  if (Boolean(values['formula-file']) !== Boolean(values['cask-file'])) {
    throw new Error('--formula-file and --cask-file must be provided together');
  }
  return values;
}

async function loadSourceFile(path, label) {
  const source = await readFile(resolve(path), 'utf8');
  return { data: parseJsonArray(source, label), source };
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseCli(argv);
  const retries = numberOption(options.retries, 'retries');
  const timeoutMs = numberOption(options['timeout-ms'], 'timeout-ms');
  let formulaInput;
  let caskInput;

  if (options['formula-file']) {
    console.log('Reading Homebrew API data from local files...');
    [formulaInput, caskInput] = await Promise.all([
      loadSourceFile(options['formula-file'], 'formula input'),
      loadSourceFile(options['cask-file'], 'cask input'),
    ]);
  } else {
    console.log('Fetching Homebrew API data...');
    [formulaInput, caskInput] = await Promise.all([
      fetchJson(FORMULA_API, { retries, timeoutMs }),
      fetchJson(CASK_API, { retries, timeoutMs }),
    ]);
  }

  validateItems(formulaInput.data, 'formula');
  validateItems(caskInput.data, 'cask');
  console.log(`Loaded ${formulaInput.data.length} formulae, ${caskInput.data.length} casks`);

  if (options['input-dir']) {
    const inputDir = resolve(options['input-dir']);
    await mkdir(inputDir, { recursive: true });
    await Promise.all([
      writeFile(join(inputDir, 'formula.json'), formulaInput.source),
      writeFile(join(inputDir, 'cask.json'), caskInput.source),
    ]);
  }

  const requestedBuildTime = options['build-time'] || (
    process.env.SOURCE_DATE_EPOCH
      ? Number(process.env.SOURCE_DATE_EPOCH) * 1000
      : undefined
  );
  const buildTime = requestedBuildTime !== undefined
    ? new Date(requestedBuildTime).toISOString()
    : new Date().toISOString();
  const artifacts = createBuildArtifacts(formulaInput.data, caskInput.data, {
    buildTime,
    inputSources: { formulae: formulaInput.source, casks: caskInput.source },
  });

  let baseline;
  if (options['baseline-metadata']) {
    baseline = JSON.parse(await readFile(resolve(options['baseline-metadata']), 'utf8'));
  }
  validateBuildCounts(artifacts.metadata, {
    baseline,
    maxChangePercent: numberOption(
      options['max-count-change-percent'],
      'max-count-change-percent',
    ),
    minimums: {
      formulaCount: numberOption(options['min-formula'], 'min-formula'),
      caskCount: numberOption(options['min-cask'], 'min-cask'),
      domainCount: numberOption(options['min-domain'], 'min-domain'),
      githubRepoCount: numberOption(options['min-github'], 'min-github'),
    },
  });

  const outputDir = resolve(options['output-dir']);
  await mkdir(outputDir, { recursive: true });
  await Promise.all([
    writeFile(join(outputDir, 'domain-map.json'), artifacts.domainMapJson),
    writeFile(join(outputDir, 'github-map.json'), artifacts.githubMapJson),
    writeFile(join(outputDir, 'metadata.json'), artifacts.metadataJson),
  ]);

  console.log(`Done! ${artifacts.metadata.domainCount} domains, ${artifacts.metadata.githubRepoCount} GitHub repos`);
  console.log(`Skipped ${artifacts.metadata.skippedCount} items`);
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch(error => {
    console.error('Build failed:', error.message);
    process.exit(1);
  });
}
